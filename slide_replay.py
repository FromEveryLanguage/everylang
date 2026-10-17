"""Record and replay the slide feed's ``FeedSnapshot`` stream (issue #70, Proclaim slice).

A live ``SlideFeed`` (e.g. ``ProclaimFeed``) emits one ``FeedSnapshot`` per poll. Recording
that stream **at the feed boundary** — never the Yjs doc — captures exactly the *stimulus* the
consumers react to, so it can later be replayed to drive the **real** consumers with no
Proclaim (or even no network) in the loop. This is the "simulated proclaim" mode of the replay
harness, and the basis for a consumer regression test.

Two roles share one dead-simple on-disk format (JSONL, one record per line):

- ``RecordingSlideFeed`` wraps a live feed and appends each polled snapshot; drop it in via
  ``proclaim_service.py --record PATH`` during a live service. It changes nothing the consumers
  see — the same snapshot is returned unmodified.
- ``ReplaySlideFeed`` re-emits a recorded stream *as* a ``SlideFeed``, honoring the recorded
  inter-snapshot timing (scaled), so the ordinary pusher can replay a fixture against a real
  server unchanged (``proclaim_service.py --replay PATH``).

The consumers now live on the server, so the offline consumer regression replays the
committed fixture there (``slideSnapshotRoutes.test.ts``).

Record line schema (one JSON object per line)::

    {"ts": <float epoch seconds>, "snapshot": {<FeedSnapshot.to_json()>}}

``ts`` is the wall-clock time the snapshot was produced. Only inter-record *deltas* matter on
replay (absolute times are normalized to the first record), matching issue #70's "timestamps
recorded absolute, normalized to service-relative on replay."

Like ``slide_feed``, this module is dependency-light and has **no import-time side effects**,
so it imports cleanly in tests without a configured environment.
"""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass
from pathlib import Path
from typing import (
    Any,
    Awaitable,
    Callable,
    Dict,
    List,
    Optional,
    Union,
)

import anyio

from slide_feed import FeedSnapshot, SessionInfo, SlideFeed

logger = logging.getLogger(__name__)

PathLike = Union[str, Path]


@dataclass(frozen=True)
class SnapshotRecord:
    """One recorded line: a snapshot plus the wall-clock time it was produced."""

    ts: float
    snapshot: FeedSnapshot

    def to_json_line(self) -> str:
        return json.dumps({'ts': self.ts, 'snapshot': self.snapshot.to_json()})

    @classmethod
    def from_json_obj(cls, obj: Dict[str, Any]) -> 'SnapshotRecord':
        return cls(ts=float(obj['ts']), snapshot=FeedSnapshot.from_json(obj['snapshot']))


def load_records(path: PathLike) -> List[SnapshotRecord]:
    """Load a recorded snapshot stream (JSONL). Blank lines are skipped."""
    records: List[SnapshotRecord] = []
    with open(path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            records.append(SnapshotRecord.from_json_obj(json.loads(line)))
    return records


def write_records(path: PathLike, records: List[SnapshotRecord]) -> None:
    """Write a snapshot stream to a JSONL file (used to author/regenerate fixtures)."""
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    with open(target, 'w', encoding='utf-8') as f:
        for record in records:
            f.write(record.to_json_line() + '\n')


class RecordingSlideFeed:
    """A ``SlideFeed`` that transparently records every snapshot the wrapped feed produces.

    Delegates ``poll``/``reset`` to the inner feed and appends the polled snapshot to a JSONL
    file as a side effect. The file is opened lazily on first poll, in append mode, and flushed
    per line, so a recording survives a crash and can be tailed live. A write failure is logged
    and swallowed — recording must never take the live service down.
    """

    def __init__(
        self,
        feed: SlideFeed,
        path: PathLike,
        *,
        clock: Callable[[], float] = time.time,
    ):
        self._feed = feed
        self._path = Path(path)
        self._clock = clock
        self._file: Optional[Any] = None

    def _ensure_open(self) -> Any:
        if self._file is None:
            self._path.parent.mkdir(parents=True, exist_ok=True)
            self._file = open(self._path, 'a', encoding='utf-8')
            logger.info(f"Recording slide feed snapshots to {self._path}")
        return self._file

    async def poll(self) -> FeedSnapshot:
        snap = await self._feed.poll()
        try:
            f = self._ensure_open()
            f.write(SnapshotRecord(self._clock(), snap).to_json_line() + '\n')
            f.flush()
        except OSError as e:
            logger.warning(f"Failed to record snapshot (continuing live): {e}")
        return snap

    def reset(self) -> None:
        self._feed.reset()

    def close(self) -> None:
        if self._file is not None:
            self._file.close()
            self._file = None


def _off_air_after(records: List[SnapshotRecord]) -> FeedSnapshot:
    """The off-air snapshot returned once a replay is exhausted (carries the last session)."""
    session: Optional[SessionInfo] = records[-1].snapshot.session if records else None
    return FeedSnapshot(on_air=False, session=session)


class ReplaySlideFeed:
    """Re-emit a recorded snapshot stream as a ``SlideFeed``.

    Honors the recorded inter-snapshot timing (scaled by ``time_scale``) so a replay against a
    real Y-Sweet reproduces the original slide-change cadence; ``time_scale=0`` replays as fast
    as possible (used by tests). When the stream is exhausted it reports off air — the natural
    "service ended" — and it keeps returning off air
    thereafter. ``reset`` is a no-op: a replay is a fixed stream, not a live source with caches.

    ``clock``/``sleep`` are injectable so timing can be driven deterministically in tests.
    """

    def __init__(
        self,
        records: List[SnapshotRecord],
        *,
        time_scale: float = 1.0,
        clock: Callable[[], float] = anyio.current_time,
        sleep: Callable[[float], Awaitable[None]] = anyio.sleep,
    ):
        self._records = list(records)
        self._time_scale = time_scale
        self._clock = clock
        self._sleep = sleep
        self._index = 0
        self._start_wall = self._records[0].ts if self._records else 0.0
        self._start_mono: Optional[float] = None

    async def poll(self) -> FeedSnapshot:
        if self._index >= len(self._records):
            return _off_air_after(self._records)

        record = self._records[self._index]
        if self._start_mono is None:
            self._start_mono = self._clock()

        # Sleep until this record's scheduled offset from the first record (scaled).
        target_offset = (record.ts - self._start_wall) * self._time_scale
        elapsed = self._clock() - self._start_mono
        delay = target_offset - elapsed
        if delay > 0:
            await self._sleep(delay)

        self._index += 1
        return record.snapshot

    def reset(self) -> None:
        pass

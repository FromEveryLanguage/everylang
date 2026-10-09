"""Tests for the record/replay slice of the replay harness (issue #70, Proclaim slice).

Covers the three roles in ``slide_replay``:
- ``RecordingSlideFeed`` transparently records what a live feed emits (round-trips through JSON).
- ``ReplaySlideFeed`` re-emits a recording as a ``SlideFeed``, honoring scaled timing.

The consumers now live on the server; ``slideSnapshotRoutes.test.ts`` replays the committed
fixture through them.
"""

import json
from pathlib import Path

import anyio
import pytest
from slide_feed import FeedItem, FeedSnapshot, SessionInfo
from slide_replay import (
    ReplaySlideFeed,
    RecordingSlideFeed,
    SnapshotRecord,
    load_records,
)

from tests.helpers import FakeFeed, on_air_snap, off_air_snap

pytestmark = pytest.mark.anyio

FIXTURE = Path(__file__).parent / 'fixtures' / 'synthetic_service.jsonl'


# -- RecordingSlideFeed --------------------------------------------------------


async def test_recording_feed_delegates_and_round_trips(tmp_path):
    """Recording returns the inner feed's snapshots unchanged and writes a loadable stream."""
    snaps = [on_air_snap(item='a', slide=0), on_air_snap(item='a', slide=1), off_air_snap()]
    inner = FakeFeed(list(snaps))
    path = tmp_path / 'rec.jsonl'

    ticks = iter([10.0, 11.0, 12.0])
    feed = RecordingSlideFeed(inner, path, clock=lambda: next(ticks))

    returned = [await feed.poll(), await feed.poll(), await feed.poll()]
    feed.close()

    # The wrapper is transparent: the consumer sees exactly the inner feed's snapshots.
    assert [s.to_json() for s in returned] == [s.to_json() for s in snaps]

    records = load_records(path)
    assert [r.ts for r in records] == [10.0, 11.0, 12.0]
    assert [r.snapshot.to_json() for r in records] == [s.to_json() for s in snaps]

    # reset() delegates to the inner feed.
    feed.reset()
    assert inner.reset_called == 1


async def test_recording_feed_appends_across_reopen(tmp_path):
    """Append mode: a second recorder run adds to the same file rather than truncating it."""
    path = tmp_path / 'rec.jsonl'
    first = RecordingSlideFeed(FakeFeed([on_air_snap(item='a')]), path, clock=lambda: 1.0)
    await first.poll()
    first.close()

    second = RecordingSlideFeed(FakeFeed([on_air_snap(item='b')]), path, clock=lambda: 2.0)
    await second.poll()
    second.close()

    records = load_records(path)
    assert [r.snapshot.active_item_id for r in records] == ['a', 'b']


# -- ReplaySlideFeed -----------------------------------------------------------


def _rec(ts, snap):
    return SnapshotRecord(ts, snap)


async def test_replay_feed_honors_scaled_timing():
    """poll() sleeps the recorded inter-record deltas (× time_scale); first record has no delay."""
    records = [
        _rec(100.0, on_air_snap(item='a', slide=0)),
        _rec(103.0, on_air_snap(item='a', slide=1)),
        _rec(104.0, on_air_snap(item='b', slide=0)),
    ]
    slept = []

    async def fake_sleep(d):
        slept.append(d)

    feed = ReplaySlideFeed(records, time_scale=2.0, clock=lambda: 1000.0, sleep=fake_sleep)

    first = await feed.poll()
    second = await feed.poll()
    third = await feed.poll()

    assert first.active_slide_index == 0
    assert second.active_slide_index == 1
    assert third.active_item_id == 'b'
    # Deltas 3s and 4s from the first record, scaled ×2 (clock is frozen so no elapsed offset).
    assert slept == [6.0, 8.0]


async def test_replay_feed_reports_off_air_when_exhausted():
    """Once the stream runs out the feed reports off air (carrying the last session)."""
    records = [_rec(1.0, on_air_snap(item='a', session_date=None, presentation_id='p'))]
    feed = ReplaySlideFeed(records, time_scale=0.0)

    live = await feed.poll()
    assert live.on_air is True

    ended = await feed.poll()
    assert ended.on_air is False
    assert ended.session is not None and ended.session.presentation_id == 'p'


async def test_replay_feed_empty_is_off_air():
    feed = ReplaySlideFeed([], time_scale=0.0)
    snap = await feed.poll()
    assert snap.on_air is False


def test_synthetic_fixture_loads_and_round_trips():
    """The committed fixture (which the server-side replay test drives) stays loadable."""
    records = load_records(FIXTURE)
    assert records and records[0].snapshot.on_air is False
    for record in records:
        assert SnapshotRecord.from_json_obj(json.loads(record.to_json_line())) == record

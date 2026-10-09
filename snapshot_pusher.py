"""Hand each slide-feed snapshot to the server (ADR-001).

The service used to be a Yjs client: it held a websocket to Y-Sweet, wrote the slide maps
itself, and decided when to pay for a translation by reading a replica that might not have
synced yet. All of that now happens on the server, next to its own synced connection. What
is left here is the part only this machine can do — read Proclaim — and a POST.

Each snapshot is the *full* state (``FeedSnapshot``), so a lost, repeated or retried POST is
harmless and there is nothing to resynchronize after a drop. It is sent when it differs from
the last one sent, and otherwise every ``heartbeat_interval`` so the server (and ``/status``)
can tell a quiet service from a dead one. A failed POST is retried with backoff, forever:
the invariant is the launch wrapper's — keep running — and the next success fixes
everything, because it carries everything.

The server answers with the doc the slides went to and whether this machine is the one
being followed. Both are logged when they change; neither changes what this loop does.
"""

from __future__ import annotations

import json
import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Dict, Optional

import anyio
import httpx

from slide_feed import FeedSnapshot, SlideFeed
from write_key import write_key_headers

logger = logging.getLogger(__name__)

#: ``(url, body, headers) -> answer``; the seam tests use instead of a real server.
PostFn = Callable[[str, Dict[str, Any], Dict[str, str]], Awaitable[Dict[str, Any]]]


@dataclass
class PusherTiming:
    poll_interval: float = 0.5           # on-air poll cadence
    poll_interval_off_air: float = 10.0  # off-air poll cadence
    heartbeat_interval: float = 10.0     # resend an unchanged snapshot this often
    backoff_initial: float = 1.0
    backoff_max: float = 30.0
    request_timeout: float = 15.0


def _content_key(snap: FeedSnapshot) -> str:
    """What makes two snapshots "the same" for sending purposes: everything but ``seq``."""
    body = snap.to_json()
    body.pop('seq', None)
    return json.dumps(body, sort_keys=True)


class HttpSnapshotPusher:
    def __init__(
        self,
        feed: SlideFeed,
        server_url: str,
        *,
        write_key: Optional[str] = None,
        service_info: Optional[Dict[str, Any]] = None,
        doc_id: Optional[str] = None,
        timing: Optional[PusherTiming] = None,
        post: Optional[PostFn] = None,
        report_exception: Optional[Callable[[Exception], None]] = None,
    ):
        self.feed = feed
        self.url = f"{server_url.rstrip('/')}/api/proclaim/snapshot"
        self.write_key = write_key
        # A per-process nonce: the server uses it to tell a restart of this machine (its
        # `seq` starts over) from a late retry (an old `seq` that must not roll slides back).
        self.service = {
            **(service_info or {}),
            'instance': uuid.uuid4().hex,
            'startedAt': datetime.now(timezone.utc).isoformat(),
        }
        # An explicit doc (replay into a throwaway doc, or the operator overriding the
        # server). Otherwise the server decides, and tells us.
        self.doc_id = doc_id
        self.timing = timing or PusherTiming()
        self._post = post or self._http_post
        self._report_exception = report_exception or (lambda _e: None)
        self._last_answer: Optional[Dict[str, Any]] = None
        # When this process first saw Proclaim on air (None while off air). With two machines
        # on air the server follows the later one, so this is the "show mine" signal. Not kept
        # across restarts: a restarted service counts as going on air again.
        self._on_air_since: Optional[str] = None
        self._last_standing: Optional[tuple] = None
        # One client for the life of run(), so a slide change reuses the open connection
        # instead of paying a fresh TCP + TLS handshake. A dropped connection surfaces as an
        # httpx error, which the retry loop already handles; the pool reconnects next time.
        self._client: Optional[httpx.AsyncClient] = None

    async def _http_post(self, url: str, body: Dict[str, Any], headers: Dict[str, str]) -> Dict[str, Any]:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=self.timing.request_timeout)
        response = await self._client.post(url, json=body, headers=headers)
        response.raise_for_status()
        answer = response.json()
        if not isinstance(answer, dict):
            raise ValueError(f"{url} answered with something that isn't a JSON object")
        return answer

    def _note_on_air(self, snap: FeedSnapshot) -> None:
        if not snap.on_air:
            self._on_air_since = None
        elif self._on_air_since is None:
            self._on_air_since = datetime.now(timezone.utc).isoformat()

    def body_for(self, snap: FeedSnapshot) -> Dict[str, Any]:
        self._note_on_air(snap)
        session_date = snap.session.session_date if snap.session else None
        body: Dict[str, Any] = {
            'snapshot': snap.to_json(),
            'onAirSince': self._on_air_since,
            'proposal': {'sessionDate': session_date.isoformat() if session_date else None},
            'service': self.service,
        }
        if self.doc_id:
            body['docId'] = self.doc_id
        return body

    async def push(self, snap: FeedSnapshot) -> Dict[str, Any]:
        """Send one snapshot; raises on any failure (the caller retries)."""
        answer = await self._post(self.url, self.body_for(snap), write_key_headers(self.write_key))
        self._log_answer(answer, snap.on_air)
        return answer

    def _log_answer(self, answer: Dict[str, Any], on_air: bool) -> None:
        """Say what the server did with our slides — but only when that changes."""
        prev = self._last_answer or {}
        self._last_answer = answer
        if answer.get('docId') != prev.get('docId'):
            outcome = answer.get('outcome')
            why = f"{answer.get('source')}" + (f", proposal {outcome}" if outcome else '')
            logger.info(f"Slides are going to {answer.get('docId')} ({why})")
        # Off air there is nothing to follow, so only an on-air machine's standing is news.
        standing = (answer.get('active'), answer.get('followed')) if on_air else None
        prev_standing, self._last_standing = self._last_standing, standing
        if standing is not None and standing != prev_standing:
            if answer.get('active'):
                logger.info("This machine is the slide source being followed")
            else:
                logger.warning(
                    f"{answer.get('followed')} went on air after this machine, so its slides are "
                    "the ones shown (take it off air to switch back)"
                )

    async def run(self) -> None:
        """Poll the feed and push snapshots until cancelled. Never returns on an error."""
        logger.info(f"Pushing slide snapshots to {self.url}")
        try:
            await self._run()
        finally:
            if self._client is not None:
                with anyio.CancelScope(shield=True):
                    await self._client.aclose()
                self._client = None

    async def _run(self) -> None:
        last_key: Optional[str] = None
        last_sent = float('-inf')
        backoff = self.timing.backoff_initial
        while True:
            snap = await self.feed.poll()
            key = _content_key(snap)
            now = anyio.current_time()
            if key != last_key or now - last_sent >= self.timing.heartbeat_interval:
                try:
                    await self.push(snap)
                    last_key, last_sent = key, now
                    backoff = self.timing.backoff_initial
                except (httpx.HTTPError, ValueError) as e:
                    detail = (
                        f"HTTP {e.response.status_code}" if isinstance(e, httpx.HTTPStatusError)
                        else repr(e)
                    )
                    if isinstance(e, httpx.HTTPStatusError) and e.response.status_code == 401:
                        detail += " — the server refused this machine's write key"
                    logger.warning(f"Could not send snapshot ({detail}); retrying in {backoff:.0f}s")
                    await anyio.sleep(backoff)
                    backoff = min(backoff * 2, self.timing.backoff_max)
                    continue
                except Exception as e:  # never let one bad cycle end the service
                    logger.error(f"Unexpected error sending snapshot: {e}", exc_info=True)
                    self._report_exception(e)
                    await anyio.sleep(backoff)
                    backoff = min(backoff * 2, self.timing.backoff_max)
                    continue
            await anyio.sleep(
                self.timing.poll_interval if snap.on_air else self.timing.poll_interval_off_air
            )

"""The service's whole job toward the server: send each snapshot, keep sending through failures.

The server side (what is done with a snapshot) is tested in TypeScript; these pin down the
cadence and the wire body, with an injected ``post`` standing in for the server.
"""

from datetime import date

import anyio
import httpx
import pytest

from snapshot_pusher import HttpSnapshotPusher, PusherTiming
from tests.helpers import FakeFeed, off_air_snap, on_air_snap

pytestmark = pytest.mark.anyio

FAST = PusherTiming(
    poll_interval=0.001,
    poll_interval_off_air=0.001,
    heartbeat_interval=60.0,
    backoff_initial=0.001,
    backoff_max=0.002,
)


class FakeServer:
    """Records what was posted; fails the first ``fail_first`` requests."""

    def __init__(self, fail_first: int = 0):
        self.bodies = []
        self.fail_first = fail_first
        self.attempts = 0

    async def __call__(self, url, body, headers):
        self.attempts += 1
        if self.attempts <= self.fail_first:
            raise httpx.ConnectError("server down")
        self.bodies.append(body)
        return {"docId": "doc-2030-01-15", "source": "proposal", "outcome": "accepted", "active": True}


async def run_for(pusher, seconds=0.05):
    with anyio.move_on_after(seconds):
        await pusher.run()


def with_seq(snap, seq):
    from dataclasses import replace
    return replace(snap, seq=seq)


async def test_body_carries_snapshot_proposal_and_identity():
    server = FakeServer()
    snap = on_air_snap(session_date=date(2030, 1, 15))
    pusher = HttpSnapshotPusher(
        FakeFeed([snap]), "http://server/", service_info={"gitShaShort": "abc1234"}, post=server
    )
    await pusher.push(snap)

    body = server.bodies[0]
    assert body["snapshot"] == snap.to_json()
    assert body["proposal"] == {"sessionDate": "2030-01-15"}
    assert body["service"]["gitShaShort"] == "abc1234"
    assert body["service"]["instance"]  # a per-process nonce
    assert "docId" not in body  # the server decides


async def test_explicit_doc_rides_along():
    server = FakeServer()
    pusher = HttpSnapshotPusher(FakeFeed([on_air_snap()]), "http://s", doc_id="doc-test-1", post=server)
    await pusher.push(on_air_snap())
    assert server.bodies[0]["docId"] == "doc-test-1"


async def test_sends_on_change_only_ignoring_seq():
    server = FakeServer()
    snaps = [with_seq(on_air_snap(slide=0), 1), with_seq(on_air_snap(slide=0), 2),
             with_seq(on_air_snap(slide=1), 3)]
    await run_for(HttpSnapshotPusher(FakeFeed(snaps), "http://s", timing=FAST, post=server))
    # Two distinct states (slide 0, slide 1); the repeat of slide 0 is not resent.
    assert [b["snapshot"]["activeSlideIndex"] for b in server.bodies] == [0, 1]


async def test_resends_unchanged_state_as_a_heartbeat():
    server = FakeServer()
    timing = PusherTiming(**{**FAST.__dict__, "heartbeat_interval": 0.0})
    await run_for(HttpSnapshotPusher(FakeFeed([on_air_snap()]), "http://s", timing=timing, post=server))
    assert len(server.bodies) > 1


async def test_off_air_snapshots_are_sent_too():
    server = FakeServer()
    await run_for(HttpSnapshotPusher(FakeFeed([off_air_snap()]), "http://s", timing=FAST, post=server))
    assert server.bodies and server.bodies[0]["snapshot"]["onAir"] is False


async def test_keeps_retrying_through_a_server_outage():
    server = FakeServer(fail_first=3)
    await run_for(HttpSnapshotPusher(FakeFeed([on_air_snap()]), "http://s", timing=FAST, post=server))
    assert server.attempts > 3
    assert len(server.bodies) == 1  # delivered once it came back; then nothing new to say


async def test_an_unexpected_error_is_reported_not_fatal():
    reported = []
    calls = 0

    async def post(url, body, headers):
        nonlocal calls
        calls += 1
        if calls == 1:
            raise RuntimeError("bug")
        return {"docId": "d", "active": True}

    pusher = HttpSnapshotPusher(
        FakeFeed([on_air_snap()]), "http://s", timing=FAST, post=post,
        report_exception=reported.append,
    )
    await run_for(pusher)
    assert len(reported) == 1 and calls >= 2

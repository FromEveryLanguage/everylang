"""Tests for ProclaimFeed: snapshot production, revision-gated re-parse, session date,
and existing-translation grounding. The Proclaim HTTP calls and DB are faked."""

from datetime import date
from unittest import mock

import pytest

import proclaim_feed as pf
from proclaim_feed import ProclaimFeed
from proclaim_lib import ServiceItemWithSlides

pytestmark = pytest.mark.anyio


def make_feed(order_sync_interval: float = 0.0, revision_settle_window: float = 0.0) -> ProclaimFeed:
    """Build a feed with the DB faked and the order always eligible to sync.

    The settle window defaults to 0 here so tests that aren't about it see exactly one
    re-parse per revision change.
    """
    db = mock.MagicMock()
    db.get_presentation.return_value = None
    return ProclaimFeed(
        db=db,
        order_sync_interval=order_sync_interval,
        revision_settle_window=revision_settle_window,
    )


def onair_status(item_id="i1", slide_index=0, presentation_id="pres-1"):
    return {"status": {"itemId": item_id, "slideIndex": slide_index}, "presentationId": presentation_id}


def presentation_with(items):
    return {"serviceItems": items}


async def test_poll_off_air_returns_empty_pointer_snapshot():
    """When Proclaim is off air, poll() reports on_air=False and no active pointer."""
    feed = make_feed()
    feed._fetch_status = mock.AsyncMock(return_value=None)

    snap = await feed.poll()

    assert snap.on_air is False
    assert snap.active_item_id is None
    assert snap.active_slide_index is None


async def test_poll_syncs_order_and_caches_revisions():
    """poll() pushes every item's slides + order, re-parsing only changed revisions."""
    feed = make_feed(order_sync_interval=0.0)
    feed._fetch_status = mock.AsyncMock(return_value=onair_status())
    presentation = presentation_with([
        {"id": "i1", "title": "Call to Worship", "kind": "Content",
         "slides": [{"localRevision": 1}, {"localRevision": 2}]},
        {"id": "i2", "title": "Song", "kind": "SongLyrics", "slides": [{"localRevision": 9}]},
    ])
    feed._fetch_onair_presentation = mock.AsyncMock(return_value=presentation)

    parsed = {
        "i1": ServiceItemWithSlides("i1", "Call to Worship", ["A", "B"], "Content"),
        "i2": ServiceItemWithSlides("i2", "Song", ["C"], "SongLyrics"),
    }
    calls = []

    def fake_parse(_db, item_id):
        calls.append(item_id)
        return parsed[item_id]

    with mock.patch.object(pf, "parse_item_original", fake_parse):
        snap = await feed.poll()
        assert snap.order == ["i1", "i2"]
        assert snap.items["i1"].slides == ["A", "B"]
        assert snap.items["i1"].item_kind == "Content"
        assert snap.items["i1"].slides_hash
        assert calls == ["i1", "i2"]

        # Unchanged revisions => no re-parse.
        await feed.poll()
        assert calls == ["i1", "i2"]

        # Change i1's revision => only i1 is re-parsed.
        presentation["serviceItems"][0]["slides"][0]["localRevision"] = 5
        await feed.poll()
        assert calls == ["i1", "i2", "i1"]


def test_lagging_db_write_is_picked_up_within_settle_window():
    """The API bumps the revision before Proclaim writes the DB row: the first re-read sees
    the old Content, so the item keeps being re-read until the window closes."""
    feed = make_feed(revision_settle_window=10.0)
    presentation = presentation_with([
        {"id": "i1", "title": "Song", "kind": "SongLyrics", "slides": [{"localRevision": 1}]},
    ])
    db_slides = ["Verse"]
    calls = []

    def fake_parse(_db, item_id):
        calls.append(item_id)
        return ServiceItemWithSlides(item_id, "Song", list(db_slides), "SongLyrics")

    with mock.patch.object(pf, "parse_item_original", fake_parse):
        feed._sync_order(presentation, now=0.0)
        # Past the first sighting's window: settled, no re-read.
        feed._sync_order(presentation, now=20.0)
        assert len(calls) == 1

        # Operator adds a title slide: revision moves, DB still has the old row.
        presentation["serviceItems"][0]["slides"].append({"localRevision": 2})
        feed._sync_order(presentation, now=30.0)
        assert feed._items["i1"].slides == ["Verse"]

        # DB catches up; the same revision is re-read inside the window.
        db_slides[:] = ["Song", "Verse"]
        feed._sync_order(presentation, now=32.0)
        assert feed._items["i1"].slides == ["Song", "Verse"]
        assert len(calls) == 3

        # Window closed: back to trusting the revision.
        feed._sync_order(presentation, now=41.0)
        feed._sync_order(presentation, now=43.0)
        assert len(calls) == 3


def test_settle_window_restarts_on_each_revision_change():
    """A second edit inside the window extends re-reading from that edit."""
    feed = make_feed(revision_settle_window=10.0)
    presentation = presentation_with([
        {"id": "i1", "title": "X", "kind": "Content", "slides": [{"localRevision": 1}]},
    ])
    calls = []

    def fake_parse(_db, item_id):
        calls.append(item_id)
        return ServiceItemWithSlides(item_id, "X", ["A"], "Content")

    with mock.patch.object(pf, "parse_item_original", fake_parse):
        feed._sync_order(presentation, now=0.0)
        presentation["serviceItems"][0]["slides"][0]["localRevision"] = 2
        feed._sync_order(presentation, now=8.0)
        feed._sync_order(presentation, now=15.0)  # inside the window opened at 8
        assert len(calls) == 3
        feed._sync_order(presentation, now=18.0)
        assert len(calls) == 3


async def test_poll_force_syncs_when_active_item_uncached():
    """Even before the throttle elapses, an unseen active item forces an order fetch."""
    feed = make_feed(order_sync_interval=999.0)  # throttle would otherwise block a sync
    feed._fetch_status = mock.AsyncMock(return_value=onair_status(item_id="i1"))
    presentation = presentation_with([
        {"id": "i1", "title": "X", "kind": "Content", "slides": [{"localRevision": 1}]},
    ])
    feed._fetch_onair_presentation = mock.AsyncMock(return_value=presentation)

    with mock.patch.object(
        pf, "parse_item_original",
        lambda _db, i: ServiceItemWithSlides(i, "X", ["A"], "Content"),
    ):
        snap = await feed.poll()

    assert "i1" in snap.items
    feed._fetch_onair_presentation.assert_awaited()


async def test_poll_carries_session_date_from_date_given():
    """The snapshot's session reflects the show's DateGiven, read once per presentation."""
    feed = make_feed(order_sync_interval=999.0)
    feed._fetch_status = mock.AsyncMock(return_value=onair_status(presentation_id="pres-1"))
    feed._fetch_onair_presentation = mock.AsyncMock(return_value=None)
    feed.db.get_presentation.return_value = {"date_given": "2030-01-15", "content": {}}

    snap = await feed.poll()

    assert snap.session.presentation_id == "pres-1"
    assert snap.session.session_date == date(2030, 1, 15)


def test_update_session_reads_date_given_once_per_presentation():
    """Session date is cached per presentation id (no repeated DB reads)."""
    feed = make_feed()
    feed.db.get_presentation.return_value = {"date_given": "2030-01-15", "content": {}}

    feed._update_session("pres-1")
    feed._update_session("pres-1")

    assert feed._session.session_date == date(2030, 1, 15)
    assert feed.db.get_presentation.call_count == 1


def test_existing_translation_screen_idx_cached_per_presentation():
    """The translation-screen index is computed once per presentation, reused per item."""
    feed = make_feed()
    feed._presentation_id = "pres-1"
    feed.db.get_presentation = mock.MagicMock(return_value={"content": {"VirtualScreens": "[]"}})

    with mock.patch.object(pf, "get_translation_screen_idx", return_value=2) as gti, \
         mock.patch.object(pf, "existing_translation_text", side_effect=lambda db, item, idx: f"{item}:{idx}"):
        assert feed._existing_translation_for("i1") == "i1:2"
        assert feed._existing_translation_for("i2") == "i2:2"

    assert gti.call_count == 1
    assert feed.db.get_presentation.call_count == 1


def test_existing_translation_stamped_on_feed_item():
    """_to_feed_item pulls the item's existing translation onto the FeedItem."""
    feed = make_feed()
    feed._presentation_id = "pres-1"
    feed.db.get_presentation = mock.MagicMock(return_value={"content": {"VirtualScreens": "[]"}})

    with mock.patch.object(pf, "get_translation_screen_idx", return_value=1), \
         mock.patch.object(pf, "existing_translation_text", return_value="Bonjou"):
        item = feed._to_feed_item(ServiceItemWithSlides("i1", "Song", ["Hello"], "Content"))

    assert item.existing_translation == "Bonjou"
    assert item.slides_hash


def test_parse_date_given_variants():
    """DateGiven parsing accepts plain dates (and a stray time), rejects junk."""
    parse = ProclaimFeed._parse_date_given
    assert parse("2025-03-02") == date(2025, 3, 2)
    assert parse("2025-03-02T10:30:00") == date(2025, 3, 2)
    assert parse("2025-03-02 10:30") == date(2025, 3, 2)
    assert parse("") is None
    assert parse("not-a-date") is None
    assert parse(None) is None


def test_reset_clears_caches():
    """reset() drops parsed items, revisions, order, session, and screen-idx caches."""
    feed = make_feed()
    feed._items = {"i1": object()}
    feed._item_revisions = {"i1": "r"}
    feed._settling_until = {"i1": 5.0}
    feed._order = ["i1"]
    feed._session_pres_id = "pres-1"
    feed._translation_screen_idx = 3

    feed.reset()

    assert feed._items == {}
    assert feed._item_revisions == {}
    assert feed._settling_until == {}
    assert feed._order == []
    assert feed._session_pres_id is None
    assert feed._translation_screen_idx is None

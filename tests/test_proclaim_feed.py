"""Tests for ProclaimFeed: snapshot production, revision-gated re-parse, session date,
and existing-translation grounding. The Proclaim HTTP calls and DB are faked."""

from datetime import date, datetime, timezone
from unittest import mock

import pytest

import proclaim_feed as pf
from proclaim_feed import ProclaimFeed
from proclaim_lib import ServiceItemWithSlides

pytestmark = pytest.mark.anyio


def make_feed(order_sync_interval: float = 0.0, revision_settle_timeout: float = 0.0) -> ProclaimFeed:
    """Build a feed with the DB faked and the order always eligible to sync.

    The settle timeout defaults to 0 here so tests that aren't about it see exactly one
    re-parse per revision change.
    """
    db = mock.MagicMock()
    db.get_presentation.return_value = None
    return ProclaimFeed(
        db=db,
        order_sync_interval=order_sync_interval,
        revision_settle_timeout=revision_settle_timeout,
    )


def ticks(iso: str) -> int:
    """A UTC ISO time as .NET ticks, the unit of Proclaim's localRevision."""
    moment = datetime.fromisoformat(iso).replace(tzinfo=timezone.utc)
    return 621355968000000000 + round(moment.timestamp() * 10_000_000)


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


class FakeRow:
    """The ServiceItems row an edit is racing: its slides and Modified, set by the test."""

    def __init__(self, slides, modified):
        self.slides = list(slides)
        self.modified = modified
        self.reads = 0

    def parse(self, _db, item_id):
        self.reads += 1
        return ServiceItemWithSlides(item_id, "Song", list(self.slides), "SongLyrics", self.modified)


def song_at(*revision_isos):
    return presentation_with([
        {"id": "i1", "title": "Song", "kind": "SongLyrics",
         "slides": [{"localRevision": ticks(iso)} for iso in revision_isos]},
    ])


def test_lagging_db_write_is_reread_until_modified_catches_up():
    """Timings from a real edit (2026-11-16): the API's revision moved to 22:11:40.574 while
    the row still said Modified 22:02:47; the row landed a second or two later as 22:11:40.
    The item is re-read until then, and not after."""
    feed = make_feed(revision_settle_timeout=30.0)
    row = FakeRow(["Verse"], "2026-11-16T22:02:47Z")

    with mock.patch.object(pf, "parse_item_original", row.parse):
        feed._sync_order(song_at("2026-11-16T22:02:47.456"), now=0.0)
        feed._sync_order(song_at("2026-11-16T22:02:47.456"), now=2.0)
        assert row.reads == 1

        # The operator edits: the API moves, the row hasn't been written yet.
        edited = song_at("2026-11-16T22:11:40.574")
        feed._sync_order(edited, now=10.0)
        feed._sync_order(edited, now=12.0)
        assert feed._items["i1"].slides == ["Verse"]
        assert row.reads == 3

        # The row lands, in the same (whole) second as the revision.
        row.slides, row.modified = ["Song", "Verse"], "2026-11-16T22:11:40Z"
        feed._sync_order(edited, now=14.0)
        assert feed._items["i1"].slides == ["Song", "Verse"]

        # Settled on evidence, long before the timeout: no more re-reads.
        feed._sync_order(edited, now=16.0)
        assert row.reads == 4


def test_row_already_written_settles_on_the_first_reread():
    """If the row has landed by the time the revision change is seen, one read is enough."""
    feed = make_feed(revision_settle_timeout=30.0)
    row = FakeRow(["Verse"], "2026-11-16T22:02:47Z")

    with mock.patch.object(pf, "parse_item_original", row.parse):
        feed._sync_order(song_at("2026-11-16T22:02:47.456"), now=0.0)
        row.modified = "2026-11-16T22:11:40Z"
        feed._sync_order(song_at("2026-11-16T22:11:40.574"), now=10.0)
        feed._sync_order(song_at("2026-11-16T22:11:40.574"), now=12.0)
        assert row.reads == 2


def test_title_slide_toggle_settles_when_modified_changes():
    """Timings from a real title-slide toggle (2026-11-16): the API's revision moved to
    23:05:19.898, but the row that landed said Modified 23:05:18, before the revision, so
    "Modified reached the revision" never comes true. Modified *changing* (from 23:05:02)
    is what shows the row landed."""
    feed = make_feed(revision_settle_timeout=30.0)
    row = FakeRow(["Title", "Verse"], "2026-11-16T23:05:02Z")

    with mock.patch.object(pf, "parse_item_original", row.parse):
        feed._sync_order(song_at("2026-11-16T23:05:02.500"), now=0.0)

        toggled = song_at("2026-11-16T23:05:19.898")
        feed._sync_order(toggled, now=10.0)
        feed._sync_order(toggled, now=11.0)
        assert feed._items["i1"].slides == ["Title", "Verse"]
        assert "i1" in feed._awaiting

        row.slides, row.modified = ["Verse"], "2026-11-16T23:05:18Z"
        feed._sync_order(toggled, now=12.0)
        assert feed._items["i1"].slides == ["Verse"]
        assert "i1" not in feed._awaiting

        feed._sync_order(toggled, now=13.0)
        assert row.reads == 4


def test_double_bump_before_the_row_lands_settles_on_the_one_write():
    """One real edit bumped the revision twice (22:11:39.275, then 22:11:40.574) before its
    single row write (Modified 22:11:40). The second bump restarts the wait; the write ends it."""
    feed = make_feed(revision_settle_timeout=30.0)
    row = FakeRow(["Verse"], "2026-11-16T22:02:47Z")

    with mock.patch.object(pf, "parse_item_original", row.parse):
        feed._sync_order(song_at("2026-11-16T22:02:47.456"), now=0.0)
        feed._sync_order(song_at("2026-11-16T22:11:39.275"), now=10.0)
        feed._sync_order(song_at("2026-11-16T22:11:40.574"), now=11.0)
        assert "i1" in feed._awaiting

        row.slides, row.modified = ["Verse 2"], "2026-11-16T22:11:40Z"
        feed._sync_order(song_at("2026-11-16T22:11:40.574"), now=13.0)
        assert "i1" not in feed._awaiting
        assert feed._items["i1"].slides == ["Verse 2"]


def test_another_edit_after_settling_waits_again():
    """Settling isn't permanent: the next revision change starts a new wait, measured
    against the Modified the feed last read."""
    feed = make_feed(revision_settle_timeout=30.0)
    row = FakeRow(["A"], "2026-11-16T22:02:47Z")

    with mock.patch.object(pf, "parse_item_original", row.parse):
        feed._sync_order(song_at("2026-11-16T22:02:47.456"), now=0.0)
        row.slides, row.modified = ["B"], "2026-11-16T22:11:40Z"
        feed._sync_order(song_at("2026-11-16T22:11:40.574"), now=10.0)
        assert "i1" not in feed._awaiting

        feed._sync_order(song_at("2026-11-16T22:20:00.100"), now=20.0)
        assert "i1" in feed._awaiting  # 22:11:40 is the baseline now; nothing new yet
        row.slides, row.modified = ["C"], "2026-11-16T22:19:59Z"
        feed._sync_order(song_at("2026-11-16T22:20:00.100"), now=22.0)
        assert "i1" not in feed._awaiting
        assert feed._items["i1"].slides == ["C"]


def test_timeout_ends_the_wait_when_modified_never_catches_up():
    """A revision bump with no row write can't settle on evidence (Modified neither changes
    nor reaches the revision); the timeout stops the re-reading."""
    feed = make_feed(revision_settle_timeout=30.0)
    row = FakeRow(["Verse"], "2026-11-16T22:02:47Z")

    with mock.patch.object(pf, "parse_item_original", row.parse):
        feed._sync_order(song_at("2026-11-16T22:02:47.456"), now=0.0)
        edited = song_at("2026-11-16T22:11:40.574")
        feed._sync_order(edited, now=10.0)
        feed._sync_order(edited, now=25.0)
        assert row.reads == 3
        feed._sync_order(edited, now=40.0)  # deadline: read once more, then stop
        feed._sync_order(edited, now=42.0)
        assert row.reads == 4
        assert "i1" not in feed._awaiting


def test_first_sighting_does_not_wait_on_a_stale_looking_modified():
    """Opening a presentation re-stamps every localRevision without rewriting the rows, so an
    unedited item's revision can be hours past its Modified. Seen for the first time, it is
    read once and trusted, not held waiting for a write that isn't coming."""
    feed = make_feed(revision_settle_timeout=30.0)
    row = FakeRow(["Gather"], "2026-11-16T18:04:39Z")

    with mock.patch.object(pf, "parse_item_original", row.parse):
        feed._sync_order(song_at("2026-11-16T21:50:31.352"), now=0.0)
        feed._sync_order(song_at("2026-11-16T21:50:31.352"), now=2.0)

    assert row.reads == 1
    assert feed._awaiting == {}


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
    feed._item_modified = {"i1": 0}
    feed._awaiting = {"i1": (0, 0, 5.0)}
    feed._order = ["i1"]
    feed._session_pres_id = "pres-1"
    feed._translation_screen_idx = 3

    feed.reset()

    assert feed._items == {}
    assert feed._item_revisions == {}
    assert feed._item_modified == {}
    assert feed._awaiting == {}
    assert feed._order == []
    assert feed._session_pres_id is None
    assert feed._translation_screen_idx is None

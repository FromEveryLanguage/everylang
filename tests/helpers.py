"""Shared test doubles: a scripted ``SlideFeed`` and canned snapshots, so no real
Proclaim (or server) is needed."""

from datetime import date
from typing import List, Optional

from slide_feed import FeedItem, FeedSnapshot, SessionInfo


class FakeFeed:
    """A scripted SlideFeed. Pops the next snapshot each poll; repeats the last when exhausted."""

    def __init__(self, snapshots: List[FeedSnapshot]):
        assert snapshots, "FakeFeed needs at least one snapshot"
        self._snapshots = list(snapshots)
        self.reset_called = 0

    async def poll(self) -> FeedSnapshot:
        if len(self._snapshots) > 1:
            return self._snapshots.pop(0)
        return self._snapshots[0]

    def reset(self) -> None:
        self.reset_called += 1


def on_air_snap(item="item-1", slide=0, slides=("A", "B"), session_date: Optional[date] = None,
                presentation_id="pres-1") -> FeedSnapshot:
    return FeedSnapshot(
        on_air=True,
        session=SessionInfo(presentation_id=presentation_id, session_date=session_date),
        order=[item],
        items={item: FeedItem(item, "Title", list(slides), "Content", "h", None)},
        active_item_id=item,
        active_slide_index=slide,
        seq=1,
    )


def off_air_snap() -> FeedSnapshot:
    return FeedSnapshot(on_air=False, session=None)

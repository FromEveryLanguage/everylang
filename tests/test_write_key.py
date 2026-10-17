"""Tests for the service's shared write key: reading it, and presenting it on the one
privileged call this service makes (the snapshot POST)."""

import pytest

from snapshot_pusher import HttpSnapshotPusher
from write_key import WRITE_KEY_HEADER, get_write_key, write_key_headers

from helpers import FakeFeed, on_air_snap


class TestWriteKeyHelpers:
    def test_headers_present_the_key(self):
        assert write_key_headers("SECRET123") == {WRITE_KEY_HEADER: "SECRET123"}

    def test_headers_are_empty_without_a_key(self):
        assert write_key_headers(None) == {}
        assert write_key_headers("") == {}
        assert write_key_headers("   ") == {}

    def test_headers_trim_whitespace(self):
        assert write_key_headers("  SECRET123\n") == {WRITE_KEY_HEADER: "SECRET123"}

    def test_get_write_key_reads_the_env_var(self):
        assert get_write_key({"PROCLAIM_WRITE_KEY": "SECRET123"}) == "SECRET123"
        assert get_write_key({"PROCLAIM_WRITE_KEY": "  SECRET123  "}) == "SECRET123"

    def test_get_write_key_is_none_when_unset_or_blank(self):
        assert get_write_key({}) is None
        assert get_write_key({"PROCLAIM_WRITE_KEY": ""}) is None
        assert get_write_key({"PROCLAIM_WRITE_KEY": "   "}) is None


@pytest.mark.anyio
class TestSnapshotRequest:
    async def _headers_sent(self, write_key):
        sent = []

        async def post(url, body, headers):
            sent.append(headers)
            return {"docId": "doc-test", "active": True}

        pusher = HttpSnapshotPusher(
            FakeFeed([on_air_snap()]), "http://localhost:8000", write_key=write_key, post=post
        )
        await pusher.push(on_air_snap())
        return sent[0]

    async def test_sends_the_write_key_when_configured(self):
        assert await self._headers_sent("SECRET123") == {WRITE_KEY_HEADER: "SECRET123"}

    async def test_sends_no_key_header_when_unconfigured(self):
        assert await self._headers_sent(None) == {}

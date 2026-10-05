"""Tests for the service's self-reported version (#73).

``proclaim_service.service_version_info`` answers "which version am I, and has the
release branch moved past me?". The pusher sends it with every snapshot and the server
writes it into the ``status.proclaimService`` entry the status view reads. No Proclaim,
server, or real checkout needed: the environment and git are both injected/patched.
"""

from unittest import mock

import proclaim_service as ps


def test_version_info_prefers_the_launch_wrappers_environment():
    """The wrapper resolved the SHAs at launch; that beats asking git now."""
    info = ps.service_version_info({
        "PROCLAIM_SERVICE_GIT_SHA": "a" * 40,
        "PROCLAIM_SERVICE_GIT_BRANCH": "proclaim-stable",
        "PROCLAIM_UPDATE_CHANNEL": "proclaim-stable",
        "PROCLAIM_UPDATE_CHANNEL_SHA": "a" * 40,
    })

    assert info["gitSha"] == "a" * 40
    assert info["gitShaShort"] == "aaaaaaa"
    assert info["gitBranch"] == "proclaim-stable"
    assert info["updateChannel"] == "proclaim-stable"
    assert info["updatePending"] is False


def test_version_info_flags_a_pending_update():
    """A release branch that has moved past the running SHA means "restart me"."""
    info = ps.service_version_info({
        "PROCLAIM_SERVICE_GIT_SHA": "a" * 40,
        "PROCLAIM_SERVICE_GIT_BRANCH": "proclaim-stable",
        "PROCLAIM_UPDATE_CHANNEL_SHA": "b" * 40,
    })

    assert info["updatePending"] is True


def test_version_info_never_guesses_when_the_shas_are_unknown():
    """No wrapper env and no git answer: report unknown, not "update pending"."""
    with mock.patch.object(ps, "_git_output", return_value=""):
        info = ps.service_version_info({})

    assert info["gitSha"] == ""
    assert info["updatePending"] is False

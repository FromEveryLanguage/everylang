#!/usr/bin/env python3
"""Proclaim Service entrypoint - reads Proclaim and hands what it shows to the server.

This is the thin wiring layer. The work is split across:
- ``proclaim_feed.ProclaimFeed`` - the slide *source* (Proclaim HTTP API + SQLite DB),
  emitting a serializable ``FeedSnapshot`` each poll.
- ``snapshot_pusher.HttpSnapshotPusher`` - POSTs each snapshot to the app server, which
  decides the doc, publishes the slides, and translates ahead (ADR-001). This process has no
  Yjs connection at all.

This module owns the environment/config, logging + telemetry, and the version report.

Protocol documentation for the Proclaim local API lives in ``proclaim_feed.py``.
"""

import argparse
import logging
import os
import signal
import socket
import subprocess
import time
from pathlib import Path
from typing import Any, Dict, Optional

import anyio
from posthog import Posthog
from opentelemetry._logs import set_logger_provider
from opentelemetry.sdk._logs import LoggerProvider, LoggingHandler
from opentelemetry.sdk._logs.export import BatchLogRecordProcessor
from opentelemetry.exporter.otlp.proto.http._log_exporter import OTLPLogExporter

from proclaim_feed import DEFAULT_PROCLAIM_BASE_URL, ProclaimFeed
from slide_feed import SlideFeed
from slide_replay import RecordingSlideFeed, ReplaySlideFeed, load_records
from snapshot_pusher import HttpSnapshotPusher, PusherTiming
from write_key import get_write_key

# Configure logging (default level, can be overridden by --debug flag)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('proclaim-service')

# Suppress INFO logging from httpx
logging.getLogger('httpx').setLevel(logging.WARNING)

# Configuration
PROCLAIM_BASE_URL = os.getenv('PROCLAIM_BASE_URL', DEFAULT_PROCLAIM_BASE_URL)
# The app server (Express), *not* Y-Sweet: this service no longer talks to Y-Sweet at all.
# Installs from before the rename have it baked into their plist as YSWEET_URL, and
# auto-update never rewrites the plist, so that name has to keep working.
SERVER_URL = os.getenv('SERVER_URL') or os.getenv('YSWEET_URL') or ''
assert SERVER_URL, "SERVER_URL must be set (the app server's URL)"
# Shared key identifying this machine to the server's privileged endpoints (the snapshot
# POST). Installed into the LaunchAgent plist by
# install_proclaim_service.sh --write-key=. Optional while the server runs in observe mode.
WRITE_KEY = get_write_key()
POLL_INTERVAL = float(os.getenv('PROCLAIM_POLL_INTERVAL', '0.5'))  # seconds
POLL_INTERVAL_OFF_AIR = float(os.getenv('PROCLAIM_POLL_INTERVAL_OFF_AIR', '10'))  # seconds
# How often the feed re-reads the full on-air service order (all items + slides). Items whose
# Proclaim localRevision is unchanged are not re-parsed, so this is cheap; the interval just
# bounds how quickly a slide edited underneath us is picked up.
SERVICE_ORDER_SYNC_INTERVAL = float(os.getenv('PROCLAIM_SERVICE_ORDER_SYNC_INTERVAL', '2.0'))  # seconds
# Send an unchanged snapshot this often anyway, as the service's heartbeat.
HEARTBEAT_INTERVAL = float(os.getenv('PROCLAIM_HEARTBEAT_INTERVAL', '10'))  # seconds
RETRY_BACKOFF_INITIAL = float(os.getenv('PROCLAIM_RECONNECT_BACKOFF_INITIAL', '1.0'))  # seconds
RETRY_BACKOFF_MAX = float(os.getenv('PROCLAIM_RECONNECT_BACKOFF_MAX', '30.0'))  # seconds

_POSTHOG_KEY = os.getenv('POSTHOG_API_KEY', '')
_POSTHOG_HOST = os.getenv('POSTHOG_HOST', 'https://us.i.posthog.com')
DISTINCT_ID = f'proclaim-service@{socket.gethostname()}'

ph: Optional[Posthog]
if _POSTHOG_KEY:
    ph = Posthog(_POSTHOG_KEY, host=_POSTHOG_HOST, enable_exception_autocapture=True)

    _logger_provider = LoggerProvider()
    set_logger_provider(_logger_provider)
    _logger_provider.add_log_record_processor(
        BatchLogRecordProcessor(
            OTLPLogExporter(
                endpoint=f"{_POSTHOG_HOST}/i/v1/logs",
                headers={"Authorization": f"Bearer {_POSTHOG_KEY}"}
            )
        )
    )
    logging.getLogger().addHandler(LoggingHandler(logger_provider=_logger_provider))
else:
    ph = None


def report_exception(e: Exception) -> None:
    """Report an exception to PostHog (no-op when telemetry isn't configured)."""
    if ph:
        ph.capture_exception(e, distinct_id=DISTINCT_ID)


REPO_DIR = Path(__file__).resolve().parent


def _git_output(*args: str) -> str:
    """Run a read-only git command in the repo, returning '' on any problem."""
    try:
        result = subprocess.run(
            ['git', '-C', str(REPO_DIR), *args],
            capture_output=True,
            text=True,
            timeout=5,
        )
    except Exception as e:  # git missing, not a checkout, hung, ...
        logger.debug(f"git {' '.join(args)} failed: {e}")
        return ''
    if result.returncode != 0:
        return ''
    return result.stdout.strip()


def service_version_info(env: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    """Which version of the service is running, and is a newer one waiting?

    The launch wrapper (``proclaim_service_launch.sh``) exports what it resolved
    at launch, and that is the authoritative answer for an installed service: the
    channel SHA is what the release branch pointed at when this process started.
    Running by hand there's no wrapper, so fall back to asking git directly.

    ``updatePending`` means the release branch has moved past the running SHA —
    the status view turns that into "update pending: restart the service".
    """
    env = os.environ if env is None else env

    sha = env.get('PROCLAIM_SERVICE_GIT_SHA') or _git_output('rev-parse', 'HEAD')
    branch = env.get('PROCLAIM_SERVICE_GIT_BRANCH') or _git_output('rev-parse', '--abbrev-ref', 'HEAD')
    channel = env.get('PROCLAIM_UPDATE_CHANNEL', 'proclaim-stable')
    channel_sha = env.get('PROCLAIM_UPDATE_CHANNEL_SHA')
    if channel_sha is None:
        # Local remote-tracking ref only — never fetches, so this can't block startup.
        channel_sha = _git_output('rev-parse', f'origin/{channel}')

    return {
        'gitSha': sha,
        'gitShaShort': sha[:7],
        'gitBranch': branch,
        'updateChannel': channel,
        'channelSha': channel_sha,
        # Only claim "pending" when both sides are actually known.
        'updatePending': bool(sha and channel_sha and sha != channel_sha),
    }


def _build_feed(
    *,
    record_path: Optional[str],
    replay_path: Optional[str],
    replay_speed: float,
) -> SlideFeed:
    """Build the slide source: a live ``ProclaimFeed``, a ``ReplaySlideFeed`` (``--replay``),
    or a live feed wrapped in a ``RecordingSlideFeed`` (``--record``)."""
    if replay_path:
        records = load_records(replay_path)
        # speed > 0 scales real time (2x => half the delays); speed <= 0 replays instantly.
        time_scale = (1.0 / replay_speed) if replay_speed > 0 else 0.0
        logger.info(
            f"Replaying {len(records)} recorded snapshots from {replay_path} "
            f"(speed {replay_speed}x)"
        )
        return ReplaySlideFeed(records, time_scale=time_scale)

    feed: SlideFeed = ProclaimFeed(
        proclaim_base_url=PROCLAIM_BASE_URL,
        order_sync_interval=SERVICE_ORDER_SYNC_INTERVAL,
        report_exception=report_exception,
    )
    if record_path:
        feed = RecordingSlideFeed(feed, record_path)
    return feed


def build_pusher(
    doc_id: Optional[str],
    *,
    record_path: Optional[str] = None,
    replay_path: Optional[str] = None,
    replay_speed: float = 1.0,
) -> HttpSnapshotPusher:
    """Wire the feed to the server from the module configuration."""
    feed = _build_feed(
        record_path=record_path, replay_path=replay_path, replay_speed=replay_speed
    )
    timing = PusherTiming(
        # In replay mode the feed owns the cadence (it honors recorded timing), so don't add
        # the live on-air poll delay on top of it.
        poll_interval=0.0 if replay_path else POLL_INTERVAL,
        poll_interval_off_air=POLL_INTERVAL_OFF_AIR,
        heartbeat_interval=HEARTBEAT_INTERVAL,
        backoff_initial=RETRY_BACKOFF_INITIAL,
        backoff_max=RETRY_BACKOFF_MAX,
    )
    return HttpSnapshotPusher(
        feed,
        SERVER_URL,
        write_key=WRITE_KEY,
        service_info={**service_version_info(), 'host': socket.gethostname()},
        doc_id=doc_id,
        timing=timing,
        report_exception=report_exception,
    )


async def signal_handler(cancel_scope: anyio.CancelScope):
    with anyio.open_signal_receiver(signal.SIGINT, signal.SIGTERM) as signals:
        async for signum in signals:
            signal_name = signal.strsignal(signum) or str(signum)
            logger.info(f"Received {signal_name}, shutting down...")
            cancel_scope.cancel()
            return


async def main():
    """Entry point with signal handling."""
    parser = argparse.ArgumentParser(description='Proclaim Service - sends what Proclaim shows to the server')
    parser.add_argument(
        'doc_id',
        nargs='?',
        help="Document ID override. Overrides the server's answer entirely — use it to "
             "target a throwaway doc, or when the server is wrong. Default: ask the server "
             "which session is current (issue #111).",
    )
    parser.add_argument('--debug', action='store_true', help='Enable debug logging')
    parser.add_argument(
        '--record', metavar='PATH',
        help="Record the slide feed's FeedSnapshot stream to PATH (JSONL) while running live, "
             "for later replay (issue #70).",
    )
    parser.add_argument(
        '--replay', metavar='PATH',
        help="Replay a recorded FeedSnapshot stream (JSONL) instead of polling Proclaim. "
             "Defaults to a fresh doc-test-<epoch> document so it never clobbers real data.",
    )
    parser.add_argument(
        '--replay-speed', type=float, default=1.0,
        help="Replay speed multiplier (2 = twice as fast); <= 0 replays as fast as possible.",
    )
    args = parser.parse_args()

    if args.debug:
        logger.setLevel(logging.DEBUG)
        logger.debug("Debug logging enabled")

    if args.record and args.replay:
        parser.error("--record and --replay are mutually exclusive")

    doc_id = args.doc_id or os.getenv('PROCLAIM_DOC_ID')
    if args.replay and not doc_id:
        doc_id = f'doc-test-{int(time.time())}'

    logger.info(f"Proclaim URL: {PROCLAIM_BASE_URL}")
    logger.info(f"Poll interval: {POLL_INTERVAL}s (on air), {POLL_INTERVAL_OFF_AIR}s (off air)")
    # Says whether a key is configured, never what it is. Worth a line: once the server
    # enforces keys, "no write key configured" is the whole explanation for a service that
    # connects but silently can't write.
    logger.info(f"Write key: {'configured' if WRITE_KEY else 'NOT configured'}")
    version_info = service_version_info()
    logger.info(
        f"Version: {version_info['gitShaShort'] or 'unknown'} "
        f"on {version_info['gitBranch'] or 'unknown'} "
        f"(channel {version_info['updateChannel']})"
    )

    logger.info(f"Server URL: {SERVER_URL}")
    if doc_id:
        logger.info(f"Doc overridden to: {doc_id}")
    pusher = build_pusher(
        doc_id,
        record_path=args.record,
        replay_path=args.replay,
        replay_speed=args.replay_speed,
    )

    async with anyio.create_task_group() as tg:
        tg.start_soon(pusher.run)
        tg.start_soon(signal_handler, tg.cancel_scope)


if __name__ == '__main__':
    anyio.run(main)

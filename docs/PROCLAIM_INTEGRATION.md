# Proclaim Integration

This integration syncs current slide text from Proclaim to the live-notes application in real-time.

## Architecture

The service reads Proclaim; the server does everything else
([ADR-001](adr-001-server-owned-slide-sync.md)):

1. **Python Service** (`proclaim_service.py`) - Runs on the computer with Proclaim
   - Polls Proclaim API for current presentation and slide status
   - Parses presentation content from the Proclaim database
   - POSTs the full state (a `FeedSnapshot`, `slide_feed.py`) to `/api/proclaim/snapshot`
     on every change and every ~10 s as a heartbeat (`snapshot_pusher.py`). It holds no
     Yjs or Y-Sweet connection.

2. **Server** (`slideSnapshotRoutes.ts`, `slideSync.ts`)
   - Decides which doc the snapshot belongs to (the show's date is a proposal; see
     [CURRENT_SESSION.md](CURRENT_SESSION.md))
   - Publishes `proclaimServiceOrder` / `proclaimPresentations` / `proclaimStatus` in one
     transaction through its own synced doc connection
   - Translates the active item, then upcoming ones, into `slideTranslations` (never
     overwriting a reviewed entry; each item's content once)

3. **React Components** (`CurrentSlideViewer.tsx`)
   - **Container**: Reads from Yjs and extracts presentation data
   - **Pure component**: Displays current slide with context (prev/next slides)
   - Real-time updates via Yjs (no polling needed)

## Setup

### 1. Install Python Dependencies

On the computer running Proclaim:

```bash
# Install uv (if not already installed)
curl -LsSf https://astral.sh/uv/install.sh | sh

# Install dependencies
uv sync
```

### 2. Run the Proclaim Service

```bash
# Make sure Proclaim is running
# Start the service. It does not choose a doc itself: when a show goes on air it tells
# the server the show's scheduled date (Proclaim's DateGiven) and uses whatever doc the
# server names in reply. Pre-staging still works — a future-dated show is accepted — but
# a show dated in the *past* no longer drags the service backwards (issue #111).
uv run proclaim_service.py

# Or specify a custom doc ID (an override: the server is not consulted at all)
uv run proclaim_service.py my-custom-doc
```

Environment variables: see the top of `proclaim_service.py` (the server's URL is `SERVER_URL`;
older installs set it as `YSWEET_URL`, which still works — it was always the app server, never
Y-Sweet).

### Resilience

- **Every POST is the whole state.** A lost, repeated, or retried snapshot is harmless; there
  is no connection to resynchronize and nothing to re-push after an outage. A failed POST is
  retried with backoff forever, and the first success restores everything.
- **Off air is a heartbeat, not a disconnect.** Off-air snapshots keep being sent (slowly) so
  `/status` can tell a quiet service from a dead one; the server applies only on-air ones.
- **Two machines.** If two services post at once (the booth Mac and a laptop), the server
  follows the one that went on air first and keeps it while it stays on air; the other is
  told `active: false`, logs it, and shows on `/status` as `(standby)`. Take the followed one
  off air to switch.
- **The server names the doc.** The snapshot carries the show's scheduled date (Proclaim's
  `DateGiven`) as a proposal. A future-dated show is accepted, so pre-staging the night before
  still works; a show dated *before today* is refused and today's doc is used, which is the
  failure in [#111](https://github.com/kcarnold/live-notes/issues/111). An operator pin set
  from `/status` outranks it. The service logs the doc its slides went to whenever that
  changes.

### 3. View Current Slide in Browser

Navigate to a layout that includes `currentSlide`:

```
http://localhost:8000/currentSlide
http://localhost:8000/translatedText-French,currentSlide
```

## How It Works

### 1. Python Service Polls Proclaim

On each poll (`PROCLAIM_POLL_INTERVAL` while on air, `PROCLAIM_POLL_INTERVAL_OFF_AIR` otherwise):
- Fetches `/onair/session` to get session ID
- Fetches `/onair/statusChanged` to get current slide index and item ID

### 2. Presentation Changes → Snapshot

When a new presentation is detected:
- Queries Proclaim SQLite database for service item content
- Parses rich text XML to extract slide text
- Decodes the custom order sequence to get slides in correct order
- Sends the whole snapshot to the server, which stores each changed item in
  `proclaimPresentations` and the pointer in `proclaimStatus`

### 3. Slide Changes → Snapshot

When the slide index changes:
- Sends the (changed) snapshot; the server updates `proclaimStatus`

### 4. Browser Auto-Updates

React component:
- Subscribes to Yjs changes via `useMap()`
- Extracts current presentation and slide index
- Renders current slide with context (previous and next slides)
- Updates automatically when Yjs changes (no polling!)

## UI Features

The current slide viewer shows:
- **Header**: Title and progress (slide X of Y)
- **Current slide**: Large, highlighted with blue border
- **Context slides**: Previous and next slides (dimmed, smaller text)
- **Smooth transitions**: CSS animations when slides change

## Data Flow

```
Proclaim API/DB
    ↓ (poll)
Python Service
    ↓ (HTTP POST, full snapshot)
App server (Express)
    ↓ (server-side Yjs connection)
Y-Sweet
    ↓ (Yjs sync)
React Component
    ↓ (render)
Browser Display
```

No HTTP polling from browser → instant updates!

## Auto-Update Mechanism

The macOS LaunchAgent runs `proclaim_service_launch.sh`, which updates the
checkout from the `proclaim-stable` release branch on every launch and then
starts the service whether or not the update worked (a failed dependency sync
rolls back to the SHA that was running). Releasing is
`git push origin main:proclaim-stable`; applying a release is restarting the
service. See [PROCLAIM_SERVICE_SETUP.md](PROCLAIM_SERVICE_SETUP.md#automatic-updates).

On Linux the equivalent is a systemd unit that runs the same wrapper:

```ini
# /etc/systemd/system/proclaim-sync.service
[Unit]
Description=Proclaim Sync Service
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/path/to/live-notes
Environment=UV_BIN=/usr/local/bin/uv
ExecStart=/bin/bash /path/to/live-notes/proclaim_service_launch.sh
Restart=always

[Install]
WantedBy=multi-user.target
```


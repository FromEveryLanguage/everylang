## Local development

1. If you have not installed the dependencies yet, run `npm install`.
2. Copy `template-.env` to `.env` and fill in the required credentials before starting
   any services:
   - Add your Gemini and ElevenLabs API keys as `GEMINI_API_KEY` and
     `ELEVENLABS_API_KEY`.
   - Add your Y-Sweet connection string as `YSWEET_CONNECTION_STRING`.
   - Create a free project at [LiveKit Cloud](https://cloud.livekit.io/), create an API
     key for the project, and add its URL, API key, and API secret to `.env` as
     `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET`.
3. In a terminal, start Y-Sweet:

   ```bash
   npm run dev:ysweet
   ```

4. In a second terminal, start the backend:

   ```bash
   npm run dev:server
   ```

5. In a third terminal, start the frontend:

   ```bash
   npm run dev
   ```

6. Open the broadcast page at
   [http://127.0.0.1:[PORT]/broadcast%7Clisten-fr#editor](http://127.0.0.1:5008/broadcast%7Clisten-fr#editor).
   Replace [PORT] with the port number printed in the terminal when you started the frontend. Ex: 5008.

## Testing & Building

```bash
# Run tests
npm test

# Lint code
npm run lint

# Build for production
npm run build

# Start production server (serves built files)
npm start
```

## Deployment

Both compose setups run their own Y-Sweet with auth on, and refuse to start without
`Y_SWEET_AUTH` and `Y_SWEET_SERVER_TOKEN` in `.env` (generate them as a pair; see
`template-.env`). Compose builds the app's connection string from the token, so
`YSWEET_CONNECTION_STRING` in `.env` is ignored there.

### Local dev with Docker

```bash
# Auto-merges compose.yaml + compose.override.yaml (uses localhost URLs)
docker compose up -d
```

### Production

```bash
# On the server
./deploy-docker-compose.sh
```

It builds and starts with `compose.prod.yaml` (which sets the public y-sweet URL). The
`git pull` command in the script is commented out, so update the checkout on the server
before running it if you want to deploy the latest branch.

Fly.io is not currently used; it was a temporary deployment while the main server had
hardware trouble. `deploy-flyio.sh` deploys the app. It includes a Y-Sweet deploy command,
but that command is intentionally commented out so routine app deployments do not also
redeploy Y-Sweet, which changes infrequently.

### Other commands

```bash
# View logs
docker compose logs -f

# Stop
docker compose down
```

Environment variables are loaded from `.env` automatically.

## Project Details

This is a live translation application for presentations/talks. It provides:
- AI-powered translation (Google Gemini)
- Text-to-speech output (ElevenLabs)
- Collaborative editing (Y-Sweet/Yjs)
- Multiple layout configurations, chosen by URL — see [docs/LAYOUT_URLS.md](docs/LAYOUT_URLS.md)
- Live speech translation and transcripts using LiveKit and Gemini Live.
- Proclaim slide synchronization and advance translation through the Python service.
- Slide translation review and a persistent library of reviewed translations.
- An optional native macOS Audio Feeder app for publishing sound-board audio to LiveKit.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the application components fit
together, and [docs/PROCLAIM_INTEGRATION.md](docs/PROCLAIM_INTEGRATION.md) for Proclaim setup.
See [CLAUDE.md](CLAUDE.md) for detailed architecture and development information.

# To set up

- Copy `template-.env` to `.env`
- Set `YSWEET_CONNECTION_STRING` to a reachable Y-Sweet instance. The backend requires it
  at startup, along with the Gemini and ElevenLabs keys below. For a local Y-Sweet
  instance, `npm run dev:ysweet` starts the service on port 5007; run it in a separate
  terminal and configure the connection string for that instance.
- Get a Gemini API key and add it to `.env` as `GEMINI_API_KEY`.
- Get an ElevenLabs API key and add it to `.env` as `ELEVENLABS_API_KEY`.
- Run `npm install` to install packages.

## To run

Backend:

```
npm run dev:server
```

Frontend:

```
npm run dev
```

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

It runs `git pull`, builds, and starts with `compose.prod.yaml` (which sets the public
y-sweet URL). `deploy-flyio.sh` is the Fly.io equivalent.

Note on the commands described above: despite the sentence above, `deploy-docker-compose.sh`
currently does not run `git pull` (the command is commented out), so update the checkout on
the server before running it if you want to deploy the latest branch. `deploy-flyio.sh`
deploys the app only; the Y-Sweet service is separate and must already be deployed and
configured for the app.

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


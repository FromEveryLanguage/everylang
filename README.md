# To set up

- Copy `template-.env` to `.env`
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

See [CLAUDE.md](CLAUDE.md) for detailed architecture and development information.

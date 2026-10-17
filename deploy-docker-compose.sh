#!/bin/bash
set -e

#git pull
export GIT_SHA=$(git rev-parse HEAD)
export LIVE_AUDIO_SILENCE_GATING=1
docker compose -f compose.yaml -f compose.prod.yaml build
docker compose -f compose.yaml -f compose.prod.yaml up -d

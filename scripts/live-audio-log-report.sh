#!/usr/bin/env bash
# Summarize a service's live-audio health from the app logs: Gemini session swaps
# (did they land on pauses? did the drain recover audio? did the gaps go away?),
# Gemini refusals (billing), input levels, and LiveKit trouble.
#
# Usage:
#   scripts/live-audio-log-report.sh                 # docker compose logs, last 24h
#   scripts/live-audio-log-report.sh --since 2026-11-08T13:00:00
#   scripts/live-audio-log-report.sh saved-log.txt   # a log saved earlier
#
# Read the swap section against the baseline from the Oct-Nov 2026 logs, before the
# pause/drain change: 47 of 48 goAway swaps were followed by a 2.2-4.5s gap.
set -uo pipefail  # no -e: an empty grep is an answer here, not a failure

since="24h"
file=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --since) since="$2"; shift 2 ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) file="$1"; shift ;;
  esac
done

log=$(mktemp)
trap 'rm -f "$log"' EXIT
if [[ -n "$file" ]]; then
  cp "$file" "$log"
else
  cd "$(dirname "$0")/.."
  docker compose logs --no-color --timestamps --since "$since" app 2>/dev/null > "$log"
fi
# Drop the compose prefix ("app-1  | ") so lines start with the timestamp.
sed -i -E 's/^[a-z0-9_-]+-[0-9]+ +\| //' "$log"

section() { printf '\n== %s ==\n' "$1"; }
count() { grep -cE "$1" "$log" || true; }
show() { grep -E "$1" "$log" | cut -c1-"${2:-220}" || true; }

section "Log span"
head -n1 "$log" | cut -c1-30
tail -n1 "$log" | cut -c1-30
echo "$(wc -l < "$log") lines"

section "Server boots and session timezone (should not say UTC)"
show 'Current session:'

section "Gemini refusals (billing / repeated errors) — expect none"
show 'Live-audio problem'
echo "bridge start failures: $(count 'Failed to start')"
grep -oE 'reason=[^"]{0,100}' "$log" | sort | uniq -c | sort -rn | head -5 || true

section "Session swaps"
echo "goAways (real):      $(count 'Gemini goAway received')"
echo "goAways (simulated): $(count 'Simulating Gemini goAway')"
echo "swaps by moment (pause is the goal; mostly deadline = pause bar too strict for this feed):"
grep -oE 'Gemini swapped in \(trigger=[a-z]+, at=[a-z_]+' "$log" | sed -E 's/.*trigger=/  trigger=/' | sort | uniq -c || true
echo "wait for a pause, ms (min / median / max):"
grep -oE 'waited=[0-9]+ms' "$log" | grep -oE '[0-9]+' | sort -n |
  awk '{a[NR]=$1} END {if (NR) printf "  %d / %d / %d  (n=%d)\n", a[1], a[int((NR+1)/2)], a[NR], NR; else print "  (none)"}'
echo "drains by how they ended (replacement_audio is the normal one):"
grep -oE 'Drain ended \([a-z_]+\)' "$log" | sort | uniq -c || true
echo "drain length ms / audio chunks recovered from the old session:"
grep -oE 'after [0-9]+ms, [0-9]+ audio chunks' "$log" | awk '{print "  " $2 " " $3 " chunks"}' | sort -t' ' -k1 -n | tr '\n' ' '
echo

section "Translated-audio gaps over 2s (the listener-facing number)"
echo "total: $(count 'Audio resumed after')"
# A gap within 10s after a swap is the swap's cost; others are just pauses in speech.
awk '
  function secs(ts) { split(substr(ts, 12, 12), t, ":"); return t[1]*3600 + t[2]*60 + t[3] }
  /swapped in/ { last_swap = secs($1) }  # new and pre-2026-11 wording
  /Audio resumed after/ {
    match($0, /after [0-9]+ms/); ms = substr($0, RSTART + 6, RLENGTH - 8)
    if (last_swap && secs($1) - last_swap < 10) { n_swap++; swap_list = swap_list " " ms }
    else { n_other++ }
  }
  END {
    printf "  right after a swap: %d  (ms:%s)\n", n_swap, swap_list
    printf "  elsewhere (pauses in speech, outages): %d\n", n_other
  }' "$log"

section "Input catch-up after reconnects"
echo "flushed buffered input: $(count 'Flushing [0-9]+ buffered')   dropped input (genuine loss): $(count 'Dropped [0-9]+ input audio')"

section "Input levels, primary bridge (for LIVE_AUDIO_SILENCE_THRESHOLD_DBFS / SWAP_PAUSE_DBFS)"
grep -E 'Input level, last minute' "$log" | sed -E 's/^([0-9T:-]{16})[^ ]* .*last minute: /\1  /' | head -200 || true
grep -oE 'p10=-?[0-9]+ p50=-?[0-9]+ p90=-?[0-9]+' "$log" |
  awk -F'[= ]' '{p10+=$2; p50+=$4; p90+=$6; n++} END {if (n) printf "  average over %d minutes: p10=%.0f p50=%.0f p90=%.0f dBFS\n", n, p10/n, p50/n, p90/n}'

section "LiveKit / input trouble"
echo "no organizer audio (stall watchdog): $(count 'No organizer audio for')"
echo "livekit reconnecting: $(count 'LiveKit reconnecting')   disconnected: $(count 'Disconnected from room')"
show 'escalat|Organizer audio stream ended|Audio stream error' | head -20

section "Write-key refusals"
grep -E '\[write-auth\].*refused' "$log" | sed -E 's/^[^ ]+ //; s/ip=[^ ]+ //' | sort | uniq -c | sort -rn | head -10 || true

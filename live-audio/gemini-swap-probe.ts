/**
 * Offline probe for Gemini Live session swaps — measures what a listener hears when the
 * bridge moves from one Gemini session to the next, without a service, a room or a
 * congregation.
 *
 * Why it exists: in production every goAway swap left a 2–4.5s hole in the translated
 * audio (Oct–Nov 2026 logs: 47 of 48 swaps), and whether the fix is "let the old socket
 * finish", "resume with a handle", or both depends on how the translate model behaves —
 * which no fake can tell us. This streams a 16kHz mono PCM recording at real time into
 * session A, swaps input to session B partway through, and prints a timeline of audio and
 * transcript from each socket.
 *
 * Modes:
 *   cut        today's behavior: B is opened ahead, and at the swap A is closed at once
 *   drain      at the swap A stops getting input but stays open; whatever it still emits is kept
 *   drain-end  as drain, plus `audioStreamEnd` sent to A at the swap, to ask it to flush
 *   resume     B is opened with A's latest session-resumption handle (then A is drained)
 *
 * It costs real Gemini usage (two sessions for --duration seconds). Usage:
 *
 *   ffmpeg -i talk.mp3 -f s16le -ar 16000 -ac 1 talk.pcm
 *   node --env-file=.env live-audio/gemini-swap-probe.ts --pcm talk.pcm --mode drain \
 *     [--swap-at 40] [--duration 75] [--target en] [--wav listener.wav]
 */

import fs from "node:fs";
import WebSocket from "ws";

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) {
  args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);
}
const pcmPath = args.get("pcm");
const mode = args.get("mode") ?? "drain";
const swapAtS = Number(args.get("swap-at") ?? 40);
const durationS = Number(args.get("duration") ?? 75);
const target = args.get("target") ?? "en";
const model = args.get("model") ?? "gemini-3.5-live-translate-preview";
const apiKey = process.env.GEMINI_API_KEY;
if (!pcmPath || !apiKey || !["cut", "drain", "drain-end", "resume"].includes(mode)) {
  console.error("usage: --pcm file.pcm --mode cut|drain|drain-end|resume (GEMINI_API_KEY in env)");
  process.exit(2);
}

const FRAME_SAMPLES = 1600; // 100ms at 16kHz
const pcm = fs.readFileSync(pcmPath);
const t0 = Date.now();
const t = () => ((Date.now() - t0) / 1000).toFixed(2).padStart(6);

interface Probe {
  name: string;
  ws: WebSocket;
  ready: Promise<void>;
  handle: string | null;
  /** Audio arrival, merged into spans with < 400ms between chunks. */
  spans: Array<[number, number]>;
  /** The same, counting only chunks loud enough to be speech (the model also streams silence). */
  voiced: Array<[number, number]>;
  /** Every audio chunk (24kHz PCM16) with its arrival time, for the listener mix. */
  chunks: Array<[number, Buffer]>;
  transcript: Array<[number, string]>;
  inputTranscript: Array<[number, string]>;
}

function open(name: string, resumeHandle?: string | null): Probe {
  const ws = new WebSocket(
    `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`
  );
  const p: Probe = { name, ws, ready: null!, handle: null, spans: [], voiced: [], chunks: [], transcript: [], inputTranscript: [] };
  const openedAt = Date.now();
  p.ready = new Promise((resolve, reject) => {
    ws.on("open", () => {
      ws.send(
        JSON.stringify({
          setup: {
            model: `models/${model}`,
            outputAudioTranscription: {},
            inputAudioTranscription: {},
            generationConfig: {
              responseModalities: ["AUDIO"],
              translationConfig: { targetLanguageCode: target, echoTargetLanguage: true },
            },
            realtimeInputConfig: { automaticActivityDetection: { disabled: false } },
            ...(resumeHandle !== undefined ? { sessionResumption: resumeHandle ? { handle: resumeHandle } : {} } : {}),
          },
        })
      );
    });
    ws.on("close", (code, reason) => {
      console.log(`${t()} ${name} closed code=${code} ${reason.toString().slice(0, 120)}`);
      reject(new Error(`closed before setup: ${code}`));
    });
    ws.on("message", (raw) => {
      const m = JSON.parse(raw.toString());
      const now = (Date.now() - t0) / 1000;
      if (m.setupComplete) {
        console.log(`${t()} ${name} setupComplete (${Date.now() - openedAt}ms${resumeHandle ? ", resumed" : ""})`);
        resolve();
        return;
      }
      if (m.sessionResumptionUpdate?.newHandle) p.handle = m.sessionResumptionUpdate.newHandle;
      if (m.goAway) console.log(`${t()} ${name} goAway ${JSON.stringify(m.goAway)}`);
      const sc = m.serverContent;
      if (!sc) return;
      for (const part of sc.modelTurn?.parts ?? []) {
        if (!part.inlineData?.data) continue;
        const buf = Buffer.from(part.inlineData.data, "base64");
        p.chunks.push([now, buf]);
        extend(p.spans, now);
        if (rmsDbfs(buf) > VOICED_DBFS) extend(p.voiced, now);
      }
      if (sc.outputTranscription?.text) p.transcript.push([now, sc.outputTranscription.text]);
      if (sc.inputTranscription?.text) p.inputTranscript.push([now, sc.inputTranscription.text]);
      if (sc.turnComplete || sc.generationComplete || sc.interrupted) {
        console.log(`${t()} ${name} ${Object.keys(sc).filter((k) => !/Transcription|modelTurn/.test(k)).join(",")}`);
      }
    });
  });
  return p;
}

const VOICED_DBFS = -45;

function extend(spans: Array<[number, number]>, now: number) {
  const last = spans[spans.length - 1];
  if (last && now - last[1] < 0.4) last[1] = now;
  else spans.push([now, now]);
}

function rmsDbfs(buf: Buffer): number {
  const n = Math.floor(buf.length / 2);
  if (!n) return -Infinity;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += buf.readInt16LE(i * 2) ** 2;
  const rms = Math.sqrt(sum / n);
  return rms ? 20 * Math.log10(rms / 32768) : -Infinity;
}

/** What a listener hears: A's chunks until the switch time, then B's, in arrival order. */
function writeListenerWav(path: string, a: Probe, b: Probe | null, switchAt: number) {
  const parts = [
    ...a.chunks.filter(([w]) => w < switchAt).map(([, c]) => c),
    ...(b?.chunks.filter(([w]) => w >= switchAt).map(([, c]) => c) ?? []),
  ];
  const data = Buffer.concat(parts);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(24000, 24); h.writeUInt32LE(48000, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(data.length, 40);
  fs.writeFileSync(path, Buffer.concat([h, data]));
  console.log(`listener mix written to ${path}`);
}

function send(p: Probe, frame: Buffer) {
  if (p.ws.readyState !== WebSocket.OPEN) return;
  p.ws.send(
    JSON.stringify({ realtimeInput: { audio: { mimeType: "audio/pcm;rate=16000", data: frame.toString("base64") } } })
  );
}

async function main() {
  console.log(`mode=${mode} swapAt=${swapAtS}s duration=${durationS}s target=${target}`);
  const a = open("A", mode === "resume" ? null : undefined);
  await a.ready;
  const start = Date.now();
  let b: Probe | null = null;
  let active = a;
  let frame = 0;
  const totalFrames = Math.min(Math.floor(pcm.length / 2 / FRAME_SAMPLES), durationS * 10);

  while (frame < totalFrames) {
    const elapsedS = frame / 10;
    // Open B two seconds ahead, as the goAway path does (it's ready long before the swap).
    if (!b && elapsedS >= swapAtS - 2) {
      if (mode === "resume" && !a.handle) console.log(`${t()} no handle from A yet; opening B fresh`);
      b = open("B", mode === "resume" ? a.handle : undefined);
    }
    if (b && active === a && elapsedS >= swapAtS) {
      await b.ready;
      console.log(`${t()} === SWAP (input → B) at source ${elapsedS.toFixed(1)}s ===`);
      active = b;
      if (mode === "cut") a.ws.close();
      if (mode === "drain-end") {
        a.ws.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
      }
      if (mode !== "cut") setTimeout(() => a.ws.close(), 20_000);
    }
    send(active, pcm.subarray(frame * FRAME_SAMPLES * 2, (frame + 1) * FRAME_SAMPLES * 2));
    frame++;
    const wait = start + frame * 100 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }
  // Let both finish speaking.
  await new Promise((r) => setTimeout(r, 8_000));
  a.ws.close();
  b?.ws.close();

  const swapT = (start - t0) / 1000 + swapAtS;
  const fmt = (spans: Array<[number, number]>) =>
    spans.map(([s, e]) => `${(s - swapT).toFixed(1)}..${(e - swapT).toFixed(1)}`).join("  ");
  console.log(`\nAudio spans, seconds relative to the swap:`);
  console.log(`  A: ${fmt(a.spans.filter(([, e]) => e > swapT - 6))}`);
  if (b) console.log(`  B: ${fmt(b.spans)}`);
  const aAfter = a.spans.filter(([, e]) => e > swapT);
  const aLast = aAfter.length ? aAfter[aAfter.length - 1][1] - swapT : null;
  const bFirst = b?.spans.length ? b.spans[0][0] - swapT : null;
  console.log(`  A audio after swap: ${aLast == null ? "none" : `until +${aLast.toFixed(2)}s`}`);
  console.log(`Voiced spans (> ${VOICED_DBFS} dBFS), relative to the swap:`);
  console.log(`  A: ${fmt(a.voiced.filter(([, e]) => e > swapT - 6))}`);
  if (b) console.log(`  B: ${fmt(b.voiced.filter(([s]) => s < swapT + 15))}`);
  console.log(`  B first audio: ${bFirst == null ? "none" : `+${bFirst.toFixed(2)}s`}`);
  const text = (xs: Array<[number, string]>, from: number) =>
    xs.filter(([w]) => w >= from).map(([, s]) => s).join("");
  console.log(`\nA output transcript (from swap-10s):\n  ${text(a.transcript, swapT - 10)}`);
  console.log(`A output after the swap only:\n  ${text(a.transcript, swapT)}`);
  console.log(`B output transcript (first 15s):\n  ${b ? text(b.transcript.filter(([w]) => w < swapT + 15), 0) : ""}`);
  console.log(`\nA input transcript (from swap-10s):\n  ${text(a.inputTranscript, swapT - 10)}`);
  console.log(`B input transcript (first 15s):\n  ${b ? text(b.inputTranscript.filter(([w]) => w < swapT + 15), 0) : ""}`);
  const wav = args.get("wav");
  if (wav) {
    // cut: the listener switches at the swap. Otherwise: at B's first audio (drain policy).
    const switchAt = mode === "cut" || !b?.chunks.length ? swapT : b.chunks[0][0];
    writeListenerWav(wav, a, b, switchAt);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

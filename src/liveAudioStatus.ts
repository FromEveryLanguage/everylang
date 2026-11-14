import type * as Y from "yjs";

/**
 * The live-audio subsystem's problem report, filed in the session doc's `status` Y.Map
 * (next to the Proclaim service's `proclaimService` entry) so /status shows it without a
 * new endpoint.
 *
 * Written by the server's TranslationSessionManager, and only when something is wrong:
 * the entry is deleted once every bridge is healthy again, so its presence *is* the alarm.
 * It exists because of 2026-10-25, when Gemini refused every connection for 27 minutes
 * (prepaid credits depleted) and the only signal anywhere was a server log line — the
 * bridge kept retrying, the broadcaster saw nothing, and it was found by ear.
 */
export const LIVE_AUDIO_STATUS_KEY = "liveAudio";

export interface LiveAudioProblem {
  /** `billing` needs a human (top up / fix the plan); `other` may clear by itself. */
  kind: "billing" | "other";
  /** BCP-47 code of the bridge that hit it. */
  language: string;
  /** Gemini's own words, e.g. "Your prepayment credits are depleted. ...". */
  message: string;
  /** Epoch ms when it was last seen. */
  at: number;
}

/** File (or, with null, clear) the problem. No-ops when nothing changed. */
export function writeLiveAudioProblem(doc: Y.Doc, problem: LiveAudioProblem | null): void {
  const status = doc.getMap<unknown>("status");
  const current = status.get(LIVE_AUDIO_STATUS_KEY) as LiveAudioProblem | undefined;
  if (!problem) {
    if (current !== undefined) status.delete(LIVE_AUDIO_STATUS_KEY);
    return;
  }
  // `at` alone changing is not news; rewriting it every tick would churn the doc.
  if (
    current &&
    current.kind === problem.kind &&
    current.language === problem.language &&
    current.message === problem.message
  ) {
    return;
  }
  status.set(LIVE_AUDIO_STATUS_KEY, problem);
}

/** Read the problem back out of a plain snapshot of the `status` map. */
export function readLiveAudioProblem(entries: Record<string, unknown>): LiveAudioProblem | null {
  const raw = entries[LIVE_AUDIO_STATUS_KEY];
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<LiveAudioProblem>;
  if (typeof r.message !== "string" || typeof r.language !== "string") return null;
  return {
    kind: r.kind === "billing" ? "billing" : "other",
    language: r.language,
    message: r.message,
    at: typeof r.at === "number" ? r.at : 0,
  };
}

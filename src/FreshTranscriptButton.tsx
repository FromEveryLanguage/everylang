// "Start fresh transcript": deletes the session's live transcripts, for the handover
// from a demo in the real doc to the service itself. The server does the delete and
// decides whether to warn (see transcriptResetRoutes.ts); this only asks the human.
//
// Two confirmations at most. The first is unconditional, because the delete reaches every
// viewer and can't be undone. The second appears only when the server reports someone
// broadcasting (or can't tell), because then what gets deleted may be the live talk.
import { useState } from 'react';
import { useStrings } from './useLocale';
import { apiFetch } from './writeKey';

type Outcome = 'done' | 'nothing' | 'failed';

async function postClear(docId: string, force: boolean): Promise<Response> {
  return apiFetch('/api/session/clearTranscripts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ docId, force }),
  });
}

export function FreshTranscriptButton({
  docId,
  confirm = (message) => window.confirm(message),
}: {
  docId: string;
  /** Injected so tests can answer the prompts. */
  confirm?: (message: string) => boolean;
}) {
  const s = useStrings();
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const run = async () => {
    setOutcome(null);
    if (!confirm(s.freshTranscriptConfirm)) return;
    setBusy(true);
    try {
      let response = await postClear(docId, false);
      if (response.status === 409) {
        const { reason } = (await response.json()) as { reason?: string };
        const warning =
          reason === 'broadcaster-live'
            ? s.freshTranscriptBroadcasterLive
            : s.freshTranscriptPresenceUnknown;
        if (!confirm(warning)) return;
        response = await postClear(docId, true);
      }
      if (!response.ok) {
        setOutcome('failed');
        return;
      }
      const { cleared } = (await response.json()) as { cleared?: string[] };
      setOutcome(cleared && cleared.length > 0 ? 'done' : 'nothing');
    } catch {
      setOutcome('failed');
    } finally {
      setBusy(false);
    }
  };

  const message =
    outcome === 'done'
      ? s.freshTranscriptDone
      : outcome === 'nothing'
        ? s.freshTranscriptNothing
        : outcome === 'failed'
          ? s.freshTranscriptFailed
          : null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => void run()}
        className="px-3 py-1 rounded border border-red-400 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950 disabled:opacity-50 text-sm"
      >
        🧹 {s.freshTranscript}
      </button>
      {message && (
        <span
          role="status"
          className={`text-xs ${
            outcome === 'failed' ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          {message}
        </span>
      )}
    </div>
  );
}

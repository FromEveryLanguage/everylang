import { useState } from 'react';
import type { Content, SlideConversation, TokenUsage } from './slideTranslationApi';
import { primaryButtonClass, subtleTextClass } from './slideReviewStyles';
import { useStrings } from './useLocale';

/**
 * Pure renderer for a slide-translation agent conversation: the agent's text, its tool
 * calls (Bible lookups, set_translations), reviewer follow-ups, and manual-edit notes —
 * plus an input box to send a follow-up. Thought parts are hidden; the raw history is kept
 * server-side for replay.
 */

type Part = NonNullable<Content['parts']>[number];

type ToolCall = NonNullable<Part['functionCall']>;
type ToolResponse = NonNullable<Part['functionResponse']>;

type ConversationEntry =
  | { kind: 'text'; key: string; role: string; text: string }
  | { kind: 'tool'; key: string; call?: ToolCall; response?: ToolResponse };

function interpolate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''));
}

/** Short, human-readable summary of a function call. */
function summarizeCall(call: ToolCall, s: ReturnType<typeof useStrings>): string {
  const args = (call.args ?? {}) as {
    book?: string;
    chapter?: number;
    startVerse?: number;
    endVerse?: number;
    languages?: Array<{ language?: string; segments?: unknown[] }>;
    language?: string;
    segmentId?: number;
  };
  if (call.name === 'lookup_bible_passage') {
    const book = args.book ?? '';
    const chapter = args.chapter ?? '';
    const start = args.startVerse;
    const end = args.endVerse;
    const verses = start ? `:${start}${end && end !== start ? `-${end}` : ''}` : '';
    const reference = `${book} ${chapter}${verses}`.trim();
    return interpolate(s.toolActivityLookup, { reference });
  }
  if (call.name === 'set_translations') {
    const langs = args.languages ?? [];
    const languages = langs.map((l) => l.language ?? '?').join(', ');
    return interpolate(s.toolActivitySetTranslations, { languages });
  }
  if (call.name === 'revise_translation') {
    return interpolate(s.toolActivityReviseTranslation, {
      language: args.language ?? '?',
      slide: (args.segmentId ?? 0) + 1,
    });
  }
  return interpolate(s.toolActivityUnknown, { tool: call.name ?? 'tool' });
}

/** Short summary of a tool result; successful edits are visible in the translation grid. */
function summarizeResponse(resp: ToolResponse, s: ReturnType<typeof useStrings>): string {
  const response = (resp.response ?? {}) as {
    error?: string;
    reference?: string;
    passages?: Record<string, string>;
  };
  if (typeof response.error === 'string') {
    return `${s.toolActivityFailed}: ${response.error}`;
  }
  if (resp.name === 'lookup_bible_passage') {
    const passages = response.passages ?? {};
    const langs = Object.keys(passages);
    if (langs.length) {
      return interpolate(s.toolActivityReferenceFound, { languages: langs.join(', ') });
    }
  }
  return s.toolActivityComplete;
}

function buildConversationEntries(messages: Content[]): ConversationEntry[] {
  const entries: ConversationEntry[] = [];
  const pendingCalls: Extract<ConversationEntry, { kind: 'tool' }>[] = [];

  messages.forEach((message, messageIndex) => {
    (message.parts ?? []).forEach((part, partIndex) => {
      if (part.thought) return;

      const key = `m${messageIndex}-p${partIndex}`;
      if (part.functionCall) {
        const entry: Extract<ConversationEntry, { kind: 'tool' }> = {
          kind: 'tool',
          key,
          call: part.functionCall,
        };
        entries.push(entry);
        pendingCalls.push(entry);
        return;
      }
      if (part.functionResponse) {
        const pendingIndex = pendingCalls.findIndex(
          (entry) => entry.call?.name === part.functionResponse?.name,
        );
        if (pendingIndex >= 0) {
          pendingCalls[pendingIndex].response = part.functionResponse;
          pendingCalls.splice(pendingIndex, 1);
        } else {
          entries.push({ kind: 'tool', key, response: part.functionResponse });
        }
        return;
      }

      const text = (part.text ?? '').trim();
      if (text) entries.push({ kind: 'text', key, role: message.role ?? 'user', text });
    });
  });

  return entries;
}

function ToolActivity({
  entry,
  conversationRunning,
  s,
}: {
  entry: Extract<ConversationEntry, { kind: 'tool' }>;
  conversationRunning: boolean;
  s: ReturnType<typeof useStrings>;
}) {
  const summary = entry.call
    ? summarizeCall(entry.call, s)
    : interpolate(s.toolActivityUnknown, { tool: entry.response?.name ?? 'tool' });
  const result = entry.response ? summarizeResponse(entry.response, s) : undefined;
  const hasError = result?.startsWith(`${s.toolActivityFailed}:`) ?? false;
  const status = result ?? (conversationRunning ? s.toolActivityRunning : s.toolActivityNoResult);
  const callArgs = entry.call?.args;
  const responseBody = entry.response?.response;

  return (
    <li
      className={`rounded border px-2 py-1.5 text-sm ${
        hasError
          ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200'
          : 'border-gray-200 bg-white text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium">{summary}</span>
        <span className={`shrink-0 text-xs ${hasError ? '' : 'text-gray-500 dark:text-gray-400'}`}>
          {status}
        </span>
      </div>
      {(callArgs !== undefined || responseBody !== undefined) && (
        <details className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          <summary className="cursor-pointer">{s.toolActivityDetails}</summary>
          {callArgs !== undefined && (
            <pre className="mt-1 overflow-auto whitespace-pre-wrap break-words">
              {JSON.stringify(callArgs, null, 2)}
            </pre>
          )}
          {responseBody !== undefined && (
            <pre className="mt-1 overflow-auto whitespace-pre-wrap break-words">
              {JSON.stringify(responseBody, null, 2)}
            </pre>
          )}
        </details>
      )}
    </li>
  );
}

/**
 * One-line token summary: total prompt/output tokens, how many were served from Gemini's
 * context cache, and the model-call count. The cache figure is the whole point — if it stays
 * near 0 while prompt tokens are large, the re-sent prompt isn't being cached and cost is
 * higher than it should be.
 */
function UsageSummary({ usage }: { usage: TokenUsage }) {
  const cachePct =
    usage.promptTokenCount > 0
      ? Math.round((usage.cachedContentTokenCount / usage.promptTokenCount) * 100)
      : 0;
  return (
    <p className="text-xs text-gray-400 dark:text-gray-500 font-mono" title="Token usage across all agent runs for this item">
      {usage.promptTokenCount.toLocaleString()} in
      {' · '}
      {usage.candidatesTokenCount.toLocaleString()} out
      {' · '}
      {usage.cachedContentTokenCount.toLocaleString()} cached ({cachePct}%)
      {' · '}
      {usage.callCount} {usage.callCount === 1 ? 'call' : 'calls'}
    </p>
  );
}

export interface SlideConversationPanelProps {
  conversation: SlideConversation | null;
  busy: boolean;
  editable: boolean;
  onSend: (text: string) => void;
}

export function SlideConversationPanel({
  conversation,
  busy,
  editable,
  onSend,
}: SlideConversationPanelProps) {
  const s = useStrings();
  const [draft, setDraft] = useState('');

  // Skip the first message: it's the constructed translation prompt (the big slides blob),
  // not something a reviewer needs to read.
  const visible = buildConversationEntries((conversation?.messages ?? []).slice(1));

  const handleSend = () => {
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft('');
  };

  return (
    <div className="flex flex-col gap-2 border-t border-gray-200 dark:border-gray-700 pt-2">
      <div className="flex items-center gap-2">
        <h3 className="font-semibold text-sm text-gray-700 dark:text-gray-200">
          {s.conversationHeader}
        </h3>
        {conversation?.status === 'running' && (
          <span className="text-xs text-blue-600 dark:text-blue-400">{s.agentThinking}</span>
        )}
        {conversation?.usage && conversation.usage.callCount > 0 && (
          <span className="ml-auto">
            <UsageSummary usage={conversation.usage} />
          </span>
        )}
      </div>

      {visible.length === 0 ? (
        <p className={subtleTextClass}>{s.noConversation}</p>
      ) : (
        <ul className="flex flex-col gap-2 max-h-72 overflow-auto">
          {visible.map((entry) => {
            if (entry.kind === 'tool') {
              return (
                <ToolActivity
                  key={entry.key}
                  entry={entry}
                  conversationRunning={conversation?.status === 'running'}
                  s={s}
                />
              );
            }
            return (
              <li
                key={entry.key}
                className={`max-w-[90%] rounded p-2 text-sm whitespace-pre-wrap text-gray-800 dark:text-gray-100 ${
                  entry.role === 'model'
                    ? 'self-start bg-gray-100 dark:bg-gray-800'
                    : 'self-end bg-blue-50 dark:bg-blue-950'
                }`}
              >
                {entry.text}
              </li>
            );
          })}
        </ul>
      )}

      {editable && conversation && (
        <div className="flex items-start gap-2">
          <textarea
            className="flex-1 min-h-10 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-2 text-sm"
            placeholder={s.followUpPlaceholder}
            value={draft}
            disabled={busy}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <button
            type="button"
            className={primaryButtonClass}
            onClick={handleSend}
            disabled={busy || draft.trim() === ''}
          >
            {s.sendMessage}
          </button>
        </div>
      )}
    </div>
  );
}

export default SlideConversationPanel;

/**
 * Browser-side client for the slide-translation server endpoints.
 */
import type {
  SlideLibraryRecord,
  SlideProvenance,
  SlideTranslationEntry,
} from './slideTranslation.ts';
import type { PerSlideTranslation } from './slideItemTranslation.ts';
import type { Content } from '@google/genai';
import { getDocId } from './getDocId.ts';
import { apiFetch } from './writeKey.ts';

export type { Content };

export interface TranslateItemResult {
  translations: Record<string, PerSlideTranslation[]>;
  /** Key under which the agent conversation was stored (itemId, or a content hash). */
  conversationId: string;
}

export type SlideConversationStatus = 'running' | 'idle' | 'error';

/**
 * Token usage summed across an item's agent runs. Mirrors the server's `TokenUsage`
 * (nlp.ts). `cachedContentTokenCount` is the tell for whether Gemini's context cache is
 * serving the re-sent prompt — near-0 against a large `promptTokenCount` means it isn't.
 */
export interface TokenUsage {
  promptTokenCount: number;
  cachedContentTokenCount: number;
  candidatesTokenCount: number;
  thoughtsTokenCount: number;
  totalTokenCount: number;
  callCount: number;
}

/** The server-side agent conversation for one item (raw Gemini history + snapshot). */
export interface SlideConversation {
  itemId: string;
  itemTitle: string;
  slides: string[];
  slidesHash: string;
  languages: string[];
  messages: Content[];
  status: SlideConversationStatus;
  /** Running token total for this conversation; absent on pre-existing conversations. */
  usage?: TokenUsage;
  updatedAt: number;
}

/** A translation the agent revised during a follow-up, for the browser to write to Yjs. */
export interface ConversationTranslationUpdate {
  language: string;
  sourceText: string;
  text: string;
}

export interface ConversationMessageResult {
  conversation: SlideConversation;
  updatedTranslations: ConversationTranslationUpdate[];
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await apiFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`${url} failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

/** Fetch all reviewed library entries. */
export async function fetchLibrary(): Promise<SlideLibraryRecord[]> {
  const response = await apiFetch('/api/slideLibrary');
  if (!response.ok) throw new Error(`/api/slideLibrary failed: ${response.status}`);
  const data = (await response.json()) as { entries: SlideLibraryRecord[] };
  return data.entries;
}

/** Look up reviewed entries for a language, aligned with `texts` (null = no entry). */
export async function lookupLibrary(
  language: string,
  texts: string[],
): Promise<(SlideTranslationEntry | null)[]> {
  const data = await postJson<{ entries: (SlideTranslationEntry | null)[] }>(
    '/api/slideLibrary/lookup',
    { language, texts },
  );
  return data.entries;
}

/** Upsert a reviewed translation into the library. */
export async function upsertLibraryEntry(input: {
  language: string;
  sourceText: string;
  text: string;
  provenance?: SlideProvenance;
}): Promise<SlideLibraryRecord> {
  const data = await postJson<{ record: SlideLibraryRecord }>('/api/slideLibrary', input);
  return data.record;
}

/**
 * Translate a whole item: per language, reviewed-or-auto for every slide.
 *
 * `reference` is an optional free-text dump (possibly multilingual) the model uses where
 * it covers a target language and ignores otherwise.
 */
export async function translateItem(
  slides: string[],
  languages: string[],
  itemTitle?: string,
  itemId?: string,
): Promise<TranslateItemResult> {
  const data = await postJson<{
    translations: Record<string, PerSlideTranslation[]>;
    conversationId: string;
  }>('/api/translateItem', { slides, languages, itemTitle, itemId, docId: getDocId() });
  return {
    translations: data.translations,
    conversationId: data.conversationId,
  };
}

// The conversation itself is read live from the `slideConversations` Y.Map, so there's no
// fetch here — only the writes below, which resume the agent or append a note.

/**
 * Send a follow-up message; resumes the agent and returns any revised translations.
 *
 * `currentTranslations` is the reviewer's live per-language drafts (index-aligned with the
 * conversation's slides). The agent edits against these, so targeted `revise_translation`
 * fixes apply to what is actually on screen — including hand-edits made since the draft run.
 */
export async function sendConversationMessage(
  itemId: string,
  text: string,
  currentTranslations?: Record<string, string[]>,
): Promise<ConversationMessageResult> {
  const data = await postJson<{
    conversation: SlideConversation;
    updatedTranslations?: ConversationTranslationUpdate[];
  }>('/api/slideConversation/message', {
    itemId,
    text,
    currentTranslations,
    docId: getDocId(),
  });
  return {
    conversation: data.conversation,
    updatedTranslations: data.updatedTranslations ?? [],
  };
}

/** Append a reviewer note (e.g. a manual edit) to the conversation; no agent run. */
export async function postConversationNote(itemId: string, text: string): Promise<void> {
  await postJson('/api/slideConversation/note', { itemId, text, docId: getDocId() });
}

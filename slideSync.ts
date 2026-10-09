/**
 * The server side of the Proclaim slide feed (ADR-001).
 *
 * The Proclaim service used to be a Yjs writer *and* the thing that decided when to spend a
 * model call, both from a Mac in a booth through a CRDT client (pycrdt) that cannot tell
 * when its replica has caught up. The rehearsal of 2026-09-10 re-translated a whole item
 * because its first cache lookup ran against an empty replica; two copies of the service
 * would each have paid, and raced each other's writes. Now the service only POSTs what
 * Proclaim shows (a full `FeedSnapshot`, see slide_feed.py) and everything downstream of
 * that lives here, next to the synced server-side doc connection and the library:
 *
 *   - {@link publishSnapshot}: the slide maps browsers read, in one transaction.
 *   - {@link SourceSelector}: with two senders, which one is followed.
 *   - {@link TranslateAhead}: translating the active and upcoming items before they are shown.
 *
 * Everything here takes a plain Y.Doc, so it is testable without Y-Sweet. The caller is
 * responsible for handing over a doc that has finished its initial sync — that is the
 * whole point of moving this here.
 */
import * as Y from 'yjs';

import { slideTranslationKey, type SlideTranslationEntry } from './src/slideTranslation.ts';
import type { PerSlideTranslation } from './src/slideItemTranslation.ts';

// --- The wire shape (FeedSnapshot.to_json() in slide_feed.py) ------------------------

export interface FeedItem {
  itemId: string;
  title: string;
  slides: string[];
  itemKind: string;
  slidesHash: string;
  existingTranslation: string | null;
}

export interface FeedSnapshot {
  onAir: boolean;
  session: { presentationId: string | null; sessionDate: string | null } | null;
  order: string[];
  items: Record<string, FeedItem>;
  activeItemId: string | null;
  activeSlideIndex: number | null;
  seq: number;
}

const isString = (v: unknown): v is string => typeof v === 'string';
const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(isString);

/**
 * Narrow an untrusted request body to a snapshot, or null if it isn't one.
 *
 * Strict on the fields that end up in the doc (a malformed item would be published to every
 * viewer) and lenient on the rest, which only steer decisions here.
 */
export function parseSnapshot(raw: unknown): FeedSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.onAir !== 'boolean' || !isStringArray(r.order ?? [])) return null;
  const items: Record<string, FeedItem> = {};
  const rawItems = (r.items ?? {}) as Record<string, unknown>;
  if (typeof rawItems !== 'object') return null;
  for (const [id, value] of Object.entries(rawItems)) {
    const it = value as Record<string, unknown> | null;
    if (
      !it || !isString(it.itemId) || !isString(it.title) || !isStringArray(it.slides) ||
      !isString(it.itemKind) || !isString(it.slidesHash)
    ) {
      return null;
    }
    items[id] = {
      itemId: it.itemId,
      title: it.title,
      slides: it.slides,
      itemKind: it.itemKind,
      slidesHash: it.slidesHash,
      existingTranslation: isString(it.existingTranslation) ? it.existingTranslation : null,
    };
  }
  const session = r.session as Record<string, unknown> | null | undefined;
  return {
    onAir: r.onAir,
    session: session && typeof session === 'object'
      ? {
          presentationId: isString(session.presentationId) ? session.presentationId : null,
          sessionDate: isString(session.sessionDate) ? session.sessionDate : null,
        }
      : null,
    order: (r.order as string[] | undefined) ?? [],
    items,
    activeItemId: isString(r.activeItemId) ? r.activeItemId : null,
    activeSlideIndex: typeof r.activeSlideIndex === 'number' ? r.activeSlideIndex : null,
    seq: typeof r.seq === 'number' ? r.seq : 0,
  };
}

// --- Publishing ----------------------------------------------------------------------

/** The value stored per item in `proclaimPresentations`. Read by the slide viewers. */
interface PresentationEntry {
  title: string;
  itemId: string;
  slides: string[];
  itemKind: string;
  slidesHash: string;
}

const sameList = (a: unknown, b: string[]) =>
  Array.isArray(a) && a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Write a snapshot's order, presentations and status pointer into the doc, together.
 *
 * One transaction, so a viewer never sees the slide index pointing past the slides it has
 * (#67). Each field is compared with what the doc *already holds* rather than with what this
 * process last wrote: the doc is synced before we get here, so a server restart or a second
 * sender produces no churn, and there is no diff state to reset when the doc changes.
 */
export function publishSnapshot(doc: Y.Doc, snap: FeedSnapshot): void {
  const orderMap = doc.getMap<string[]>('proclaimServiceOrder');
  const presentations = doc.getMap<PresentationEntry>('proclaimPresentations');
  const status = doc.getMap<string | number | null>('proclaimStatus');
  doc.transact(() => {
    if (!sameList(orderMap.get('order'), snap.order)) orderMap.set('order', [...snap.order]);

    for (const [itemId, item] of Object.entries(snap.items)) {
      if (presentations.get(itemId)?.slidesHash === item.slidesHash) continue;
      presentations.set(itemId, {
        title: item.title,
        itemId: item.itemId,
        slides: [...item.slides],
        itemKind: item.itemKind,
        slidesHash: item.slidesHash,
      });
    }

    const itemId = snap.activeItemId;
    const slideIndex = clipSlideIndex(snap, itemId, snap.activeSlideIndex ?? 0);
    if (status.get('itemId') !== itemId) status.set('itemId', itemId);
    if (status.get('slideIndex') !== slideIndex) status.set('slideIndex', slideIndex);
  });
}

/**
 * Keep the pointer inside the active item. Blank items (an image slideshow) collapse to one
 * slide while Proclaim keeps reporting the slideshow's own advancing index; clipping pins
 * those to 0, so a looping slideshow causes no writes at all.
 */
function clipSlideIndex(snap: FeedSnapshot, itemId: string | null, index: number): number {
  const item = itemId ? snap.items[itemId] : undefined;
  if (!item) return index;
  return Math.max(0, Math.min(index, item.slides.length - 1));
}

// --- Source selection ----------------------------------------------------------------

/** How long a source may go without posting before another may take over. */
export const SOURCE_SILENCE_MS = 30_000;

/**
 * Which sender's snapshots are applied, when more than one is posting: **the one that went on
 * air most recently**, among those on air and heard from within {@link SOURCE_SILENCE_MS}.
 *
 * A second machine is most likely an operator following along on another computer (a second
 * display, or standing in for a wedged booth Mac), so going on air is read as "show mine".
 * Ignoring it (first-on-air-wins) would make a rescue impossible without walking to the booth;
 * applying both would flip the slides back and forth on every poll.
 *
 * `onAirSince` is the sender's own word — its clock, reset when its service restarts — and is
 * believed as given. The server keeps no decision of its own: the followed sender is
 * recomputed from this table on every post, so there is nothing to get out of step.
 */
export class SourceSelector {
  /** Per sender: when it says it went on air (null = off air), and when we last heard from it. */
  private seen = new Map<string, { onAirSince: number | null; at: number }>();
  private silenceMs: number;

  constructor(silenceMs: number = SOURCE_SILENCE_MS) {
    this.silenceMs = silenceMs;
  }

  /** Record a post from `source`, and answer which sender is followed now (null: none on air). */
  observe(source: string, onAirSince: number | null, now: number = Date.now()): string | null {
    this.seen.set(source, { onAirSince, at: now });
    return this.followed(now);
  }

  /** The live on-air sender with the latest `onAirSince`, if any. */
  followed(now: number = Date.now()): string | null {
    let best: string | null = null;
    let bestSince = -Infinity;
    for (const [source, s] of this.seen) {
      if (s.onAirSince === null || now - s.at >= this.silenceMs) continue;
      if (s.onAirSince > bestSince) [best, bestSince] = [source, s.onAirSince];
    }
    return best;
  }
}

// --- Translate-ahead -----------------------------------------------------------------

/** Draft an item into every language. Null on failure (best-effort: never throws here). */
export type TranslateItemFn = (params: {
  slides: string[];
  itemTitle: string;
  itemId: string;
  existingTranslation: string | null;
  docId: string;
}) => Promise<Record<string, PerSlideTranslation[]> | null>;

/**
 * Translates service items before they are shown, for one session doc.
 *
 * The decision "is this item already translated?" is made here, against a doc that has
 * finished syncing, by the only process that writes it — not by a client against a replica
 * of unknown freshness. Items are taken active-first, then upcoming, then past; one at a
 * time; and each content version once (keyed by `slidesHash`), so a failure doesn't spin and
 * an edit to the slides earns a fresh attempt. Reviewed entries are never overwritten.
 */
export class TranslateAhead {
  private attempted = new Map<string, string>();
  private latest: FeedSnapshot | null = null;
  private running: Promise<void> | null = null;
  private doc: Y.Doc;
  private docId: string;
  private languages: readonly string[];
  private translate: TranslateItemFn;
  private onError: (err: unknown) => void;

  constructor(
    doc: Y.Doc,
    docId: string,
    languages: readonly string[],
    translate: TranslateItemFn,
    onError: (err: unknown) => void = () => {},
  ) {
    this.doc = doc;
    this.docId = docId;
    this.languages = languages;
    this.translate = translate;
    this.onError = onError;
  }

  /**
   * Hand over the newest snapshot. Starts work if idle; a run in progress picks it up when
   * it finishes its current item. Returns the run, so a test can wait for it to settle.
   */
  offer(snap: FeedSnapshot): Promise<void> {
    this.latest = snap;
    this.running ??= this.drain().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async drain(): Promise<void> {
    for (let item = this.nextPending(); item; item = this.nextPending()) {
      this.attempted.set(item.itemId, item.slidesHash);
      try {
        const translations = await this.translate({
          slides: item.slides,
          itemTitle: item.title,
          itemId: item.itemId,
          existingTranslation: item.existingTranslation,
          docId: this.docId,
        });
        if (translations) storeTranslations(this.doc, item.slides, translations);
      } catch (err) {
        this.onError(err);
      }
    }
  }

  private nextPending(): FeedItem | null {
    const snap = this.latest;
    if (!snap) return null;
    const map = this.doc.getMap<SlideTranslationEntry>('slideTranslations');
    for (const id of scanOrder(snap)) {
      const item = snap.items[id];
      if (!item || item.slides.length === 0) continue;
      if (this.attempted.get(id) === item.slidesHash) continue;
      const missing = this.languages.some((language) =>
        item.slides.some((s) => s.trim() && !map.has(slideTranslationKey(language, s))),
      );
      if (missing) return item;
      this.attempted.set(id, item.slidesHash); // fully covered already; don't re-check
    }
    return null;
  }
}

/** Item ids in the order worth translating them: active, then upcoming, then past. */
export function scanOrder(snap: FeedSnapshot): string[] {
  const i = snap.activeItemId ? snap.order.indexOf(snap.activeItemId) : -1;
  return i < 0 ? [...snap.order] : [...snap.order.slice(i), ...snap.order.slice(0, i)];
}

/** Write per-slide results into `slideTranslations`, leaving reviewed entries alone. */
export function storeTranslations(
  doc: Y.Doc,
  slides: string[],
  translations: Record<string, PerSlideTranslation[]>,
): void {
  const map = doc.getMap<SlideTranslationEntry>('slideTranslations');
  doc.transact(() => {
    for (const [language, perSlide] of Object.entries(translations)) {
      slides.forEach((slide, i) => {
        const entry = perSlide[i];
        if (!slide.trim() || !entry) return;
        const key = slideTranslationKey(language, slide);
        if (map.get(key)?.status === 'reviewed') return;
        map.set(key, {
          text: entry.text ?? '',
          status: entry.status ?? 'auto',
          provenance: entry.provenance ?? 'llm',
        });
      });
    }
  });
}

// --- What the service says about itself ------------------------------------------------

/**
 * Write the sender's self-report into `status.proclaimService`, where /status reads the
 * version and "update pending" flag. Only when it changed: the POST arrives every few
 * seconds, and liveness is shown from the writer sighting instead of churning the doc.
 */
export function announceService(doc: Y.Doc, entry: Record<string, unknown>): void {
  const status = doc.getMap<Record<string, unknown>>('status');
  if (JSON.stringify(status.get('proclaimService')) === JSON.stringify(entry)) return;
  status.set('proclaimService', entry);
}

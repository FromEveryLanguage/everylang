/**
 * The slide feed's server half, on plain local Y.Docs. The Python tests these replace
 * (test_yjs_publisher.py, test_slide_translator.py) were the spec for the port.
 */
import { describe, it, expect, vi } from 'vitest';
import * as Y from 'yjs';

import {
  SourceSelector,
  TranslateAhead,
  announceService,
  parseSnapshot,
  publishSnapshot,
  scanOrder,
  storeTranslations,
  type FeedItem,
  type FeedSnapshot,
  type TranslateItemFn,
} from './slideSync.ts';
import { slidesHash } from './slideConversationStore.ts';
import { slideTranslationKey } from './src/slideTranslation.ts';

function item(itemId: string, slides: string[], itemKind = 'Content'): FeedItem {
  return { itemId, title: itemId.toUpperCase(), slides, itemKind, slidesHash: slidesHash(slides), existingTranslation: null };
}

function snap(overrides: Partial<FeedSnapshot> = {}): FeedSnapshot {
  return {
    onAir: true,
    session: { presentationId: 'p1', sessionDate: '2030-01-15' },
    order: ['a', 'b'],
    items: { a: item('a', ['One', 'Two']), b: item('b', ['Three']) },
    activeItemId: 'a',
    activeSlideIndex: 1,
    seq: 1,
    ...overrides,
  };
}

/** Count doc updates, so "wrote nothing" and "wrote once" are assertable. */
function countUpdates(doc: Y.Doc): () => number {
  let n = 0;
  doc.on('update', () => n++);
  return () => n;
}

describe('publishSnapshot', () => {
  it('writes order, presentations and status', () => {
    const doc = new Y.Doc();
    publishSnapshot(doc, snap());
    expect(doc.getMap('proclaimServiceOrder').get('order')).toEqual(['a', 'b']);
    expect(doc.getMap('proclaimPresentations').get('a')).toEqual({
      title: 'A', itemId: 'a', slides: ['One', 'Two'], itemKind: 'Content', slidesHash: slidesHash(['One', 'Two']),
    });
    expect(doc.getMap('proclaimStatus').toJSON()).toEqual({ itemId: 'a', slideIndex: 1 });
  });

  it('lands everything in one transaction', () => {
    const doc = new Y.Doc();
    const updates = countUpdates(doc);
    publishSnapshot(doc, snap());
    expect(updates()).toBe(1);
  });

  it('writes nothing when the doc already holds the snapshot', () => {
    const doc = new Y.Doc();
    publishSnapshot(doc, snap());
    const updates = countUpdates(doc);
    publishSnapshot(doc, snap({ seq: 2 }));
    expect(updates()).toBe(0);
  });

  it('diffs against the doc, not memory: a fresh process on a synced doc does not rewrite', () => {
    const original = new Y.Doc();
    publishSnapshot(original, snap());
    const replica = new Y.Doc();
    Y.applyUpdate(replica, Y.encodeStateAsUpdate(original));
    const updates = countUpdates(replica);
    publishSnapshot(replica, snap());
    expect(updates()).toBe(0);
  });

  it('clips the slide index into the active item', () => {
    const doc = new Y.Doc();
    publishSnapshot(doc, snap({ activeSlideIndex: 9 }));
    expect(doc.getMap('proclaimStatus').get('slideIndex')).toBe(1);
    publishSnapshot(doc, snap({ activeSlideIndex: -3 }));
    expect(doc.getMap('proclaimStatus').get('slideIndex')).toBe(0);
  });

  it('a looping blank slideshow produces no writes', () => {
    const doc = new Y.Doc();
    const blank = { items: { s: item('s', [''], 'ImageSlideshow') }, order: ['s'], activeItemId: 's' };
    publishSnapshot(doc, snap({ ...blank, activeSlideIndex: 0 }));
    const updates = countUpdates(doc);
    for (const i of [1, 2, 3]) publishSnapshot(doc, snap({ ...blank, activeSlideIndex: i }));
    expect(updates()).toBe(0);
  });

  it('rewrites an item whose slides changed, and only that item', () => {
    const doc = new Y.Doc();
    publishSnapshot(doc, snap());
    const presentations = doc.getMap('proclaimPresentations');
    const changed: string[] = [];
    presentations.observe((e) => changed.push(...e.keysChanged));
    publishSnapshot(doc, snap({ items: { a: item('a', ['One', 'Two!']), b: item('b', ['Three']) } }));
    expect(changed).toEqual(['a']);
  });
});

describe('parseSnapshot', () => {
  it('round-trips the wire shape', () => {
    expect(parseSnapshot(JSON.parse(JSON.stringify(snap())))).toEqual(snap());
  });

  it('refuses an item that would publish garbage', () => {
    const bad = JSON.parse(JSON.stringify(snap()));
    bad.items.a.slides = 'not a list';
    expect(parseSnapshot(bad)).toBeNull();
    expect(parseSnapshot({})).toBeNull();
    expect(parseSnapshot(null)).toBeNull();
  });
});

describe('storeTranslations', () => {
  it('writes content-addressed entries and skips empty slides', () => {
    const doc = new Y.Doc();
    storeTranslations(doc, ['Hello', ' '], {
      French: [{ text: 'Bonjour', status: 'auto', provenance: 'llm' }, { text: 'x', status: 'auto', provenance: 'llm' }],
    });
    const map = doc.getMap('slideTranslations');
    expect(map.get(slideTranslationKey('French', 'Hello'))).toEqual({ text: 'Bonjour', status: 'auto', provenance: 'llm' });
    expect(map.size).toBe(1);
  });

  it('never overwrites a reviewed entry', () => {
    const doc = new Y.Doc();
    const key = slideTranslationKey('French', 'Hello');
    const reviewed = { text: 'Salut', status: 'reviewed', provenance: 'human' };
    doc.getMap('slideTranslations').set(key, reviewed);
    storeTranslations(doc, ['Hello'], { French: [{ text: 'Bonjour', status: 'auto', provenance: 'llm' }] });
    expect(doc.getMap('slideTranslations').get(key)).toEqual(reviewed);
  });
});

describe('scanOrder', () => {
  it('goes active, upcoming, then past', () => {
    expect(scanOrder(snap({ order: ['a', 'b', 'c', 'd'], activeItemId: 'c' }))).toEqual(['c', 'd', 'a', 'b']);
    expect(scanOrder(snap({ order: ['a', 'b'], activeItemId: null }))).toEqual(['a', 'b']);
  });
});

describe('TranslateAhead', () => {
  const echo: TranslateItemFn = async ({ slides }) => ({
    French: slides.map((s) => ({ text: `fr:${s}`, status: 'auto' as const, provenance: 'llm' as const })),
  });

  it('translates every missing item, active first', async () => {
    const doc = new Y.Doc();
    const translate = vi.fn(echo);
    await new TranslateAhead(doc, 'doc-x', ['French'], translate).offer(snap({ activeItemId: 'b' }));
    expect(translate.mock.calls.map(([p]) => p.itemId)).toEqual(['b', 'a']);
    expect(translate.mock.calls[0][0].docId).toBe('doc-x');
    expect(doc.getMap('slideTranslations').get(slideTranslationKey('French', 'Three'))).toMatchObject({ text: 'fr:Three' });
  });

  it('spends nothing on an item the synced doc already covers', async () => {
    const doc = new Y.Doc();
    for (const s of ['One', 'Two', 'Three']) {
      doc.getMap('slideTranslations').set(slideTranslationKey('French', s), { text: s, status: 'reviewed', provenance: 'human' });
    }
    const translate = vi.fn(echo);
    await new TranslateAhead(doc, 'doc-x', ['French'], translate).offer(snap());
    expect(translate).not.toHaveBeenCalled();
  });

  it('attempts each content version once, even when the attempt fails', async () => {
    const doc = new Y.Doc();
    const translate = vi.fn<TranslateItemFn>(async () => null);
    const worker = new TranslateAhead(doc, 'doc-x', ['French'], translate);
    await worker.offer(snap());
    await worker.offer(snap({ seq: 2 }));
    expect(translate).toHaveBeenCalledTimes(2); // a and b, once each

    await worker.offer(snap({ items: { a: item('a', ['One', 'Two edited']), b: item('b', ['Three']) } }));
    expect(translate).toHaveBeenCalledTimes(3); // only the edited item comes back
  });

  it('runs one item at a time and picks up the newest snapshot as it goes', async () => {
    const doc = new Y.Doc();
    let inFlight = 0;
    let maxInFlight = 0;
    const translate = vi.fn<TranslateItemFn>(async (p) => {
      maxInFlight = Math.max(maxInFlight, ++inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return echo(p);
    });
    const worker = new TranslateAhead(doc, 'doc-x', ['French'], translate);
    const first = worker.offer(snap({ order: ['a'], items: { a: item('a', ['One']) } }));
    void worker.offer(snap({ order: ['a', 'c'], items: { a: item('a', ['One']), c: item('c', ['Four']) } }));
    await first;
    expect(maxInFlight).toBe(1);
    expect(translate.mock.calls.map(([p]) => p.itemId)).toEqual(['a', 'c']);
  });

  it('forwards the existing translation as grounding', async () => {
    const doc = new Y.Doc();
    const translate = vi.fn(echo);
    const grounded = { ...item('a', ['One']), existingTranslation: 'Un' };
    await new TranslateAhead(doc, 'doc-x', ['French'], translate).offer(snap({ order: ['a'], items: { a: grounded } }));
    expect(translate.mock.calls[0][0].existingTranslation).toBe('Un');
  });

  it('reports a throwing translator and keeps going', async () => {
    const doc = new Y.Doc();
    const onError = vi.fn();
    const translate = vi.fn<TranslateItemFn>(async (p) => {
      if (p.itemId === 'a') throw new Error('boom');
      return echo(p);
    });
    await new TranslateAhead(doc, 'doc-x', ['French'], translate, onError).offer(snap());
    expect(onError).toHaveBeenCalledOnce();
    expect(doc.getMap('slideTranslations').has(slideTranslationKey('French', 'Three'))).toBe(true);
  });
});

describe('SourceSelector', () => {
  // observe(source, onAirSince | null, now): the sender's own on-air time, or null if off air.
  it('follows whichever sender went on air most recently', () => {
    const s = new SourceSelector(30_000);
    expect(s.observe('mac', 100, 1_000)).toBe('mac');
    expect(s.observe('laptop', 500, 2_000)).toBe('laptop');
    // The booth keeps posting, but it went on air earlier: the laptop stays followed.
    expect(s.observe('mac', 100, 3_000)).toBe('laptop');
  });

  it('nobody is followed while everyone is off air', () => {
    const s = new SourceSelector(30_000);
    expect(s.observe('mac', null, 0)).toBeNull();
  });

  it('returns to the other sender when the followed one goes off air', () => {
    const s = new SourceSelector(30_000);
    s.observe('mac', 100, 1_000);
    s.observe('laptop', 500, 2_000);
    expect(s.observe('laptop', null, 3_000)).toBe('mac');
  });

  it('a sender that goes silent drops out without anyone else posting', () => {
    const s = new SourceSelector(30_000);
    s.observe('mac', 100, 0);
    s.observe('laptop', 500, 0);
    s.observe('mac', 100, 20_000); // the laptop has stopped posting
    expect(s.followed(29_000)).toBe('laptop');
    expect(s.followed(35_000)).toBe('mac');
    expect(s.followed(60_000)).toBeNull();
  });

  it('a restarted sender reports a fresh on-air time and is followed again', () => {
    const s = new SourceSelector(30_000);
    s.observe('mac', 100, 1_000);
    s.observe('laptop', 500, 2_000);
    expect(s.observe('mac', 900, 3_000)).toBe('mac');
  });
});

describe('announceService', () => {
  it('writes only when the report changed', () => {
    const doc = new Y.Doc();
    announceService(doc, { gitShaShort: 'abc1234', updatePending: false });
    const updates = countUpdates(doc);
    announceService(doc, { gitShaShort: 'abc1234', updatePending: false });
    expect(updates()).toBe(0);
    announceService(doc, { gitShaShort: 'def5678', updatePending: false });
    expect(updates()).toBe(1);
  });
});

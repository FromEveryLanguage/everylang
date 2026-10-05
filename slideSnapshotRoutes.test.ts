/**
 * `POST /api/proclaim/snapshot` over a real socket, with local Y.Docs standing in for the
 * synced Y-Sweet connections. The replay test is the successor of test_slide_seam.py: the
 * committed recording, posted line by line, settles into the doc browsers read.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import express from 'express';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import * as Y from 'yjs';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { WriteAuth, resolveWriteAuthConfig } from './writeAuth.ts';
import { SessionRegistry } from './sessionRegistry.ts';
import { makeSlideSnapshotRouter } from './slideSnapshotRoutes.ts';
import type { FeedSnapshot, TranslateItemFn } from './slideSync.ts';
import { slideTranslationKey } from './src/slideTranslation.ts';

const BOOTH_KEY = '0123456789abcdef0123';
const LAPTOP_KEY = 'fedcba9876543210fedc';
const LANGS = ['French', 'Spanish'];
const FIXTURE = path.join(import.meta.dirname, 'tests/fixtures/synthetic_service.jsonl');

const servers: Server[] = [];
let dir: string;
let registry: SessionRegistry;
let docs: Map<string, Y.Doc>;
let translate: ReturnType<typeof vi.fn<TranslateItemFn>>;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'slide-snapshot-'));
  registry = new SessionRegistry(path.join(dir, 'current-session.json'));
  await registry.load();
  docs = new Map();
  translate = vi.fn<TranslateItemFn>(async ({ slides }) =>
    Object.fromEntries(
      LANGS.map((l) => [l, slides.map((s) => ({ text: `${l}:${s}`, status: 'auto' as const, provenance: 'llm' as const }))]),
    ),
  );
});

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(r))));
  await fs.rm(dir, { recursive: true, force: true });
});

async function serve(
  mode: 'observe' | 'enforce' = 'enforce',
  log: (message: string) => void = () => {},
): Promise<string> {
  const writeAuth = new WriteAuth(
    resolveWriteAuthConfig({
      WRITE_KEYS: `booth:${BOOTH_KEY},laptop:${LAPTOP_KEY}`,
      WRITE_AUTH_MODE: mode,
    }),
  );
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use(
    '/api/proclaim',
    makeSlideSnapshotRouter({
      registry,
      writeAuth,
      getDoc: async (docId) => {
        if (!docs.has(docId)) docs.set(docId, new Y.Doc());
        return docs.get(docId)!;
      },
      translate,
      languages: LANGS,
      log,
    }),
  );
  const server = app.listen(0);
  servers.push(server);
  await new Promise((r) => server.once('listening', r));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function post(base: string, body: unknown, key: string | null = BOOTH_KEY) {
  const res = await fetch(`${base}/api/proclaim/snapshot`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(key ? { 'x-write-key': key } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function fixture(): Promise<FeedSnapshot[]> {
  const text = await fs.readFile(FIXTURE, 'utf-8');
  return text.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l).snapshot);
}

const onAir = (overrides: Partial<FeedSnapshot> = {}): FeedSnapshot => ({
  onAir: true,
  session: { presentationId: 'p', sessionDate: null },
  order: ['a'],
  items: { a: { itemId: 'a', title: 'A', slides: ['Hello'], itemKind: 'Content', slidesHash: 'h1', existingTranslation: null } },
  activeItemId: 'a',
  activeSlideIndex: 0,
  seq: 1,
  ...overrides,
});

describe('POST /api/proclaim/snapshot', () => {
  it('replays the recorded service into the session doc', async () => {
    const base = await serve();
    let docId = '';
    for (const snapshot of await fixture()) {
      const { status, body } = await post(base, { snapshot, service: { host: 'booth-mac', instance: 'i1', gitShaShort: 'abc1234' } });
      expect(status).toBe(200);
      docId = body.docId as string;
    }
    // The fixture's show is dated in the past, so the registry keeps today's doc (#111).
    expect(docId).toBe(registry.current().docId);
    const doc = docs.get(docId)!;

    expect(doc.getMap('proclaimServiceOrder').get('order')).toEqual(['welcome', 'song1', 'sermon']);
    const presentations = doc.getMap<{ slides: string[]; itemKind: string }>('proclaimPresentations');
    expect([...presentations.keys()].sort()).toEqual(['sermon', 'song1', 'welcome']);
    expect(presentations.get('song1')?.itemKind).toBe('SongLyrics');
    // The last on-air snapshot wins; the trailing off-air one writes nothing.
    expect(doc.getMap('proclaimStatus').toJSON()).toEqual({ itemId: 'sermon', slideIndex: 1 });
    expect(doc.getMap('status').get('proclaimService')).toMatchObject({ gitShaShort: 'abc1234', host: 'booth-mac' });

    await vi.waitFor(() => {
      const translations = doc.getMap<{ text: string }>('slideTranslations');
      for (const { slides } of presentations.values()) {
        for (const slide of slides.filter((s) => s.trim())) {
          for (const lang of LANGS) {
            expect(translations.get(slideTranslationKey(lang, slide))?.text).toBe(`${lang}:${slide}`);
          }
        }
      }
    });
    // Once per item, despite many snapshots carrying each one.
    expect(translate.mock.calls.length).toBe(presentations.size);
  });

  it('refuses a sender without a key when enforcing', async () => {
    const base = await serve('enforce');
    expect((await post(base, { snapshot: onAir() }, null)).status).toBe(401);
    expect(docs.size).toBe(0);
  });

  it('refuses a malformed snapshot', async () => {
    const base = await serve();
    expect((await post(base, { snapshot: { onAir: 'yes' } })).status).toBe(400);
  });

  it('follows the sender that went on air most recently; the other is heard but not applied', async () => {
    const base = await serve();
    const other = { a: { itemId: 'a', title: 'Other', slides: ['Hi'], itemKind: 'Content', slidesHash: 'h2', existingTranslation: null } };
    const booth = await post(base, { snapshot: onAir(), onAirSince: '2026-10-04T14:00:00Z', service: { host: 'mac' } }, BOOTH_KEY);
    expect(booth.body).toMatchObject({ active: true, applied: true, followed: 'booth@mac' });

    const laptop = await post(base, { snapshot: onAir({ items: other }), onAirSince: '2026-10-04T14:05:00Z', service: { host: 'laptop' } }, LAPTOP_KEY);
    expect(laptop.body).toMatchObject({ active: true, applied: true, followed: 'laptop@laptop' });
    const doc = docs.get(booth.body.docId as string)!;
    expect(doc.getMap<{ title: string }>('proclaimPresentations').get('a')?.title).toBe('Other');

    // The booth's next heartbeat changes nothing: it went on air earlier.
    const again = await post(base, { snapshot: onAir(), onAirSince: '2026-10-04T14:00:00Z', service: { host: 'mac' } }, BOOTH_KEY);
    expect(again.body).toMatchObject({ active: false, applied: false, followed: 'laptop@laptop' });
    expect(doc.getMap<{ title: string }>('proclaimPresentations').get('a')?.title).toBe('Other');
    // Both are visible as writers, so "posting but not followed" is not a mystery.
    // (The booth's earlier, followed sighting stays listed until it ages out.)
    expect(registry.recentWriters().map((w) => w.writer)).toEqual(expect.arrayContaining(['booth@mac (standby)', 'laptop@laptop']));
  });

  it('a replay into an explicit doc never takes the live slides', async () => {
    const base = await serve();
    await post(base, { snapshot: onAir(), onAirSince: '2026-10-04T14:00:00Z', service: { host: 'mac' } }, BOOTH_KEY);
    await post(base, { snapshot: onAir(), onAirSince: '2026-10-04T15:00:00Z', docId: 'doc-test-1', service: { host: 'laptop' } }, LAPTOP_KEY);
    const booth = await post(base, { snapshot: onAir(), onAirSince: '2026-10-04T14:00:00Z', service: { host: 'mac' } }, BOOTH_KEY);
    expect(booth.body).toMatchObject({ active: true, followed: 'booth@mac' });
  });

  it('an off-air snapshot is a heartbeat, not a write', async () => {
    const base = await serve();
    const { body } = await post(base, { snapshot: onAir({ onAir: false }), service: { host: 'mac' } });
    expect(body).toMatchObject({ applied: false });
    expect(docs.size).toBe(0);
    expect(registry.recentWriters()).toHaveLength(1);
  });

  it('drops a reordered snapshot from the same process', async () => {
    const base = await serve();
    const service = { host: 'mac', instance: 'run-1' };
    await post(base, { snapshot: onAir({ seq: 5, activeSlideIndex: 0 }), service });
    const late = await post(base, { snapshot: onAir({ seq: 4, items: { a: { itemId: 'a', title: 'Old', slides: ['x'], itemKind: 'Content', slidesHash: 'h0', existingTranslation: null } } }), service });
    expect(late.body).toMatchObject({ applied: false });
    // A restart (new instance) starts its count over and is applied.
    const restarted = await post(base, { snapshot: onAir({ seq: 1 }), service: { ...service, instance: 'run-2' } });
    expect(restarted.body).toMatchObject({ applied: true });
  });

  it('an accepted proposal names the doc', async () => {
    const base = await serve();
    const { body } = await post(base, { snapshot: onAir(), proposal: { sessionDate: '2099-01-04' } });
    expect(body).toMatchObject({ docId: 'doc-2099-01-04', outcome: 'accepted', source: 'proposal' });
    expect(docs.has('doc-2099-01-04')).toBe(true);
  });

  it('logs a refused proposal once, not on every heartbeat', async () => {
    const log = vi.fn();
    const base = await serve('enforce', log);
    const stale = { snapshot: onAir(), proposal: { sessionDate: '2000-01-02' } };
    for (let i = 0; i < 3; i++) expect((await post(base, stale)).body).toMatchObject({ outcome: 'stale' });
    expect(log).toHaveBeenCalledTimes(1);
    // Accepted in between, then refused again: that is news, so it is logged again.
    await post(base, { snapshot: onAir(), proposal: { sessionDate: '2099-01-04' } });
    await post(base, stale);
    expect(log).toHaveBeenCalledTimes(2);
  });

  it('an explicit docId bypasses the registry (replay into a throwaway doc)', async () => {
    const base = await serve();
    const { body } = await post(base, { snapshot: onAir(), docId: 'doc-test-123' });
    expect(body).toMatchObject({ docId: 'doc-test-123', source: 'override', applied: true });
    expect(registry.current().source).toBe('date');
  });
});

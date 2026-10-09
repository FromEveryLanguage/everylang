/**
 * Wiring tests for POST /api/session/clearTranscripts: a real express app, the real
 * WriteAuth, over a real socket — the same shape as sessionRoutes.test.ts. A plain Y.Doc
 * stands in for Y-Sweet, reached only through the read/write-as-update pair the route
 * is given in server.ts.
 */
import { describe, it, expect, afterEach } from 'vitest';
import express from 'express';
import * as Y from 'yjs';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { WriteAuth, resolveWriteAuthConfig } from './writeAuth.ts';
import { makeTranscriptResetRouter } from './transcriptResetRoutes.ts';
import { TranscriptSegmentLog } from './live-audio/transcript-log.ts';
import { readTranscriptSegments } from './src/transcriptKeys.ts';

const GOOD_KEY = '0123456789abcdef0123';
const DOC_ID = 'doc-2026-10-11';

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))),
  );
});

/** The "Y-Sweet" side: one doc, plus a hook to run between the route's read and write. */
function fakeStore() {
  const doc = new Y.Doc();
  const store = {
    doc,
    betweenReadAndWrite: () => {},
    readDoc: async () => {
      const update = Y.encodeStateAsUpdate(doc);
      store.betweenReadAndWrite();
      return update;
    },
    writeDoc: async (_docId: string, update: Uint8Array) => {
      Y.applyUpdate(doc, update);
    },
  };
  return store;
}

async function serve(
  store: ReturnType<typeof fakeStore>,
  broadcasterPresent: () => Promise<boolean> = async () => false,
): Promise<string> {
  const writeAuth = new WriteAuth(
    resolveWriteAuthConfig({ WRITE_KEYS: `booth:${GOOD_KEY}`, WRITE_AUTH_MODE: 'enforce' }),
  );
  const app = express();
  app.use(express.json());
  app.use(
    '/api/session',
    makeTranscriptResetRouter({
      requireWriteKey: (route) => (req, res, next) => {
        if (writeAuth.gate(req, res, route)) next();
      },
      readDoc: store.readDoc,
      writeDoc: store.writeDoc,
      broadcasterPresent,
    }),
  );
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  servers.push(server);
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

function clear(base: string, body: unknown, key: string | null = GOOD_KEY) {
  return fetch(`${base}/api/session/clearTranscripts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(key ? { 'X-Write-Key': key } : {}) },
    body: JSON.stringify(body),
  });
}

/** A demo's worth of transcript, written the way the live pipeline writes it. */
function speakDemo(doc: Y.Doc) {
  const log = new TranscriptSegmentLog(doc);
  log.append('es', 'Esto es una demostración.', 1_000);
  log.append('en', 'This is a demo.', 1_000);
}

describe('POST /api/session/clearTranscripts', () => {
  it('deletes the transcripts and says which', async () => {
    const store = fakeStore();
    speakDemo(store.doc);
    const base = await serve(store);

    const response = await clear(base, { docId: DOC_ID });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ cleared: ['en', 'es'] });
    expect(readTranscriptSegments(store.doc, 'es')).toEqual([]);
    expect(readTranscriptSegments(store.doc, 'en')).toEqual([]);
  });

  it('needs a write key — it deletes for every viewer', async () => {
    const store = fakeStore();
    speakDemo(store.doc);
    const base = await serve(store);

    const response = await clear(base, { docId: DOC_ID }, null);

    expect(response.ok).toBe(false);
    expect(readTranscriptSegments(store.doc, 'es')).toHaveLength(1);
  });

  it('refuses while a broadcaster is live, until confirmed', async () => {
    const store = fakeStore();
    speakDemo(store.doc);
    const base = await serve(store, async () => true);

    const refused = await clear(base, { docId: DOC_ID });
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ reason: 'broadcaster-live' });
    expect(readTranscriptSegments(store.doc, 'es')).toHaveLength(1);

    const forced = await clear(base, { docId: DOC_ID, force: true });
    expect(forced.status).toBe(200);
    expect(readTranscriptSegments(store.doc, 'es')).toEqual([]);
  });

  it("treats a LiveKit it can't read as possibly live, not as empty", async () => {
    const store = fakeStore();
    speakDemo(store.doc);
    const base = await serve(store, async () => {
      throw new Error('LiveKit unreachable');
    });

    const response = await clear(base, { docId: DOC_ID });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ reason: 'presence-unknown' });
  });

  it('keeps speech that arrives while the clear is in flight', async () => {
    const store = fakeStore();
    speakDemo(store.doc);
    // The service starts talking after the route read the doc but before it wrote back.
    store.betweenReadAndWrite = () => {
      new TranscriptSegmentLog(store.doc).append('en', 'Good morning.', 60_000);
    };
    const base = await serve(store);

    await clear(base, { docId: DOC_ID });

    expect(readTranscriptSegments(store.doc, 'en').map((s) => s.text)).toEqual(['Good morning.']);
    expect(readTranscriptSegments(store.doc, 'es')).toEqual([]);
  });

  it('rejects a malformed doc id', async () => {
    const base = await serve(fakeStore());
    const response = await clear(base, { docId: '../etc' });
    expect(response.status).toBe(400);
  });
});

/**
 * `POST /api/proclaim/snapshot` — where the Proclaim service hands over what it sees (ADR-001).
 *
 * Split out of server.ts, like sessionRoutes.ts, so it can be driven against a bare express
 * app and a local Y.Doc. The service posts a full snapshot on every change and as a
 * heartbeat; this route decides which doc it belongs to, whether this sender is the one
 * being followed, publishes it, and kicks the translate-ahead worker. The response tells the
 * service which doc its slides went to, so its log says what actually happened (#111).
 */
import { Router } from 'express';
import type * as Y from 'yjs';

import type { SessionRegistry } from './sessionRegistry.ts';
import type { WriteAuth } from './writeAuth.ts';
import { isValidDocId } from './src/sessionCurrent.ts';
import {
  SourceSelector,
  TranslateAhead,
  announceService,
  parseSnapshot,
  publishSnapshot,
  type TranslateItemFn,
} from './slideSync.ts';

export interface SlideSnapshotRoutesDeps {
  registry: SessionRegistry;
  writeAuth: WriteAuth;
  /** A server-side connection to `docId`, resolved only once its initial sync is done. */
  getDoc: (docId: string) => Promise<Y.Doc>;
  translate: TranslateItemFn;
  languages: readonly string[];
  selector?: SourceSelector;
  log?: (message: string) => void;
  onError?: (err: unknown) => void;
}

/** A `YYYY-MM-DD` date, the only form a proposal's session date may take. */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ROUTE = '/api/proclaim/snapshot';

export function makeSlideSnapshotRouter({
  registry,
  writeAuth,
  getDoc,
  translate,
  languages,
  selector = new SourceSelector(),
  log = () => {},
  onError = () => {},
}: SlideSnapshotRoutesDeps): Router {
  const router = Router();
  const workers = new Map<string, TranslateAhead>();
  /** Last (instance, seq) per source, so a late retry can't roll the slides back. */
  const lastSeq = new Map<string, { instance: string; seq: number }>();
  /** Last refusal logged per source: a pin holds all service, and every POST would repeat it. */
  const lastRefusal = new Map<string, string>();

  router.post('/snapshot', async (req, res) => {
    const { result, allowed } = writeAuth.check(req, ROUTE);
    if (!allowed) {
      res.status(401).json({ ok: false, error: 'This request needs a valid write key.' });
      return;
    }
    const snap = parseSnapshot(req.body?.snapshot);
    if (!snap) {
      res.status(400).json({ ok: false, error: 'snapshot is missing or malformed' });
      return;
    }
    const service = (req.body?.service ?? {}) as Record<string, unknown>;
    const host = typeof service.host === 'string' && service.host ? service.host : 'unknown-host';
    const instance = typeof service.instance === 'string' ? service.instance : '';
    // Who is sending: the write key's label is the device; the host keeps two keyless
    // senders (observe mode) apart. Stable across restarts, so a relaunch keeps its place.
    const source = `${result.label ?? 'no-key'}@${host}`;

    const prev = lastSeq.get(source);
    const stale = prev !== undefined && prev.instance === instance && snap.seq <= prev.seq;
    if (!stale) lastSeq.set(source, { instance, seq: snap.seq });

    // An explicit doc (the replay harness, a test) is the sender's own business: it bypasses
    // both the registry and source selection, like `?doc=` in a browser.
    const override = req.body?.docId;
    if (override !== undefined && !isValidDocId(override)) {
      res.status(400).json({ ok: false, error: 'docId must look like doc-2026-08-30' });
      return;
    }
    const active = override !== undefined || selector.observe(source, snap.onAir);

    let docId: string;
    let docSource: string;
    let outcome: string | null = null;
    if (override !== undefined) {
      [docId, docSource] = [override, 'override'];
    } else if (active && snap.onAir) {
      // Only the followed sender proposes: a laptop opening next week's deck must not move
      // the session for everyone while the booth Mac is the one on screen.
      const rawDate = req.body?.proposal?.sessionDate ?? snap.session?.sessionDate;
      const sessionDate = typeof rawDate === 'string' && DATE_PATTERN.test(rawDate) ? rawDate : null;
      const proposal = await registry.propose(sessionDate, source);
      ({ docId, source: docSource } = proposal.session);
      outcome = proposal.outcome;
      const refusal = outcome === 'stale' || outcome === 'pinned' ? `${rawDate} ${outcome} ${docId}` : '';
      if (refusal && lastRefusal.get(source) !== refusal) {
        log(`[slides] ${source} proposed ${rawDate}; ${outcome}, using ${docId}`);
      }
      lastRefusal.set(source, refusal);
    } else {
      ({ docId, source: docSource } = registry.current());
    }

    // The POST is the heartbeat; /status shows how long ago each sender was seen.
    registry.noteWriter(active ? source : `${source} (standby)`, docId);

    const applied = active && snap.onAir && !stale;
    if (applied) {
      const doc = await getDoc(docId);
      publishSnapshot(doc, snap);
      announceService(doc, { ...service, role: 'proclaim-service', source, docId });
      let worker = workers.get(docId);
      if (!worker) {
        worker = new TranslateAhead(doc, docId, languages, translate, onError);
        workers.set(docId, worker);
      }
      void worker.offer(snap);
    }

    res.json({ ok: true, docId, source: docSource, outcome, active, applied });
  });

  return router;
}

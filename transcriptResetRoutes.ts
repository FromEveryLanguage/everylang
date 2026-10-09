/**
 * `POST /api/session/clearTranscripts` — start a session's live transcripts over.
 *
 * Exists because demos happen in the real session doc on purpose (the congregation's
 * phones are already on the right page), and a demo's transcript otherwise sits at the
 * top of every pane and every export of the service that follows it.
 *
 * Done on the server rather than from the browser: a page without a writable Y-Sweet
 * token (the status page, opened without `#editor`) would have its delete silently
 * discarded, and only the server can see who is in the LiveKit room.
 *
 * The one guard is a broadcaster being live. Listeners in the room are the normal state
 * of a Sunday and warning about them would train everyone to click through; a broadcaster
 * means the transcript about to be deleted may be the sermon. So the route refuses with
 * 409 when one is present (or when LiveKit can't be read), and the caller re-sends with
 * `force: true` once a human has confirmed.
 *
 * Split out of server.ts for the same reason as sessionRoutes.ts: that module can't be
 * imported by a test.
 */
import { Router, type RequestHandler } from 'express';
import * as Y from 'yjs';

import { clearLiveTranscripts } from './src/transcriptKeys.ts';
import { isValidDocId } from './src/sessionCurrent.ts';

export interface TranscriptResetDeps {
  requireWriteKey: (route: string) => RequestHandler;
  /** The whole doc as an update (Y-Sweet's `getDocAsUpdate`). */
  readDoc: (docId: string) => Promise<Uint8Array>;
  /** Apply an update to the doc (Y-Sweet's `updateDoc`). */
  writeDoc: (docId: string, update: Uint8Array) => Promise<void>;
  /** Whether a broadcaster is in the room; throws when that can't be determined. */
  broadcasterPresent: (docId: string) => Promise<boolean>;
  log?: (message: string) => void;
}

/** Why a clear was refused pending confirmation. */
export type ClearRefusal = 'broadcaster-live' | 'presence-unknown';

const ROUTE = '/api/session/clearTranscripts';

export function makeTranscriptResetRouter({
  requireWriteKey,
  readDoc,
  writeDoc,
  broadcasterPresent,
  log = () => {},
}: TranscriptResetDeps): Router {
  const router = Router();

  router.post('/clearTranscripts', requireWriteKey(ROUTE), async (req, res) => {
    const docId = req.body?.docId;
    if (!isValidDocId(docId)) {
      res.status(400).json({ error: 'Missing or malformed docId' });
      return;
    }

    if (req.body?.force !== true) {
      let refusal: ClearRefusal | null = null;
      try {
        if (await broadcasterPresent(docId)) refusal = 'broadcaster-live';
      } catch {
        refusal = 'presence-unknown';
      }
      if (refusal) {
        res.status(409).json({ error: 'Confirmation required', reason: refusal });
        return;
      }
    }

    try {
      // Read, delete locally, send back only what the delete produced. The delete set
      // names the items it removes, so a writer appending meanwhile keeps its new lines.
      const doc = new Y.Doc();
      Y.applyUpdate(doc, await readDoc(docId));
      const before = Y.encodeStateVector(doc);
      const cleared = clearLiveTranscripts(doc);
      if (cleared.length > 0) await writeDoc(docId, Y.encodeStateAsUpdate(doc, before));
      doc.destroy();
      log(
        `[transcripts] cleared ${docId}: ${cleared.length > 0 ? cleared.join(', ') : 'nothing to clear'}` +
          (req.body?.force === true ? ' (confirmed)' : ''),
      );
      res.json({ cleared });
    } catch (error) {
      log(`[transcripts] clearing ${docId} failed: ${(error as Error).message}`);
      res.status(500).json({ error: 'Failed to clear transcripts' });
    }
  });

  return router;
}

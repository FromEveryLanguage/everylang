import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  lookupLibrary,
  upsertLibraryEntry,
  translateItem,
} from './slideTranslationApi';

// These clients stamp the session's doc id onto every request. Since #111 that id comes
// from the server rather than a local formula, so a test that never mounted the session
// gate has to stand one in.
vi.mock('./getDocId', () => ({
  getDocId: () => 'doc-test',
}));

describe('api clients', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lookupLibrary posts texts and returns aligned entries', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ entries: [{ text: 'Bonjour', status: 'reviewed', provenance: 'human' }, null] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const entries = await lookupLibrary('French', ['Hello', 'Unknown']);
    expect(entries).toEqual([{ text: 'Bonjour', status: 'reviewed', provenance: 'human' }, null]);

    const [url, options] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(url).toBe('/api/slideLibrary/lookup');
    expect(JSON.parse(options.body)).toEqual({ language: 'French', texts: ['Hello', 'Unknown'] });
  });

  it('upsertLibraryEntry returns the saved record', async () => {
    const record = { language: 'French', sourceText: 'Hello', text: 'Bonjour', status: 'reviewed', provenance: 'human' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ record }) }));
    await expect(upsertLibraryEntry({ language: 'French', sourceText: 'Hello', text: 'Bonjour' })).resolves.toEqual(record);
  });

  it('translateItem returns the per-language translation map and conversation id', async () => {
    const translations = { French: [{ text: 'Bonjour', status: 'auto', provenance: 'llm' }] };
    const conversationId = 'item-1';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ translations, conversationId }) }));
    await expect(translateItem(['Hello'], ['French'])).resolves.toEqual({ translations, conversationId });
  });

  it('throws on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(translateItem(['Hello'], ['French'])).rejects.toThrow('500');
  });
});

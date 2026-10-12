import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FreshTranscriptButton } from './FreshTranscriptButton';
import { strings } from './strings';

const en = strings.en;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Stub fetch with a queue of responses; returns the bodies it was sent. */
function stubFetch(...responses: Response[]) {
  const sent: unknown[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      sent.push(JSON.parse(init?.body as string));
      const next = responses.shift();
      return next ? Promise.resolve(next) : Promise.reject(new Error('unexpected fetch'));
    }),
  );
  return sent;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('FreshTranscriptButton', () => {
  it('does nothing unless the first confirmation is accepted', async () => {
    const sent = stubFetch();
    const confirm = vi.fn(() => false);
    render(<FreshTranscriptButton docId="doc-x" confirm={confirm} />);

    await userEvent.click(screen.getByRole('button', { name: new RegExp(en.freshTranscript) }));

    expect(confirm).toHaveBeenCalledWith(en.freshTranscriptConfirm);
    expect(sent).toEqual([]);
  });

  it('clears without a second prompt when nobody is broadcasting', async () => {
    const sent = stubFetch(jsonResponse(200, { cleared: ['en', 'es'] }));
    const confirm = vi.fn(() => true);
    render(<FreshTranscriptButton docId="doc-x" confirm={confirm} />);

    await userEvent.click(screen.getByRole('button'));

    expect(await screen.findByRole('status')).toHaveTextContent(en.freshTranscriptDone);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(sent).toEqual([{ docId: 'doc-x', force: false }]);
  });

  it('warns about a live broadcaster and only then forces the clear', async () => {
    const sent = stubFetch(
      jsonResponse(409, { reason: 'broadcaster-live' }),
      jsonResponse(200, { cleared: ['en'] }),
    );
    const confirm = vi.fn(() => true);
    render(<FreshTranscriptButton docId="doc-x" confirm={confirm} />);

    await userEvent.click(screen.getByRole('button'));

    expect(await screen.findByRole('status')).toHaveTextContent(en.freshTranscriptDone);
    expect(confirm).toHaveBeenLastCalledWith(en.freshTranscriptBroadcasterLive);
    expect(sent).toEqual([
      { docId: 'doc-x', force: false },
      { docId: 'doc-x', force: true },
    ]);
  });

  it('stops when the broadcaster warning is declined', async () => {
    const sent = stubFetch(jsonResponse(409, { reason: 'broadcaster-live' }));
    const confirm = vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(false);
    render(<FreshTranscriptButton docId="doc-x" confirm={confirm} />);

    await userEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(2));
    expect(sent).toHaveLength(1);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('says so when the server refuses', async () => {
    stubFetch(jsonResponse(403, { error: 'no key' }));
    render(<FreshTranscriptButton docId="doc-x" confirm={() => true} />);

    await userEvent.click(screen.getByRole('button'));

    expect(await screen.findByRole('status')).toHaveTextContent(en.freshTranscriptFailed);
  });
});

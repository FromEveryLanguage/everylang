import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LandingPage } from './LandingPage';

const ncf = {
  siteName: 'New City Fellowship',
  siteLanguages: ['en', 'fr', 'es', 'ht'],
  sourceLanguage: 'en',
  hasNotes: false,
};

function cardHref(name: string): string | null {
  return screen.getByText(name).closest('a')!.getAttribute('href');
}

describe('LandingPage', () => {
  it('offers one card per site language, named in itself, in order', () => {
    render(<LandingPage {...ncf} />);
    const names = screen.getAllByRole('link').map((a) => a.querySelector('span')?.textContent).filter(Boolean);
    expect(names).toEqual(['English', 'Français', 'Español', 'Kreyòl ayisyen']);
    expect(screen.getByText('New City Fellowship')).toBeTruthy();
  });

  it('routes each card by what its language can do, with that language as the UI locale', () => {
    render(<LandingPage {...ncf} />);
    expect(cardHref('English')).toBe('/listen-en');
    expect(cardHref('Français')).toBe('/slideTranslation-French,listen-fr?locale=fr');
    expect(cardHref('Kreyòl ayisyen')).toBe('/slideTranslation-Haitian Creole,listen-fr?locale=ht');
  });

  it("says on the Kreyòl card, in Kreyòl, that the audio is someone else's language", () => {
    render(<LandingPage {...ncf} />);
    const card = screen.getByText('Kreyòl ayisyen').closest('a')!;
    expect(card.textContent).toMatch(/Dyapozitiv, odyo an/);
  });

  it('hides the notes row until there are notes', () => {
    const { rerender } = render(<LandingPage {...ncf} />);
    expect(screen.queryByText('Sermon notes')).toBeNull();
    rerender(<LandingPage {...ncf} hasNotes />);
    expect(screen.getByText('Sermon notes')).toBeTruthy();
    expect(screen.getAllByText('Français').map((el) => el.closest('a')!.getAttribute('href'))).toContain(
      '/bilingual-French?locale=fr',
    );
  });

  it('keeps staff tools behind the Team footer', () => {
    render(<LandingPage {...ncf} />);
    const team = screen.getByText('Team').closest('details')!;
    expect(team.open).toBe(false);
    expect(team.querySelector('a[href="/status"]')).toBeTruthy();
  });

  it('lists other live-audio languages, searchable, each going to its listen pane alone', () => {
    render(<LandingPage {...ncf} />);
    fireEvent.click(screen.getByText(/Another language/));
    // Site languages are not repeated in the long list.
    expect(screen.queryByText('Español')).toBeNull();
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'portug' } });
    expect(screen.getByText('Português').closest('a')!.getAttribute('href')).toBe('/listen-pt');
    expect(screen.queryByText('Deutsch')).toBeNull();
  });
});

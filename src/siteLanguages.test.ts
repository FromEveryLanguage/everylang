import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SITE_LANGUAGES,
  endonym,
  languageNameIn,
  languageOffer,
  parseSiteLanguages,
} from './siteLanguages';

describe('parseSiteLanguages', () => {
  it('keeps the configured order and trims whitespace', () => {
    expect(parseSiteLanguages(' es, en ,ht', DEFAULT_SITE_LANGUAGES)).toEqual(['es', 'en', 'ht']);
  });

  it('falls back when unset or blank', () => {
    expect(parseSiteLanguages(undefined, ['en'])).toEqual(['en']);
    expect(parseSiteLanguages(' , ', ['en'])).toEqual(['en']);
  });

  it('drops duplicates', () => {
    expect(parseSiteLanguages('fr,fr,en', [])).toEqual(['fr', 'en']);
  });

  it('refuses a code nothing can serve, naming it', () => {
    expect(() => parseSiteLanguages('en,frr,xx', [])).toThrow(/frr, xx/);
  });

  it('accepts a slide-only language and an audio-only one', () => {
    expect(parseSiteLanguages('ht,pt', [])).toEqual(['ht', 'pt']);
  });

  it('accepts every default', () => {
    expect(() => parseSiteLanguages(DEFAULT_SITE_LANGUAGES.join(','), [])).not.toThrow();
  });
});

describe('languageOffer', () => {
  it('sends the spoken language to its own transcript alone', () => {
    expect(languageOffer('en', 'en')).toMatchObject({ layout: 'listen-en', isSource: true });
  });

  it('pairs slides with audio when a language has both', () => {
    expect(languageOffer('fr', 'en')).toMatchObject({
      layout: 'slideTranslation-French,listen-fr',
      audioIsStandIn: false,
    });
  });

  it('gives Haitian Creole its own slides with French audio, and flags the stand-in', () => {
    // The old landing page did this silently (docs/LANDING_PAGE.md §1a); the flag is what
    // lets the card say so.
    expect(languageOffer('ht', 'en')).toMatchObject({
      layout: 'slideTranslation-Haitian Creole,listen-fr',
      listenCode: 'fr',
      audioIsStandIn: true,
    });
  });

  it('sends an audio-only language to the listen pane alone, never to French slides', () => {
    expect(languageOffer('pt', 'en')).toMatchObject({ layout: 'listen-pt', slideLanguage: null });
  });

  it('follows the session when the spoken language is not English', () => {
    expect(languageOffer('es', 'es').layout).toBe('listen-es');
    expect(languageOffer('en', 'es').layout).toBe('listen-en');
  });
});

describe('names', () => {
  it('names a language in itself, capitalized', () => {
    expect(endonym('es')).toBe('Español');
    expect(endonym('fr')).toBe('Français');
  });

  it('knows Haitian Creole even where ICU does not', () => {
    expect(endonym('ht')).toBe('Kreyòl ayisyen');
  });

  it('names a language in a locale, falling back to the endonym where ICU answers in English', () => {
    expect(languageNameIn('fr', 'es')).toBe('francés');
    expect(languageNameIn('fr', 'ht')).not.toBe('French');
  });
});

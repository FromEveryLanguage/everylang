// Which languages the landing page offers, and where each one goes (issue #133,
// docs/LANDING_PAGE.md §4).
//
// Two kinds of fact meet here, and keeping them apart is the point:
//
//   - *Which* languages a congregation cares about, and in what order, is a deployment
//     fact: SITE_LANGUAGES in .env.
//   - What a language can actually *do* — be heard (Gemini Live supports it), or have its
//     slides translated (we have a slide-translation name for it) — is a code fact. No env
//     var can make Gemini Live speak Haitian Creole.
//
// The landing page used to offer a language without asking what it could do, which is how
// picking Haitian Creole silently produced French audio with nothing saying so. Here every
// destination is derived from capabilities, so a pane is only ever rendered for a language
// that can serve it, and the one deliberate substitution (AUDIO_STAND_IN) is declared and
// shown on the card.
//
// Imported by the server (to validate SITE_LANGUAGES at boot) as well as the browser, so it
// stays free of React and DOM dependencies.
import { LANGUAGE_BCP47 } from './strings.ts';
import { isListenLanguage } from './listenLanguages.ts';

/**
 * Languages with slide translation but no live audio, mapped to the audio they get instead.
 * Haitian Creole speakers at NCF are comfortable in French, so they get Kreyòl slides with
 * French audio — and the card says, in Kreyòl, that the audio is French.
 */
export const AUDIO_STAND_IN: Record<string, string> = { ht: 'fr' };

/**
 * What a deployment that sets no SITE_LANGUAGES gets: the languages the landing page offered
 * before it was configurable, plus English, which it couldn't reach.
 */
export const DEFAULT_SITE_LANGUAGES: readonly string[] = ['en', 'fr', 'es', 'ht'];

/** What a site language turns into on the landing page. */
export interface LanguageOffer {
  code: string;
  /** Layout path (no leading slash) the card links to. */
  layout: string;
  /** Code of the audio/transcript pane, if there is one. */
  listenCode: string | null;
  /** Slide/notes translation name (the display-name namespace), if slides are translated. */
  slideLanguage: string | null;
  /** True when `listenCode` is someone else's language (see AUDIO_STAND_IN). */
  audioIsStandIn: boolean;
  /** True when this is the language being spoken: the transcript is the original. */
  isSource: boolean;
}

/** The slide-translation name for a code, or null if slides aren't translated into it. */
export function slideLanguageFor(code: string): string | null {
  const entry = Object.entries(LANGUAGE_BCP47).find(([, c]) => c === code);
  return entry ? entry[0] : null;
}

/** Whether the landing page can offer this code at all. */
export function isOfferable(code: string): boolean {
  return isListenLanguage(code) || slideLanguageFor(code) !== null;
}

/**
 * Parse SITE_LANGUAGES (comma-separated BCP-47 codes, in card order).
 *
 * Throws on a code we can neither hear nor translate slides into. A typo that silently
 * vanished from the page would be noticed by an attendee on a Sunday; a server that refuses
 * to start is noticed by whoever deployed it.
 */
export function parseSiteLanguages(raw: string | undefined, fallback: readonly string[]): string[] {
  const codes = (raw ?? '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
  if (codes.length === 0) return [...fallback];
  const unknown = codes.filter((c) => !isOfferable(c));
  if (unknown.length > 0) {
    throw new Error(
      `SITE_LANGUAGES lists ${unknown.join(', ')}, which is neither a live-audio language ` +
        `(src/listenLanguages.ts) nor a slide-translation language (LANGUAGE_BCP47 in src/strings.ts)`,
    );
  }
  return [...new Set(codes)];
}

/** Where a language's card goes, derived from what the language can do. */
export function languageOffer(code: string, sourceLanguage: string): LanguageOffer {
  const slideLanguage = slideLanguageFor(code);
  const isSource = code === sourceLanguage;
  // The spoken language reads its own transcript; the slides are presumably already in it.
  if (isSource) {
    return { code, layout: `listen-${code}`, listenCode: code, slideLanguage: null, audioIsStandIn: false, isSource };
  }
  let listenCode: string | null = isListenLanguage(code) ? code : null;
  let audioIsStandIn = false;
  if (!listenCode && AUDIO_STAND_IN[code] && isListenLanguage(AUDIO_STAND_IN[code])) {
    listenCode = AUDIO_STAND_IN[code];
    audioIsStandIn = true;
  }
  const panes = [
    slideLanguage ? `slideTranslation-${slideLanguage}` : null,
    listenCode ? `listen-${listenCode}` : null,
  ].filter((p): p is string => p !== null);
  return { code, layout: panes.join(','), listenCode, slideLanguage, audioIsStandIn, isSource };
}

/**
 * Endonyms ICU doesn't know. Node's ICU (and some browsers') has no Haitian Creole data, so
 * `Intl.DisplayNames(['ht'])` answers in English — exactly the label a Kreyòl speaker
 * scanning for their own language shouldn't have to recognize.
 */
const ENDONYM_OVERRIDES: Record<string, string> = { ht: 'Kreyòl ayisyen' };

function displayName(code: string, inLocale: string): string | null {
  try {
    const name = new Intl.DisplayNames([inLocale], { type: 'language' }).of(code);
    return name && name !== code ? name : null;
  } catch {
    return null;
  }
}

function capitalize(name: string, locale: string): string {
  return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
}

/**
 * A language named in itself ("Español", not "Spanish"): someone scanning for their own
 * language on a phone set to another one should find it. Falls back to the code.
 */
export function endonym(code: string): string {
  const name = ENDONYM_OVERRIDES[code] ?? displayName(code, code);
  return name ? capitalize(name, code) : code;
}

/**
 * A language named in `locale`. Where ICU has no data for `locale` it silently answers in
 * English; in that case the language's own name is the better guess for a reader of
 * `locale` than an English one.
 */
export function languageNameIn(code: string, locale: string): string {
  const name = displayName(code, locale);
  if (!name || (locale !== 'en' && name === displayName(code, 'en'))) {
    // Mid-sentence, so not capitalized: "odyo an français".
    return ENDONYM_OVERRIDES[code] ?? displayName(code, code) ?? code;
  }
  return name;
}

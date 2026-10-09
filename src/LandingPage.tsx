/**
 * The front door: one question, "what language?", one tap, one destination
 * (issue #133; the reasoning is in docs/LANDING_PAGE.md).
 *
 * The audience is someone the welcome team handed a link to thirty seconds ago. So there
 * are no layout choices here: each language's destination is derived from what that
 * language can do (src/siteLanguages.ts), and staff tools sit behind a quiet footer link.
 */
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useMap, useYDoc } from '@y-sweet/react';
import * as Y from 'yjs';

import { type BlockYMap } from './blockTypes';
import { LIVE_AUDIO_CONFIG_KEY, SOURCE_LANGUAGE_FIELD } from './liveAudioConfig';
import { LISTEN_LANGUAGE_CODES } from './listenLanguages';
import { getSiteConfig } from './siteConfig';
import {
  endonym,
  languageNameIn,
  languageOffer,
  type LanguageOffer,
} from './siteLanguages';
import { strings, SUPPORTED_LOCALES, type AppStrings, type SupportedLocale } from './strings';
import { resolveLocale, useStrings } from './useLocale';

const linkClass =
  'underline text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300';

function isSupportedLocale(code: string): code is SupportedLocale {
  return (SUPPORTED_LOCALES as string[]).includes(code);
}

/**
 * Card links carry `?locale=` so tapping Français on a borrowed English phone gives a
 * French interface. A language we have no UI strings for keeps the page's own locale.
 */
function hrefFor(layout: string, code: string, pageLocale: SupportedLocale): string {
  const locale = isSupportedLocale(code) ? code : pageLocale;
  return `/${layout}${locale !== 'en' ? `?locale=${locale}` : ''}`;
}

/** What you get, said in the card's own language (English where we have no strings). */
function cardSubtitle(offer: LanguageOffer): string {
  const s: AppStrings = isSupportedLocale(offer.code) ? strings[offer.code] : strings.en;
  if (offer.isSource) return s.landingCardSource;
  if (offer.slideLanguage && offer.listenCode) {
    return offer.audioIsStandIn
      ? s.landingCardSlidesStandInAudio.replace('{lang}', languageNameIn(offer.listenCode, offer.code))
      : s.landingCardSlidesAndAudio;
  }
  return offer.slideLanguage ? s.landingCardSlidesOnly : s.landingCardAudioOnly;
}

export interface LandingPageProps {
  siteName: string;
  siteLanguages: string[];
  sourceLanguage: string;
  /** Whether anyone has written sermon notes in this session. */
  hasNotes: boolean;
}

export function LandingPage({ siteName, siteLanguages, sourceLanguage, hasNotes }: LandingPageProps) {
  const s = useStrings();
  const pageLocale = resolveLocale();
  const [showAll, setShowAll] = useState(false);

  const offers = useMemo(
    () => siteLanguages.map((code) => languageOffer(code, sourceLanguage)),
    [siteLanguages, sourceLanguage],
  );
  const slideLanguages = offers.filter((o) => o.slideLanguage);
  // The first language with translated notes, for the staff note-taker/broadcaster links.
  const staffNotesLanguage = slideLanguages[0]?.slideLanguage ?? null;

  if (showAll) {
    return (
      <AllLanguages
        exclude={siteLanguages}
        sourceLanguage={sourceLanguage}
        slideLanguageNames={slideLanguages.map((o) => languageNameIn(o.code, pageLocale))}
        onBack={() => setShowAll(false)}
      />
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-2xl flex flex-col gap-6">
        <header className="text-center flex flex-col gap-2">
          {siteName && <h1 className="text-2xl font-bold">{siteName}</h1>}
          <p className="text-gray-700 dark:text-gray-300">{s.landingTagline}</p>
        </header>

        <ul className="list-none p-0 m-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {offers.map((offer) => (
            <li key={offer.code}>
              <a
                href={hrefFor(offer.layout, offer.code, pageLocale)}
                lang={offer.code}
                className="block h-full rounded-lg shadow bg-white/80 dark:bg-gray-800/80 p-4 hover:bg-blue-50 dark:hover:bg-gray-700 transition"
              >
                <span className="block text-lg font-semibold">{endonym(offer.code)}</span>
                <span className="block text-sm text-gray-600 dark:text-gray-400">{cardSubtitle(offer)}</span>
              </a>
            </li>
          ))}
        </ul>

        <button type="button" onClick={() => setShowAll(true)} className={`self-center ${linkClass}`}>
          ▸ {s.landingAnotherLanguage}
        </button>

        <p className="text-center text-sm text-gray-600 dark:text-gray-400">🎧 {s.landingHeadphones}</p>

        {hasNotes && slideLanguages.length > 0 && (
          <section className="border-t border-gray-300 dark:border-gray-700 pt-4 flex flex-col gap-2">
            <h2 className="font-semibold">{s.landingNotesTitle}</h2>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {slideLanguages.map((o) => (
                <a
                  key={o.code}
                  href={hrefFor(`bilingual-${o.slideLanguage}`, o.code, pageLocale)}
                  lang={o.code}
                  className={linkClass}
                >
                  {endonym(o.code)}
                </a>
              ))}
            </div>
          </section>
        )}

        <footer className="border-t border-gray-300 dark:border-gray-700 pt-4 text-sm">
          <details>
            <summary className="cursor-pointer text-gray-500 dark:text-gray-400">{s.landingTeam}</summary>
            <nav className="mt-2 flex flex-col gap-1">
              {staffNotesLanguage && (
                <>
                  <a className={linkClass} href={`/sourceText|bilingual-${staffNotesLanguage}#editor`}>Note-Taker</a>
                  <a className={linkClass} href={`/sourceText,broadcast|bilingual-${staffNotesLanguage}#editor`}>Broadcaster</a>
                </>
              )}
              <a className={linkClass} href="/slideReview#editor">{s.reviewSlidesLink}</a>
              <a className={linkClass} href="/status">{s.statusTitle}</a>
            </nav>
          </details>
        </footer>
      </div>
    </main>
  );
}

/** Every live-audio language not already on a card, by endonym, with a search box. */
function AllLanguages({
  exclude,
  sourceLanguage,
  slideLanguageNames,
  onBack,
}: {
  exclude: string[];
  sourceLanguage: string;
  slideLanguageNames: string[];
  onBack: () => void;
}) {
  const s = useStrings();
  const pageLocale = resolveLocale();
  const [query, setQuery] = useState('');

  const all = useMemo(
    () =>
      LISTEN_LANGUAGE_CODES.filter((c) => !exclude.includes(c))
        .map((code) => ({ code, name: endonym(code), localName: languageNameIn(code, pageLocale) }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [exclude, pageLocale],
  );
  const q = query.trim().toLocaleLowerCase();
  // Match the endonym or the reader's own name for it: someone looking for Portuguese on
  // an English phone may type either.
  const shown = q
    ? all.filter((l) => l.name.toLocaleLowerCase().includes(q) || l.localName.toLocaleLowerCase().includes(q))
    : all;

  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-2xl flex flex-col gap-4">
        <button type="button" onClick={onBack} className={`self-start ${linkClass}`}>
          ◂ {s.landingBack}
        </button>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={s.landingSearch}
          aria-label={s.landingSearch}
          className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900"
        />
        {slideLanguageNames.length > 0 && (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {s.landingAudioOnlyFootnote.replace(
              '{langs}',
              slideLanguageNames.join(', '),
            )}
          </p>
        )}
        <ul className="list-none p-0 m-0 flex flex-col divide-y divide-gray-200 dark:divide-gray-700">
          {shown.map(({ code, name }) => (
            <li key={code}>
              <a
                href={hrefFor(languageOffer(code, sourceLanguage).layout, code, pageLocale)}
                lang={code}
                className="block py-2 hover:bg-blue-50 dark:hover:bg-gray-800"
              >
                {name}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

/** True once any block in `sourceBlocks` has text. Live: the notes row appears when notes do. */
function useHasNotes(): boolean {
  const ydoc = useYDoc();
  const blocks = useMemo(() => ydoc.getArray<BlockYMap>('sourceBlocks'), [ydoc]);
  const subscribe = useCallback(
    (onChange: () => void) => {
      blocks.observeDeep(onChange);
      return () => blocks.unobserveDeep(onChange);
    },
    [blocks],
  );
  return useSyncExternalStore(subscribe, () =>
    // Read `content` directly: getBlockYText would *create* a missing Y.Text, and a
    // viewer's landing page must never write to the doc.
    blocks.toArray().some((b) => {
      const content = b.get('content');
      return content instanceof Y.Text && content.toJSON().trim() !== '';
    }),
  );
}

/**
 * The session's spoken language: the doc's declaration if a broadcaster has made one, else
 * the deployment's configured default. Not `useSourceLanguage()`, which falls back to `en`
 * — wrong on a deployment that isn't English-speaking, and the landing page is mostly seen
 * *before* anyone has hit Broadcast.
 */
function useLandingSourceLanguage(fallback: string): string {
  const config = useMap<unknown>(LIVE_AUDIO_CONFIG_KEY);
  const [value, setValue] = useState(() => config.get(SOURCE_LANGUAGE_FIELD));
  useEffect(() => {
    const update = () => setValue(config.get(SOURCE_LANGUAGE_FIELD));
    update();
    config.observe(update);
    return () => config.unobserve(update);
  }, [config]);
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export function LandingPageContainer() {
  const { siteName, siteLanguages, sourceLanguage } = getSiteConfig();
  const hasNotes = useHasNotes();
  const spoken = useLandingSourceLanguage(sourceLanguage);
  return (
    <LandingPage
      siteName={siteName}
      siteLanguages={siteLanguages}
      sourceLanguage={spoken}
      hasNotes={hasNotes}
    />
  );
}

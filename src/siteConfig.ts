/**
 * Per-deployment presentation config, fetched from `/api/config` at runtime (issue #133).
 *
 * Runtime rather than `VITE_` build-time constants so one Docker image serves any
 * congregation. Fetched by `SessionGate` in parallel with the current session, and cached
 * here for synchronous readers, the same way `getDocId.ts` caches the doc id. A failure
 * goes to the gate's error screen rather than rendering some other deployment's defaults.
 */
export interface SiteConfig {
  /** Shown as the landing-page heading; empty when the deployment doesn't name itself. */
  siteName: string;
  /** Ordered BCP-47 codes, already validated by the server against src/siteLanguages.ts. */
  siteLanguages: string[];
  /**
   * The deployment's LIVE_AUDIO_SOURCE_LANGUAGE. A session's own declaration (in the doc,
   * see liveAudioConfig.ts) wins; this only covers the time before a broadcaster declares,
   * which is exactly when people are arriving at the landing page.
   */
  sourceLanguage: string;
}

let resolved: SiteConfig | null = null;

export function getSiteConfig(): SiteConfig {
  if (resolved) return resolved;
  throw new Error('getSiteConfig() called before the site config was fetched');
}

export async function resolveSiteConfig(fetchImpl: typeof fetch = fetch): Promise<SiteConfig> {
  const response = await fetchImpl('/api/config');
  if (!response.ok) throw new Error(`Server returned ${response.status} for the site config`);
  const body = (await response.json()) as Partial<SiteConfig>;
  if (!Array.isArray(body.siteLanguages) || typeof body.sourceLanguage !== 'string') {
    throw new Error('Server did not send the site config');
  }
  resolved = {
    siteName: typeof body.siteName === 'string' ? body.siteName : '',
    siteLanguages: body.siteLanguages.filter((c): c is string => typeof c === 'string'),
    sourceLanguage: body.sourceLanguage,
  };
  return resolved;
}

/** Test seam. */
export function setSiteConfigForTest(config: SiteConfig | null): void {
  resolved = config;
}

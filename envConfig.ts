export interface EnvDeclaration {
  name: string;
  required: boolean;
  defaultValue?: string;
  subsystem: 'core' | 'write-auth' | 'telemetry' | 'live-audio' | 'slides' | 'session' | 'landing' | 'storage' | 'testing' | 'deployment';
  description: string;
  placeholder?: string;
  sensitive?: boolean;
}

export const ENV_DECLARATIONS: readonly EnvDeclaration[] = [
  { name: 'YSWEET_CONNECTION_STRING', required: true, subsystem: 'core', description: 'Y-Sweet document service connection string.', placeholder: 'ys://...' },
  { name: 'GEMINI_API_KEY', required: true, subsystem: 'core', description: 'Google Gemini API key used for translation.', sensitive: true },
  { name: 'ELEVENLABS_API_KEY', required: true, subsystem: 'core', description: 'ElevenLabs API key used for text-to-speech.', sensitive: true },

  { name: 'WRITE_KEYS', required: false, subsystem: 'write-auth', description: 'Comma-separated labels and shared keys for privileged devices.' },
  { name: 'WRITE_AUTH_MODE', required: false, defaultValue: 'observe', subsystem: 'write-auth', description: 'Write authorization mode: off, observe, or enforce.' },
  { name: 'TTS_RATE_LIMIT_PER_MIN', required: false, defaultValue: '600', subsystem: 'write-auth', description: 'Maximum text-to-speech requests per caller per minute; 0 disables the limit.' },
  { name: 'TRANSLATE_RATE_LIMIT_PER_MIN', required: false, defaultValue: '1200', subsystem: 'write-auth', description: 'Maximum live translation requests per caller per minute; 0 disables the limit.' },

  { name: 'VITE_PUBLIC_POSTHOG_KEY', required: false, subsystem: 'telemetry', description: 'PostHog project key. Unset values disable telemetry.', sensitive: true },
  { name: 'VITE_PUBLIC_POSTHOG_HOST', required: false, defaultValue: 'https://us.i.posthog.com', subsystem: 'telemetry', description: 'PostHog ingestion host.' },
  { name: 'POSTHOG_CLI_TOKEN', required: false, subsystem: 'telemetry', description: 'Build-time PostHog CLI token used for source-map upload.', sensitive: true },
  { name: 'POSTHOG_CLI_ENV_ID', required: false, subsystem: 'telemetry', description: 'Build-time PostHog environment ID.' },
  { name: 'POSTHOG_CLI_HOST', required: false, defaultValue: 'https://us.i.posthog.com', subsystem: 'telemetry', description: 'Build-time PostHog CLI host.' },

  { name: 'LIVEKIT_URL', required: false, subsystem: 'live-audio', description: 'LiveKit server URL. All LiveKit credentials are needed to enable live audio.' },
  { name: 'LIVEKIT_API_KEY', required: false, subsystem: 'live-audio', description: 'LiveKit API key.', sensitive: true },
  { name: 'LIVEKIT_API_SECRET', required: false, subsystem: 'live-audio', description: 'LiveKit API secret.', sensitive: true },
  { name: 'LIVE_AUDIO_SOURCE_LANGUAGE', required: false, defaultValue: 'en', subsystem: 'live-audio', description: 'Fallback spoken language for clients that do not declare one.' },
  { name: 'LIVE_AUDIO_SILENCE_THRESHOLD_DBFS', required: false, subsystem: 'live-audio', description: 'Negative dBFS threshold for suspending idle translator sessions; unset disables silence gating.' },

  { name: 'GEMINI_STRONG_MODEL', required: false, defaultValue: 'gemini-3.7-flash', subsystem: 'slides', description: 'Gemini model used for whole-item slide drafting.' },
  {
    name: 'SLIDE_TRANSLATION_CONTEXT',
    required: false,
    subsystem: 'slides',
    defaultValue: 'These slides are shown at a Presbyterian Church in America (PCA) worship service. The translations are provided alongside the service so non-English speakers can follow along — they are for understanding and reference, not for congregational singing or as an official literal/liturgical rendering. When writing new translations, aim for clear and natural wording. However, that does NOT apply to Scripture texts; they should be looked up using the tool and the wording used without revision, even if it seems dated or awkward.',
    description: 'General context added to slide translation prompts.',
  },
  { name: 'SLIDE_TRANSLATION_LANGUAGES', required: false, subsystem: 'slides', description: 'Comma-separated display names of languages translated ahead by the slide feed.' },
  { name: 'SLIDE_LIBRARY_PATH', required: false, defaultValue: 'audio-cache/slide-library.json', subsystem: 'storage', description: 'Path to the reviewed slide translation library.' },

  { name: 'SESSION_TIMEZONE', required: false, subsystem: 'session', description: 'IANA timezone used for current-session dates and pin expiry.' },
  { name: 'SESSION_REGISTRY_PATH', required: false, defaultValue: 'audio-cache/current-session.json', subsystem: 'storage', description: 'Path to the current-session pin and proposal registry.' },
  { name: 'TTS_MAX_CONCURRENT', required: false, defaultValue: '2', subsystem: 'core', description: 'Maximum concurrent text-to-speech requests.' },

  { name: 'SITE_NAME', required: false, defaultValue: '', subsystem: 'landing', description: 'Optional landing-page heading.' },
  { name: 'SITE_LANGUAGES', required: false, subsystem: 'landing', description: 'Comma-separated BCP-47 codes offered as landing-page language cards.' },

  { name: 'PORT', required: false, defaultValue: '8000', subsystem: 'deployment', description: 'Express server listening port.' },
  { name: 'NODE_ENV', required: false, defaultValue: 'development', subsystem: 'deployment', description: 'Node runtime environment.' },
  { name: 'ALLOW_CHAOS_ENDPOINT', required: false, subsystem: 'testing', description: 'Set to 1 to allow LiveKit fault-injection routes outside development.' },

  { name: 'Y_SWEET_AUTH', required: false, subsystem: 'deployment', description: 'Y-Sweet server authentication secret used by Docker Compose.' },
  { name: 'Y_SWEET_SERVER_TOKEN', required: false, subsystem: 'deployment', description: 'Y-Sweet server token used to connect the application.', sensitive: true },
  { name: 'GIT_SHA', required: false, subsystem: 'deployment', description: 'Build-time source revision exposed in deployment logs.' },
];

export interface ServerEnv {
  [name: string]: string | undefined;
}

export function readServerEnv(source: ServerEnv = process.env): Record<string, string | undefined> {
  const missing = ENV_DECLARATIONS.filter((entry) => entry.required && !source[entry.name]?.trim());
  if (missing.length > 0) {
    throw new Error(
      'Missing required environment variables:\n' +
      missing.map((entry) => `- ${entry.name}: ${entry.description}`).join('\n'),
    );
  }

  const result: Record<string, string | undefined> = {};
  for (const entry of ENV_DECLARATIONS) {
    const raw = source[entry.name];
    result[entry.name] = raw?.trim() || entry.defaultValue;
  }
  return result;
}

export function declarationNames(): Set<string> {
  return new Set(ENV_DECLARATIONS.map((entry) => entry.name));
}

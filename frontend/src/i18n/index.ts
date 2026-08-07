import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

/**
 * App-wide internationalisation (English + Tamil).
 *
 * Namespaces are auto-discovered: every `./locales/<lng>/<ns>.json` file is
 * loaded at build time via Vite's import.meta.glob, so adding a screen's
 * translations is just dropping in `en/<ns>.json` + `ta/<ns>.json` — no edit
 * here required. Components read them with `useTranslation('<ns>')`.
 *
 * A missing Tamil key falls back to English, never to a raw key, so a
 * half-translated screen degrades to English rather than to `foo.bar`.
 */

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'ta', label: 'Tamil', native: 'தமிழ்' },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]['code'];

/** localStorage key the detector reads/writes — also the source of truth on boot. */
export const LANG_STORAGE_KEY = 'sirah:lang';

// Eagerly bundle every locale JSON. Keys look like './locales/en/common.json'.
const localeModules = import.meta.glob('./locales/*/*.json', { eager: true }) as Record<
  string,
  { default: Record<string, unknown> }
>;

const resources: Record<string, Record<string, Record<string, unknown>>> = {};
const namespaces = new Set<string>();

for (const path in localeModules) {
  const match = path.match(/\.\/locales\/([^/]+)\/([^/]+)\.json$/);
  if (!match) continue;
  const [, lng, ns] = match;
  namespaces.add(ns);
  (resources[lng] ??= {})[ns] = localeModules[path].default;
}

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: ['en', 'ta'],
    defaultNS: 'common',
    ns: Array.from(namespaces),
    // React already escapes on render — double-escaping mangles Tamil + punctuation.
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      lookupLocalStorage: LANG_STORAGE_KEY,
      caches: ['localStorage'],
    },
    // Empty string is a legitimate translation but an empty Tamil value should
    // fall through to English, so treat "" as missing.
    returnEmptyString: false,
  });

/** Keep <html lang> in sync — screen readers + Tamil font selection depend on it. */
function applyHtmlLang(lng: string): void {
  document.documentElement.setAttribute('lang', lng);
}
i18n.on('languageChanged', applyHtmlLang);
applyHtmlLang(i18n.language || 'en');

export default i18n;

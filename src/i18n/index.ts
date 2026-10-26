/**
 * Translations for the client app.
 *
 * The strings are the web portal's, copied verbatim rather than retranslated:
 * a client who uses both should not meet two different Tamil words for the
 * same thing, and those 1,266 strings were already reviewed.
 *
 * i18next and react-i18next are pure JavaScript, so this ships over the air -
 * no new APK, nothing for a client to reinstall.
 *
 * The chosen language is persisted, because the point of the feature is that
 * someone sets Tamil once and the app stays Tamil. It is read back before the
 * first render (see `loadStoredLanguage`), so the app never flashes English
 * on its way to the stored choice.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import 'intl-pluralrules';

import en from './resources.en';
import ta from './resources.ta';

export const LANGUAGES = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'ta', label: 'Tamil', native: 'தமிழ்' },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]['code'];

const STORAGE_KEY = 'nusi:language';

void i18n.use(initReactI18next).init({
  resources: { en, ta },
  lng: 'en',
  fallbackLng: 'en',
  // A missing Tamil key falls back to English rather than rendering the key
  // itself: a half-translated screen is readable, "home.greeting" is not.
  defaultNS: 'common',
  interpolation: { escapeValue: false },
  // React Native has no Intl.PluralRules on older engines; intl-pluralrules
  // above polyfills it, and this keeps i18next from warning when it loads.
  compatibilityJSON: 'v4',
  returnNull: false,
});

/**
 * Apply the stored language. Called once at startup, before the tree renders.
 * A failure here is not worth blocking the app for - it just means English.
 */
export async function loadStoredLanguage(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored && LANGUAGES.some((l) => l.code === stored)) {
      await i18n.changeLanguage(stored);
    }
  } catch {
    /* no stored preference, or storage unavailable - English it is */
  }
}

/** Switch language and remember it. */
export async function setLanguage(code: LanguageCode): Promise<void> {
  await i18n.changeLanguage(code);
  try {
    await AsyncStorage.setItem(STORAGE_KEY, code);
  } catch {
    // The language still changed for this session; it just will not persist.
  }
}

/**
 * The current language, as React state.
 *
 * `i18n.language` is a plain property: reading it inside a component gives
 * whatever it was when that component last rendered, so the selected chip in
 * Settings never moved when the language changed. Subscribing to the
 * languageChanged event is what makes the selection follow the choice.
 */
export function useCurrentLanguage(): LanguageCode {
  const [lang, setLang] = useState<LanguageCode>(
    () => (i18n.language as LanguageCode) ?? 'en',
  );
  useEffect(() => {
    const onChange = (next: string) => setLang(next as LanguageCode);
    i18n.on('languageChanged', onChange);
    return () => {
      i18n.off('languageChanged', onChange);
    };
  }, []);
  return lang;
}

export default i18n;

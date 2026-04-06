import { derived } from 'svelte/store';
import { user, organization } from '$lib/stores/auth';
import { setLanguageTag, availableLanguageTags, languageTag } from '$lib/paraglide/runtime.js';

export const LOCALE_STORAGE_KEY = 'orbit_locale';

/** Supported locale tags */
export const SUPPORTED_LOCALES = availableLanguageTags as readonly string[];

export const LOCALE_LABELS: Record<string, string> = {
  en: 'English',
  es: 'Español'
};

/**
 * Resolve the active locale from (in priority order):
 * 1. User's personal preference
 * 2. Organization default
 * 3. Browser Accept-Language
 * 4. 'en' fallback
 */
export function resolveLocale(
  userLocale: string | null | undefined,
  orgLocale: string | null | undefined
): string {
  if (userLocale && SUPPORTED_LOCALES.includes(userLocale)) return userLocale;
  if (orgLocale && SUPPORTED_LOCALES.includes(orgLocale)) return orgLocale;

  if (typeof navigator !== 'undefined') {
    const browserLang = navigator.language.split('-')[0];
    if (SUPPORTED_LOCALES.includes(browserLang)) return browserLang;
  }

  return 'en';
}

/**
 * Apply a locale tag to Paraglide and persist to localStorage.
 */
export function applyLocale(locale: string): void {
  if (!SUPPORTED_LOCALES.includes(locale)) return;
  setLanguageTag(locale as typeof availableLanguageTags[number]);
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Ignore storage errors (e.g. private browsing)
  }
}

/**
 * Initialize locale on app start. Reads from localStorage first (for pre-auth
 * pages), then overrides with user/org preference once auth is loaded.
 */
export function initializeLocale(
  userLocale?: string | null,
  orgLocale?: string | null
): void {
  // Use persisted value for immediate render (no flash)
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(LOCALE_STORAGE_KEY);
  } catch {
    // Ignore
  }

  const resolved = resolveLocale(userLocale, orgLocale) || stored || 'en';
  applyLocale(resolved);
}

/** Derived store: current active locale tag (reactive to user/org changes) */
export const activeLocale = derived([user, organization], ([$user, $org]) => {
  const orgLocale = ($org?.settings as Record<string, unknown>)?.default_locale as string | null;
  return resolveLocale($user?.locale, orgLocale);
});

/**
 * @fileoverview Theme State Management
 *
 * Multi-theme support with named themes. Each theme applies:
 * - A mode class ('dark' or nothing) on <html> for Tailwind dark: variants
 * - A data-theme attribute for theme-specific CSS variable overrides
 *
 * Available themes:
 * - 'light'     — Clean light theme (default)
 * - 'dracula'   — Dracula-inspired dark theme (default dark)
 * - 'system'    — Follows OS preference (light ↔ dracula)
 *
 * Future themes can be added by:
 * 1. Adding CSS variable overrides in app.css under [data-theme="name"]
 * 2. Adding the theme name to the ThemeName type and THEMES array
 *
 * @module stores/theme
 */

import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';

/** All available theme names */
export type ThemeName = 'light' | 'dracula' | 'system';

/** Theme metadata for UI display */
export interface ThemeInfo {
  name: ThemeName;
  label: string;
  description: string;
  isDark: boolean;
  icon: string;
}

/** Registry of all available themes */
export const THEMES: ThemeInfo[] = [
  { name: 'light', label: 'Light', description: 'Clean light theme', isDark: false, icon: 'sun' },
  { name: 'dracula', label: 'Dracula', description: 'Dark theme with vibrant accents', isDark: true, icon: 'moon' },
  { name: 'system', label: 'System', description: 'Follow your OS preference', isDark: false, icon: 'monitor' },
];

const STORAGE_KEY = 'orbit_theme';

/**
 * Gets the initial theme from localStorage or defaults to 'system'.
 */
function getInitialTheme(): ThemeName {
  if (!browser) return 'system';

  const stored = localStorage.getItem(STORAGE_KEY);
  // Migrate old 'dark' preference to 'dracula'
  if (stored === 'dark') return 'dracula';
  if (stored && THEMES.some(t => t.name === stored)) return stored as ThemeName;
  return 'system';
}

/**
 * Detects the system's preferred color scheme.
 */
function getSystemPrefersDark(): boolean {
  if (!browser) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * Resolves a theme name to its effective display theme.
 * 'system' resolves based on OS preference.
 */
export function resolveTheme(theme: ThemeName): Exclude<ThemeName, 'system'> {
  if (theme === 'system') {
    return getSystemPrefersDark() ? 'dracula' : 'light';
  }
  return theme;
}

/**
 * Gets theme info for a given theme name.
 */
export function getThemeInfo(name: ThemeName): ThemeInfo | undefined {
  return THEMES.find(t => t.name === name);
}

/**
 * Checks if a theme is a dark theme.
 */
function isThemeDark(theme: ThemeName): boolean {
  if (theme === 'system') return getSystemPrefersDark();
  const info = getThemeInfo(theme);
  return info?.isDark ?? false;
}

/**
 * Applies theme classes and attributes to the document.
 */
function applyTheme(themeName: ThemeName) {
  if (!browser) return;

  const resolved = resolveTheme(themeName);
  const isDark = isThemeDark(themeName);

  // Apply dark class for Tailwind
  if (isDark) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }

  // Apply data-theme for theme-specific CSS
  document.documentElement.setAttribute('data-theme', resolved);
}

/**
 * Creates the theme store with multi-theme support.
 */
function createThemeStore() {
  const { subscribe, set, update } = writable<ThemeName>(getInitialTheme());

  // Apply theme on initialization
  if (browser) {
    applyTheme(getInitialTheme());

    // Listen for system theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      const current = localStorage.getItem(STORAGE_KEY) as ThemeName | null;
      if (current === 'system' || !current) {
        applyTheme('system');
      }
    });
  }

  return {
    subscribe,

    /** Set a specific theme */
    setTheme(theme: ThemeName) {
      if (browser) {
        localStorage.setItem(STORAGE_KEY, theme);
      }
      applyTheme(theme);
      set(theme);
    },

    /** Toggle between light and dracula */
    toggle() {
      update(current => {
        const resolved = resolveTheme(current);
        const newTheme: ThemeName = resolved === 'light' ? 'dracula' : 'light';
        if (browser) {
          localStorage.setItem(STORAGE_KEY, newTheme);
        }
        applyTheme(newTheme);
        return newTheme;
      });
    },

    /** Cycle through all non-system themes */
    cycle() {
      update(current => {
        const nonSystem = THEMES.filter(t => t.name !== 'system');
        const currentIdx = nonSystem.findIndex(t => t.name === resolveTheme(current));
        const nextIdx = (currentIdx + 1) % nonSystem.length;
        const newTheme = nonSystem[nextIdx].name;
        if (browser) {
          localStorage.setItem(STORAGE_KEY, newTheme);
        }
        applyTheme(newTheme);
        return newTheme;
      });
    },

    /** Initialize theme (call on app mount) */
    initialize() {
      if (browser) {
        const theme = getInitialTheme();
        applyTheme(theme);
        set(theme);
      }
    }
  };
}

export const theme = createThemeStore();

/** Derived store: whether current theme is dark */
export const isDarkTheme = derived(theme, ($theme) => isThemeDark($theme));

/** Derived store: resolved theme name (never 'system') */
export const resolvedTheme = derived(theme, ($theme) => resolveTheme($theme));

/**
 * @deprecated Use resolveTheme() instead
 */
export function getEffectiveTheme(themeValue: ThemeName): 'light' | 'dark' {
  return isThemeDark(themeValue) ? 'dark' : 'light';
}

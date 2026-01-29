/**
 * @fileoverview Theme State Management
 *
 * This module provides the theme store for light/dark mode support.
 * Supports user preference, system preference, and manual toggle.
 *
 * @module stores/theme
 *
 * Exported Stores:
 * - theme - Current theme setting ('light', 'dark', 'system')
 *
 * Exported Functions:
 * - getEffectiveTheme - Resolves 'system' to actual theme
 *
 * Features:
 * - Persists preference to localStorage
 * - Listens for system theme changes
 * - Applies 'dark' class to document for Tailwind
 *
 * @example
 * ```svelte
 * <script>
 *   import { theme, getEffectiveTheme } from '$lib/stores/theme';
 *
 *   $: effectiveTheme = getEffectiveTheme($theme);
 * </script>
 *
 * <button on:click={() => theme.toggle()}>
 *   Current: {effectiveTheme}
 * </button>
 * ```
 */

import { writable } from 'svelte/store';
import { browser } from '$app/environment';

/** Theme setting options */
type Theme = 'light' | 'dark' | 'system';

/**
 * Gets the initial theme from localStorage or defaults to 'system'.
 * @returns Stored theme or 'system'
 */
function getInitialTheme(): Theme {
  if (!browser) return 'system';

  const stored = localStorage.getItem('orbit_theme') as Theme | null;
  if (stored && ['light', 'dark', 'system'].includes(stored)) {
    return stored;
  }
  return 'system';
}

/**
 * Detects the system's preferred color scheme.
 * @returns 'dark' if system prefers dark mode, 'light' otherwise
 */
function getSystemTheme(): 'light' | 'dark' {
  if (!browser) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Creates the theme store with persistence and system preference support.
 * Automatically applies theme class to document on change.
 *
 * @returns Theme store with setTheme, toggle, and initialize methods
 */
function createThemeStore() {
  const { subscribe, set, update } = writable<Theme>(getInitialTheme());

  function applyTheme(theme: Theme) {
    if (!browser) return;

    const effectiveTheme = theme === 'system' ? getSystemTheme() : theme;

    if (effectiveTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }

  // Apply theme on initialization
  if (browser) {
    const initialTheme = getInitialTheme();
    applyTheme(initialTheme);

    // Listen for system theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      const currentTheme = localStorage.getItem('orbit_theme') as Theme | null;
      if (currentTheme === 'system' || !currentTheme) {
        applyTheme('system');
      }
    });
  }

  return {
    subscribe,

    setTheme(theme: Theme) {
      if (browser) {
        localStorage.setItem('orbit_theme', theme);
      }
      applyTheme(theme);
      set(theme);
    },

    toggle() {
      update(current => {
        const newTheme = current === 'light' ? 'dark' : 'light';
        if (browser) {
          localStorage.setItem('orbit_theme', newTheme);
        }
        applyTheme(newTheme);
        return newTheme;
      });
    },

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

/**
 * Resolves the effective theme from a theme setting.
 * Converts 'system' to the actual system preference.
 *
 * @param themeValue - Current theme setting
 * @returns 'light' or 'dark' (never 'system')
 */
export function getEffectiveTheme(themeValue: Theme): 'light' | 'dark' {
  if (themeValue === 'system') {
    return getSystemTheme();
  }
  return themeValue;
}

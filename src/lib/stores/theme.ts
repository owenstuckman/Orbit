import { writable } from 'svelte/store';
import { browser } from '$app/environment';

type Theme = 'light' | 'dark' | 'system';

function getInitialTheme(): Theme {
  if (!browser) return 'system';

  const stored = localStorage.getItem('orbit_theme') as Theme | null;
  if (stored && ['light', 'dark', 'system'].includes(stored)) {
    return stored;
  }
  return 'system';
}

function getSystemTheme(): 'light' | 'dark' {
  if (!browser) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

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

// Derived store for the effective theme (resolved from system)
export function getEffectiveTheme(themeValue: Theme): 'light' | 'dark' {
  if (themeValue === 'system') {
    return getSystemTheme();
  }
  return themeValue;
}

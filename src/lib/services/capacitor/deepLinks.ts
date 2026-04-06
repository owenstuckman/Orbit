/**
 * Deep Links service.
 *
 * Handles universal links (iOS) / app links (Android) for:
 *   /contract/[token]  → open contract signing page in-app
 *   /submit/[token]    → open external submission page in-app
 *
 * Call initializeDeepLinks() once in the app layout after auth loads.
 * No-ops on web.
 */

import { isNative } from './platform';

let cleanupFn: (() => void) | null = null;

/**
 * Start listening for deep link URL events.
 * Navigates using SvelteKit's goto when a matching URL arrives.
 */
export async function initializeDeepLinks(): Promise<void> {
  if (!isNative()) return;

  try {
    const { App } = await import('@capacitor/app');
    const { goto } = await import('$app/navigation');

    // Handle initial URL if app was cold-started via deep link
    const launchUrl = await App.getLaunchUrl();
    if (launchUrl?.url) {
      handleUrl(launchUrl.url, goto);
    }

    // Listen for URLs while app is running (warm start / foreground)
    const handle = await App.addListener('appUrlOpen', (event) => {
      handleUrl(event.url, goto);
    });

    // Store cleanup
    cleanupFn = () => handle.remove();
  } catch (err) {
    console.error('[DeepLinks] Initialization failed:', err);
  }
}

/** Remove the deep link listener (call on app teardown). */
export function cleanupDeepLinks(): void {
  cleanupFn?.();
  cleanupFn = null;
}

function handleUrl(url: string, goto: (path: string) => void): void {
  try {
    // Accept both https://owenstuckman.lol/... and com.orbit.app://...
    const parsed = new URL(url);
    const path = parsed.pathname + parsed.search;

    // Only navigate for routes we own
    if (
      path.startsWith('/contract/') ||
      path.startsWith('/submit/') ||
      path.startsWith('/auth/')
    ) {
      goto(path);
    }
  } catch (err) {
    console.warn('[DeepLinks] Could not parse URL:', url, err);
  }
}

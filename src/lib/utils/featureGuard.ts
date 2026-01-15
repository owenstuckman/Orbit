import { get } from 'svelte/store';
import { goto } from '$app/navigation';
import { featureFlags } from '$lib/stores/featureFlags';
import type { FeatureFlag } from '$lib/types';

/**
 * Check if a feature is enabled (non-reactive, for use in scripts)
 * Returns true if enabled, false if disabled
 */
export function checkFeature(flag: FeatureFlag): boolean {
  const flags = get(featureFlags);
  return flags[flag] ?? false;
}

/**
 * Guard a route by feature flag.
 * Redirects to the specified path if the feature is disabled.
 * Use in page component's onMount.
 *
 * @param flag - The feature flag to check
 * @param redirectTo - Where to redirect if feature is disabled (default: /dashboard)
 * @returns Promise<boolean> - true if allowed, false if redirected
 *
 * @example
 * ```svelte
 * <script>
 *   import { onMount } from 'svelte';
 *   import { guardFeature } from '$lib/utils/featureGuard';
 *
 *   let allowed = false;
 *
 *   onMount(async () => {
 *     allowed = await guardFeature('achievements');
 *   });
 * </script>
 *
 * {#if allowed}
 *   <!-- Page content -->
 * {/if}
 * ```
 */
export async function guardFeature(
  flag: FeatureFlag,
  redirectTo: string = '/dashboard'
): Promise<boolean> {
  const flags = get(featureFlags);

  if (!flags[flag]) {
    await goto(redirectTo);
    return false;
  }

  return true;
}

/**
 * Guard a route by multiple feature flags (all must be enabled).
 * Redirects to the specified path if any feature is disabled.
 *
 * @param flags - Array of feature flags to check
 * @param redirectTo - Where to redirect if any feature is disabled
 * @returns Promise<boolean> - true if all allowed, false if redirected
 */
export async function guardFeatures(
  flags: FeatureFlag[],
  redirectTo: string = '/dashboard'
): Promise<boolean> {
  const currentFlags = get(featureFlags);

  const allEnabled = flags.every((flag) => currentFlags[flag]);

  if (!allEnabled) {
    await goto(redirectTo);
    return false;
  }

  return true;
}

/**
 * Check multiple features and return which ones are enabled.
 * Useful for conditionally showing parts of a page.
 *
 * @param flags - Array of feature flags to check
 * @returns Record of flag -> enabled status
 */
export function checkFeatures(flags: FeatureFlag[]): Record<FeatureFlag, boolean> {
  const currentFlags = get(featureFlags);
  const result = {} as Record<FeatureFlag, boolean>;

  for (const flag of flags) {
    result[flag] = currentFlags[flag] ?? false;
  }

  return result;
}

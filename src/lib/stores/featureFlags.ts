import { derived, get } from 'svelte/store';
import { organization } from './auth';
import type { FeatureFlag, FeatureFlags } from '$lib/types';
import { DEFAULT_FEATURE_FLAGS, resolveFeatureFlags } from '$lib/config/featureFlags';

/**
 * Derived store that resolves feature flags from organization settings.
 * Merges saved flags with defaults so missing flags get default values.
 */
export const featureFlags = derived(
  organization,
  ($organization): FeatureFlags => {
    if (!$organization) {
      return DEFAULT_FEATURE_FLAGS;
    }

    const savedFlags = $organization.settings?.feature_flags as Partial<FeatureFlags> | undefined;
    return resolveFeatureFlags(savedFlags);
  }
);

/**
 * Helper function to check if a feature is enabled (non-reactive, for use in scripts)
 */
export function isFeatureEnabled(flag: FeatureFlag): boolean {
  const flags = get(featureFlags);
  return flags[flag] ?? DEFAULT_FEATURE_FLAGS[flag];
}

/**
 * Individual feature stores for reactive checks in components.
 * Use these in templates: {#if $features.tasks}...{/if}
 */
export const features = {
  tasks: derived(featureFlags, ($f) => $f.tasks),
  projects: derived(featureFlags, ($f) => $f.projects),
  qc_reviews: derived(featureFlags, ($f) => $f.qc_reviews),
  contracts: derived(featureFlags, ($f) => $f.contracts),
  payouts: derived(featureFlags, ($f) => $f.payouts),
  achievements: derived(featureFlags, ($f) => $f.achievements),
  leaderboard: derived(featureFlags, ($f) => $f.leaderboard),
  analytics: derived(featureFlags, ($f) => $f.analytics),
  notifications_page: derived(featureFlags, ($f) => $f.notifications_page),
  external_assignments: derived(featureFlags, ($f) => $f.external_assignments),
  salary_mixer: derived(featureFlags, ($f) => $f.salary_mixer),
  file_uploads: derived(featureFlags, ($f) => $f.file_uploads),
  realtime_updates: derived(featureFlags, ($f) => $f.realtime_updates),
  story_points: derived(featureFlags, ($f) => $f.story_points),
  urgency_multipliers: derived(featureFlags, ($f) => $f.urgency_multipliers),
  ai_qc_review: derived(featureFlags, ($f) => $f.ai_qc_review),
  multi_org: derived(featureFlags, ($f) => $f.multi_org)
};

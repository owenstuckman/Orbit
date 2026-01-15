<script lang="ts">
  import { organization } from '$lib/stores/auth';
  import { featureFlags } from '$lib/stores/featureFlags';
  import { organizationsApi } from '$lib/services/api';
  import {
    FEATURE_FLAG_META,
    FEATURE_FLAG_PRESETS,
    FEATURE_CATEGORIES,
    getFlagsByCategory,
    countEnabledFeatures,
    getTotalFeatureCount
  } from '$lib/config/featureFlags';
  import type { FeatureFlag, FeatureFlagPreset, FeatureFlags } from '$lib/types';
  import {
    Settings,
    Save,
    RotateCcw,
    Check,
    Zap,
    Sparkles,
    Box,
    Puzzle,
    AlertCircle
  } from 'lucide-svelte';

  let saving = false;
  let saved = false;
  let error = '';
  let localFlags: FeatureFlags = { ...$featureFlags };

  // Sync local flags when featureFlags store changes
  $: if ($featureFlags) {
    localFlags = { ...$featureFlags };
  }

  $: hasChanges = JSON.stringify(localFlags) !== JSON.stringify($featureFlags);
  $: enabledCount = countEnabledFeatures(localFlags);
  $: totalCount = getTotalFeatureCount();

  // Category keys in order
  type CategoryKey = 'core' | 'gamification' | 'advanced' | 'integrations';
  const categoryOrder: CategoryKey[] = ['core', 'gamification', 'advanced', 'integrations'];

  // Category icons
  const categoryIcons: Record<CategoryKey, typeof Box> = {
    core: Box,
    gamification: Sparkles,
    advanced: Zap,
    integrations: Puzzle
  };

  async function saveFlags() {
    if (!$organization) return;

    saving = true;
    saved = false;
    error = '';

    const result = await organizationsApi.updateFeatureFlags($organization.id, localFlags);

    if (result) {
      // Reload organization to update store
      await organization.load();
      saved = true;
      setTimeout(() => (saved = false), 3000);
    } else {
      error = 'Failed to save feature flags. Please try again.';
    }

    saving = false;
  }

  function resetFlags() {
    localFlags = { ...$featureFlags };
    error = '';
  }

  async function applyPreset(preset: FeatureFlagPreset) {
    localFlags = { ...FEATURE_FLAG_PRESETS[preset] };
  }

  function toggleFlag(flag: FeatureFlag) {
    localFlags = { ...localFlags, [flag]: !localFlags[flag] };
  }
</script>

<div class="space-y-6">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
        <Settings size={20} class="text-slate-400" />
        Feature Flags
      </h2>
      <p class="text-sm text-slate-600 dark:text-slate-400 mt-1">
        Enable or disable features for your organization ({enabledCount}/{totalCount} enabled)
      </p>
    </div>

    <div class="flex items-center gap-3">
      {#if hasChanges}
        <button
          on:click={resetFlags}
          class="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
        >
          <RotateCcw size={16} />
          Reset
        </button>
      {/if}

      <button
        on:click={saveFlags}
        disabled={saving || !hasChanges}
        class="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {#if saving}
          <div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
        {:else if saved}
          <Check size={16} />
        {:else}
          <Save size={16} />
        {/if}
        {saved ? 'Saved!' : 'Save Changes'}
      </button>
    </div>
  </div>

  <!-- Error message -->
  {#if error}
    <div class="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400">
      <AlertCircle size={16} />
      <span class="text-sm">{error}</span>
    </div>
  {/if}

  <!-- Presets -->
  <div class="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4">
    <p class="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Quick Presets</p>
    <div class="flex flex-wrap gap-2">
      <button
        on:click={() => applyPreset('all_features')}
        class="px-3 py-1.5 text-sm bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-lg hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors"
      >
        All Features
      </button>
      <button
        on:click={() => applyPreset('standard')}
        class="px-3 py-1.5 text-sm bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
      >
        Standard
      </button>
      <button
        on:click={() => applyPreset('minimal')}
        class="px-3 py-1.5 text-sm bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-lg hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors"
      >
        Minimal
      </button>
      <button
        on:click={() => applyPreset('none')}
        class="px-3 py-1.5 text-sm bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
      >
        None
      </button>
    </div>
  </div>

  <!-- Feature toggles by category -->
  {#each categoryOrder as category}
    {@const catMeta = FEATURE_CATEGORIES[category]}
    {@const flags = getFlagsByCategory(category)}
    {@const Icon = categoryIcons[category]}
    {#if flags.length > 0}
      <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div class="px-4 py-3 bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-600 flex items-center gap-2">
          <svelte:component this={Icon} size={18} class="text-slate-500 dark:text-slate-400" />
          <span class="font-medium text-slate-700 dark:text-slate-300">{catMeta.label}</span>
          <span class="ml-auto text-xs text-slate-500 dark:text-slate-400">
            {flags.filter(f => localFlags[f]).length}/{flags.length} enabled
          </span>
        </div>
        <div class="divide-y divide-slate-100 dark:divide-slate-700">
          {#each flags as flag}
            {@const meta = FEATURE_FLAG_META[flag]}
            <div class="px-4 py-3 flex items-center justify-between gap-4">
              <div class="min-w-0">
                <p class="font-medium text-slate-900 dark:text-white">{meta.label}</p>
                <p class="text-sm text-slate-500 dark:text-slate-400 truncate">{meta.description}</p>
              </div>
              <button
                type="button"
                on:click={() => toggleFlag(flag)}
                class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800 {localFlags[flag]
                  ? 'bg-indigo-600'
                  : 'bg-slate-300 dark:bg-slate-600'}"
                role="switch"
                aria-checked={localFlags[flag]}
              >
                <span
                  class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out {localFlags[flag]
                    ? 'translate-x-5'
                    : 'translate-x-0'}"
                />
              </button>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  {/each}
</div>

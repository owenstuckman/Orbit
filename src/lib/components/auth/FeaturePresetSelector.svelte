<script lang="ts">
  import {
    FEATURE_FLAG_PRESETS,
    FEATURE_FLAG_META,
    countEnabledFeatures,
    getTotalFeatureCount
  } from '$lib/config/featureFlags';
  import type { FeatureFlagPreset } from '$lib/types';
  import { Box, Sparkles, Zap, Check, ChevronDown, ChevronUp } from 'lucide-svelte';

  export let selectedPreset: FeatureFlagPreset = 'standard';

  let showDetails = false;

  const presetMeta: Record<FeatureFlagPreset, {
    label: string;
    description: string;
    color: string;
    icon: typeof Box;
  }> = {
    all_features: {
      label: 'All Features',
      description: 'Everything enabled including AI QC and multi-org support',
      color: 'green',
      icon: Sparkles
    },
    standard: {
      label: 'Standard',
      description: 'Recommended for most teams - all core features enabled',
      color: 'indigo',
      icon: Box
    },
    minimal: {
      label: 'Minimal',
      description: 'Basic task and project management only',
      color: 'amber',
      icon: Zap
    },
    none: {
      label: 'Custom',
      description: 'Start from scratch and configure features later',
      color: 'slate',
      icon: Box
    }
  };

  // Get a summary of enabled features for a preset
  function getPresetSummary(preset: FeatureFlagPreset): string[] {
    const flags = FEATURE_FLAG_PRESETS[preset];
    const enabledFlags = Object.entries(flags)
      .filter(([_, enabled]) => enabled)
      .map(([flag]) => FEATURE_FLAG_META[flag as keyof typeof FEATURE_FLAG_META]?.label || flag);
    return enabledFlags;
  }

  function selectPreset(preset: FeatureFlagPreset) {
    selectedPreset = preset;
  }

  // Define preset order for display
  const presetOrder: FeatureFlagPreset[] = ['standard', 'all_features', 'minimal', 'none'];

  $: totalCount = getTotalFeatureCount();
</script>

<div class="space-y-4">
  <div>
    <span class="block text-sm font-medium text-indigo-200 mb-2">
      Organization Features
    </span>
    <p class="text-xs text-slate-400 mb-3">
      Choose which features to enable. You can change this later in settings.
    </p>
  </div>

  <!-- Preset cards -->
  <div class="grid grid-cols-2 gap-3">
    {#each presetOrder as preset}
      {@const meta = presetMeta[preset]}
      {@const enabledCount = countEnabledFeatures(FEATURE_FLAG_PRESETS[preset])}
      {@const isSelected = selectedPreset === preset}
      <button
        type="button"
        on:click={() => selectPreset(preset)}
        class="relative p-4 rounded-xl border-2 text-left transition-all {isSelected
          ? 'border-indigo-500 bg-indigo-500/20'
          : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'}"
      >
        {#if isSelected}
          <div class="absolute top-2 right-2">
            <div class="w-5 h-5 bg-indigo-500 rounded-full flex items-center justify-center">
              <Check size={12} class="text-white" />
            </div>
          </div>
        {/if}

        <div class="flex items-center gap-2 mb-2">
          <svelte:component this={meta.icon} size={18} class="text-{meta.color}-400" />
          <span class="font-medium text-white text-sm">{meta.label}</span>
        </div>

        <p class="text-xs text-slate-400 line-clamp-2 mb-2">
          {meta.description}
        </p>

        <div class="text-xs text-slate-500">
          {enabledCount}/{totalCount} features
        </div>

        {#if preset === 'standard'}
          <span class="absolute -top-2 -right-2 bg-indigo-500 text-white text-xs px-2 py-0.5 rounded-full">
            Recommended
          </span>
        {/if}
      </button>
    {/each}
  </div>

  <!-- Show/hide details toggle -->
  <button
    type="button"
    on:click={() => showDetails = !showDetails}
    class="flex items-center gap-2 text-xs text-indigo-300 hover:text-indigo-200 transition-colors w-full justify-center"
  >
    {showDetails ? 'Hide' : 'Show'} feature details
    {#if showDetails}
      <ChevronUp size={14} />
    {:else}
      <ChevronDown size={14} />
    {/if}
  </button>

  <!-- Feature details panel -->
  {#if showDetails}
    <div class="bg-white/5 rounded-xl p-4 max-h-48 overflow-y-auto">
      <p class="text-xs font-medium text-indigo-200 mb-2">
        Features in "{presetMeta[selectedPreset].label}":
      </p>
      <div class="flex flex-wrap gap-1.5">
        {#each getPresetSummary(selectedPreset) as feature}
          <span class="px-2 py-0.5 bg-indigo-500/20 text-indigo-200 text-xs rounded-full">
            {feature}
          </span>
        {:else}
          <span class="text-xs text-slate-400">No features enabled</span>
        {/each}
      </div>
    </div>
  {/if}
</div>

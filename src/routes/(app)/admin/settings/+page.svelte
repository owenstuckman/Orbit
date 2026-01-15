<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { user, organization, currentOrgRole } from '$lib/stores/auth';
  import { organizationsApi } from '$lib/services/api';
  import { FeatureFlagsPanel } from '$lib/components/admin';
  import type { Organization } from '$lib/types';
  import {
    Settings,
    Save,
    RotateCcw,
    DollarSign,
    Percent,
    AlertTriangle,
    Check,
    Info,
    UserPlus,
    Sliders
  } from 'lucide-svelte';

  let org: Organization | null = null;
  let loading = true;
  let saving = false;
  let saved = false;

  // Form state
  let form = {
    name: '',
    default_r: 0.7,
    r_min: 0.5,
    r_max: 0.9,
    qc_beta: 0.25,
    qc_gamma: 0.4,
    pm_x: 0.5,
    pm_overdraft_penalty: 1.5,
    allow_external_assignment: true
  };

  let originalForm = { ...form };

  $: hasChanges = JSON.stringify(form) !== JSON.stringify(originalForm);

  onMount(async () => {
    if ($currentOrgRole !== 'admin') {
      goto('/dashboard');
      return;
    }

    await loadOrg();
  });

  async function loadOrg() {
    loading = true;
    try {
      org = await organizationsApi.getCurrent();
      if (org) {
        form = {
          name: org.name,
          default_r: org.default_r,
          r_min: org.r_bounds.min,
          r_max: org.r_bounds.max,
          qc_beta: org.qc_beta,
          qc_gamma: org.qc_gamma,
          pm_x: org.pm_x,
          pm_overdraft_penalty: org.pm_overdraft_penalty,
          allow_external_assignment: org.allow_external_assignment ?? true
        };
        originalForm = { ...form };
      }
    } catch (error) {
      console.error('Failed to load organization:', error);
    } finally {
      loading = false;
    }
  }

  async function saveSettings() {
    if (!org) return;

    saving = true;
    saved = false;
    try {
      await organizationsApi.updateSettings(org.id, {
        name: form.name,
        default_r: form.default_r,
        r_bounds: { min: form.r_min, max: form.r_max },
        qc_beta: form.qc_beta,
        qc_gamma: form.qc_gamma,
        pm_x: form.pm_x,
        pm_overdraft_penalty: form.pm_overdraft_penalty,
        allow_external_assignment: form.allow_external_assignment
      });
      originalForm = { ...form };
      saved = true;
      setTimeout(() => saved = false, 3000);
    } catch (error) {
      console.error('Failed to save settings:', error);
    } finally {
      saving = false;
    }
  }

  function resetForm() {
    form = { ...originalForm };
  }
</script>

<svelte:head>
  <title>Organization Settings - Orbit Admin</title>
</svelte:head>

<div class="max-w-4xl mx-auto space-y-6">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-2xl font-bold text-slate-900 dark:text-white">Organization Settings</h1>
      <p class="mt-1 text-slate-600 dark:text-slate-300">Configure payout rates and organization preferences</p>
    </div>

    <div class="flex items-center gap-3">
      {#if hasChanges}
        <button
          on:click={resetForm}
          class="flex items-center gap-2 px-4 py-2 text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
        >
          <RotateCcw size={16} />
          Reset
        </button>
      {/if}

      <button
        on:click={saveSettings}
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

  {#if loading}
    <div class="flex items-center justify-center py-20">
      <div class="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
    </div>
  {:else}
    <!-- General Settings -->
    <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
      <h2 class="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
        <Settings size={20} class="text-slate-400 dark:text-slate-500" />
        General Settings
      </h2>

      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1" for="org-name">
            Organization Name
          </label>
          <input
            id="org-name"
            type="text"
            bind:value={form.name}
            class="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
      </div>
    </div>

    <!-- External Assignment Settings -->
    <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
      <h2 class="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
        <UserPlus size={20} class="text-slate-400 dark:text-slate-500" />
        External Contractors
      </h2>

      <div class="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
        <div>
          <p class="font-medium text-slate-900 dark:text-white">Allow External Task Assignment</p>
          <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">
            When enabled, PMs and admins can assign tasks to external contractors via guest links and auto-generated contracts.
          </p>
        </div>
        <button
          type="button"
          on:click={() => form.allow_external_assignment = !form.allow_external_assignment}
          class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 {form.allow_external_assignment ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-600'}"
          role="switch"
          aria-checked={form.allow_external_assignment}
        >
          <span
            class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out {form.allow_external_assignment ? 'translate-x-5' : 'translate-x-0'}"
          />
        </button>
      </div>
    </div>

    <!-- Salary Mix Settings -->
    <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
      <h2 class="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
        <DollarSign size={20} class="text-slate-400 dark:text-slate-500" />
        Salary Mix (r Value)
      </h2>

      <div class="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg mb-6">
        <div class="flex gap-3">
          <Info class="text-blue-500 dark:text-blue-400 flex-shrink-0 mt-0.5" size={18} />
          <div class="text-sm text-blue-700 dark:text-blue-300">
            <p class="font-medium">salary = base_salary × r + task_value × (1 - r)</p>
            <p class="mt-1">Higher r = more guaranteed salary, less task-based pay</p>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div>
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1" for="default-r">
            Default R Value
          </label>
          <input
            id="default-r"
            type="number"
            bind:value={form.default_r}
            min="0"
            max="1"
            step="0.05"
            class="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
          <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">Applied to new employees</p>
        </div>

        <div>
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1" for="r-min">
            Minimum R
          </label>
          <input
            id="r-min"
            type="number"
            bind:value={form.r_min}
            min="0"
            max="1"
            step="0.05"
            class="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1" for="r-max">
            Maximum R
          </label>
          <input
            id="r-max"
            type="number"
            bind:value={form.r_max}
            min="0"
            max="1"
            step="0.05"
            class="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
      </div>
    </div>

    <!-- QC Shapley Settings -->
    <div class="bg-white rounded-xl border border-slate-200 p-6">
      <h2 class="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
        <Percent size={20} class="text-slate-400" />
        QC Shapley Parameters
      </h2>

      <div class="p-4 bg-purple-50 rounded-lg mb-6">
        <div class="flex gap-3">
          <Info class="text-purple-500 flex-shrink-0 mt-0.5" size={18} />
          <div class="text-sm text-purple-700">
            <p class="font-medium">d₁ = β × p₀ × V (first pass marginal)</p>
            <p class="font-medium">dₖ = d₁ × γ^(k-1) (geometric decay)</p>
            <p class="mt-1">These control how much QC reviewers earn per review pass</p>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1" for="qc-beta">
            Beta (β) - Confidence Scaling
          </label>
          <input
            id="qc-beta"
            type="number"
            bind:value={form.qc_beta}
            min="0.1"
            max="0.5"
            step="0.05"
            class="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
          <p class="mt-1 text-xs text-slate-500">Recommended: 0.15 - 0.35</p>
        </div>

        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1" for="qc-gamma">
            Gamma (γ) - Decay Factor
          </label>
          <input
            id="qc-gamma"
            type="number"
            bind:value={form.qc_gamma}
            min="0.2"
            max="0.8"
            step="0.05"
            class="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
          <p class="mt-1 text-xs text-slate-500">Recommended: 0.3 - 0.6</p>
        </div>
      </div>
    </div>

    <!-- PM Settings -->
    <div class="bg-white rounded-xl border border-slate-200 p-6">
      <h2 class="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
        <DollarSign size={20} class="text-slate-400" />
        Project Manager Payout
      </h2>

      <div class="p-4 bg-green-50 rounded-lg mb-6">
        <div class="flex gap-3">
          <Info class="text-green-500 flex-shrink-0 mt-0.5" size={18} />
          <div class="text-sm text-green-700">
            <p class="font-medium">payout = (budget - spent) × X - overdraft × (penalty × X) + bonus</p>
            <p class="mt-1">PMs earn a share of budget savings, penalized for overdrafts</p>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1" for="pm-x">
            Profit Share Rate (X)
          </label>
          <input
            id="pm-x"
            type="number"
            bind:value={form.pm_x}
            min="0.1"
            max="1"
            step="0.05"
            class="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
          <p class="mt-1 text-xs text-slate-500">Share of savings PM receives</p>
        </div>

        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1" for="pm-penalty">
            Overdraft Penalty Multiplier
          </label>
          <input
            id="pm-penalty"
            type="number"
            bind:value={form.pm_overdraft_penalty}
            min="1"
            max="3"
            step="0.1"
            class="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
          <p class="mt-1 text-xs text-slate-500">Penalty multiplier for budget overruns</p>
        </div>
      </div>
    </div>

    <!-- Warning -->
    <div class="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl flex items-start gap-3">
      <AlertTriangle class="text-amber-500 flex-shrink-0 mt-0.5" size={20} />
      <div>
        <p class="font-medium text-amber-800 dark:text-amber-300">Changes affect all calculations</p>
        <p class="text-sm text-amber-700 dark:text-amber-400 mt-1">
          Modifying these settings will affect future payout calculations for all users.
          Existing payouts will not be retroactively changed.
        </p>
      </div>
    </div>

    <!-- Feature Flags Section -->
    <div class="mt-8 pt-8 border-t border-slate-200 dark:border-slate-700">
      <div class="flex items-center gap-2 mb-6">
        <Sliders size={24} class="text-slate-400" />
        <h2 class="text-xl font-bold text-slate-900 dark:text-white">Feature Management</h2>
      </div>
      <FeatureFlagsPanel />
    </div>
  {/if}
</div>

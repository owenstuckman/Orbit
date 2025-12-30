<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { GitPullRequest, Plus, Check, AlertCircle } from 'lucide-svelte';
  import { artifactsService } from '$lib/services/artifacts';

  export let disabled = false;

  const dispatch = createEventDispatcher<{ add: string; error: string }>();

  let url = '';
  let parsed: { owner: string; repo: string; pr_number: number } | null = null;
  let error = '';

  $: {
    if (url.trim()) {
      parsed = artifactsService.parseGitHubPRUrl(url);
      error = parsed ? '' : 'Invalid GitHub PR URL format';
    } else {
      parsed = null;
      error = '';
    }
  }

  function handleSubmit() {
    if (!url.trim() || !parsed) {
      error = 'Please enter a valid GitHub PR URL';
      return;
    }

    dispatch('add', url);
    url = '';
    parsed = null;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && parsed) {
      e.preventDefault();
      handleSubmit();
    }
  }
</script>

<div class="space-y-3">
  <div class="flex gap-2">
    <div class="relative flex-1">
      <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <GitPullRequest class="text-slate-400" size={18} />
      </div>
      <input
        type="url"
        bind:value={url}
        on:keydown={handleKeydown}
        placeholder="https://github.com/owner/repo/pull/123"
        class="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm
          {error && url ? 'border-red-300 focus:ring-red-500' : ''}"
        {disabled}
      />
    </div>
    <button
      type="button"
      on:click={handleSubmit}
      disabled={disabled || !parsed}
      class="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
    >
      <Plus size={18} />
      Add
    </button>
  </div>

  {#if parsed}
    <div class="flex items-center gap-2 text-sm text-green-600 bg-green-50 rounded-lg px-3 py-2">
      <Check size={16} />
      <span>
        <strong>{parsed.owner}/{parsed.repo}</strong> Pull Request #{parsed.pr_number}
      </span>
    </div>
  {:else if error && url}
    <div class="flex items-center gap-2 text-sm text-red-600">
      <AlertCircle size={16} />
      <span>{error}</span>
    </div>
  {:else}
    <p class="text-xs text-slate-400">
      Paste a GitHub Pull Request URL to add it as an artifact
    </p>
  {/if}
</div>

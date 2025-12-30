<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { Link, Plus, AlertCircle } from 'lucide-svelte';
  import { artifactsService } from '$lib/services/artifacts';

  export let disabled = false;

  const dispatch = createEventDispatcher<{ add: { url: string; title?: string }; error: string }>();

  let url = '';
  let title = '';
  let error = '';

  $: isValid = url.trim() && artifactsService.isValidUrl(url);

  function handleSubmit() {
    if (!url.trim()) {
      error = 'Please enter a URL';
      return;
    }

    if (!artifactsService.isValidUrl(url)) {
      error = 'Please enter a valid URL';
      return;
    }

    dispatch('add', { url, title: title.trim() || undefined });
    url = '';
    title = '';
    error = '';
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && isValid) {
      e.preventDefault();
      handleSubmit();
    }
  }
</script>

<div class="space-y-3">
  <div class="space-y-2">
    <div class="relative">
      <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <Link class="text-slate-400" size={18} />
      </div>
      <input
        type="url"
        bind:value={url}
        on:keydown={handleKeydown}
        placeholder="https://example.com/resource"
        class="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm
          {error ? 'border-red-300 focus:ring-red-500' : ''}"
        {disabled}
      />
    </div>

    <input
      type="text"
      bind:value={title}
      on:keydown={handleKeydown}
      placeholder="Title (optional)"
      class="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
      {disabled}
    />
  </div>

  <div class="flex items-center justify-between">
    {#if error}
      <div class="flex items-center gap-2 text-sm text-red-600">
        <AlertCircle size={16} />
        <span>{error}</span>
      </div>
    {:else}
      <p class="text-xs text-slate-400">
        Add any external URL as a reference
      </p>
    {/if}

    <button
      type="button"
      on:click={handleSubmit}
      disabled={disabled || !isValid}
      class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
    >
      <Plus size={18} />
      Add
    </button>
  </div>
</div>

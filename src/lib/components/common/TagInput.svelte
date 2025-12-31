<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { X, Plus } from 'lucide-svelte';

  export let tags: string[] = [];
  export let placeholder = 'Add tag...';
  export let maxTags = 10;
  export let suggestions: string[] = [];
  export let disabled = false;

  const dispatch = createEventDispatcher<{
    change: string[];
  }>();

  let inputValue = '';
  let showSuggestions = false;
  let inputElement: HTMLInputElement;

  $: filteredSuggestions = suggestions
    .filter(s => s.toLowerCase().includes(inputValue.toLowerCase()))
    .filter(s => !tags.includes(s))
    .slice(0, 5);

  function addTag(tag: string) {
    const trimmed = tag.trim().toLowerCase();
    if (trimmed && !tags.includes(trimmed) && tags.length < maxTags) {
      tags = [...tags, trimmed];
      dispatch('change', tags);
    }
    inputValue = '';
    showSuggestions = false;
  }

  function removeTag(tag: string) {
    tags = tags.filter(t => t !== tag);
    dispatch('change', tags);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (inputValue.trim()) {
        addTag(inputValue);
      }
    } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    } else if (e.key === 'Escape') {
      showSuggestions = false;
    }
  }

  function handleBlur() {
    setTimeout(() => {
      showSuggestions = false;
      if (inputValue.trim()) {
        addTag(inputValue);
      }
    }, 150);
  }

  const tagColors = [
    'bg-blue-100 text-blue-700',
    'bg-green-100 text-green-700',
    'bg-purple-100 text-purple-700',
    'bg-amber-100 text-amber-700',
    'bg-pink-100 text-pink-700',
    'bg-cyan-100 text-cyan-700',
    'bg-orange-100 text-orange-700',
    'bg-indigo-100 text-indigo-700',
  ];

  function getTagColor(tag: string): string {
    const hash = tag.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return tagColors[hash % tagColors.length];
  }
</script>

<div class="w-full">
  <div class="flex flex-wrap gap-2 p-2 min-h-[42px] border border-slate-200 rounded-lg focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-transparent bg-white {disabled ? 'opacity-50 cursor-not-allowed' : ''}">
    {#each tags as tag}
      <span class="inline-flex items-center gap-1 px-2 py-1 rounded-md text-sm font-medium {getTagColor(tag)}">
        {tag}
        {#if !disabled}
          <button
            type="button"
            on:click={() => removeTag(tag)}
            class="hover:bg-black/10 rounded p-0.5 transition-colors"
          >
            <X size={12} />
          </button>
        {/if}
      </span>
    {/each}

    {#if tags.length < maxTags && !disabled}
      <div class="relative flex-1 min-w-[100px]">
        <input
          bind:this={inputElement}
          bind:value={inputValue}
          on:keydown={handleKeydown}
          on:focus={() => showSuggestions = true}
          on:blur={handleBlur}
          {placeholder}
          {disabled}
          class="w-full bg-transparent border-none outline-none text-sm text-slate-700 placeholder:text-slate-400"
        />

        {#if showSuggestions && filteredSuggestions.length > 0}
          <div class="absolute top-full left-0 mt-1 w-48 bg-white border border-slate-200 rounded-lg shadow-lg z-10">
            {#each filteredSuggestions as suggestion}
              <button
                type="button"
                on:mousedown|preventDefault={() => addTag(suggestion)}
                class="w-full px-3 py-2 text-left text-sm hover:bg-slate-50 first:rounded-t-lg last:rounded-b-lg"
              >
                {suggestion}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  </div>

  {#if tags.length >= maxTags}
    <p class="mt-1 text-xs text-slate-500">Maximum {maxTags} tags allowed</p>
  {/if}
</div>

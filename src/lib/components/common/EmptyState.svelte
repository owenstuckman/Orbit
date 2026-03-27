<script lang="ts">
  import { Inbox } from 'lucide-svelte';

  export let title: string = 'Nothing here yet';
  export let description: string = '';
  export let icon: typeof Inbox = Inbox;
  export let actionLabel: string = '';
  export let actionHref: string = '';

  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();
</script>

<div class="flex flex-col items-center justify-center py-12 text-center">
  <div class="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mb-4">
    <svelte:component this={icon} size={24} class="text-slate-400 dark:text-slate-500" />
  </div>
  <h3 class="text-base font-medium text-slate-900 dark:text-white mb-1">{title}</h3>
  {#if description}
    <p class="text-sm text-slate-500 dark:text-slate-400 max-w-sm">{description}</p>
  {/if}
  {#if actionLabel}
    {#if actionHref}
      <a href={actionHref} class="mt-4 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors">
        {actionLabel}
      </a>
    {:else}
      <button
        on:click={() => dispatch('action')}
        class="mt-4 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
      >
        {actionLabel}
      </button>
    {/if}
  {/if}
</div>

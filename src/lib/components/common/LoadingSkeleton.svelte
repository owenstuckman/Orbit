<script lang="ts">
  export let rows: number = 3;
  export let type: 'card' | 'table' | 'list' = 'list';
</script>

{#if type === 'card'}
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    {#each Array(rows) as _}
      <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 animate-pulse">
        <div class="h-4 bg-slate-200 dark:bg-slate-700 rounded w-3/4 mb-3"></div>
        <div class="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/2 mb-4"></div>
        <div class="flex gap-2">
          <div class="h-6 bg-slate-200 dark:bg-slate-700 rounded-full w-16"></div>
          <div class="h-6 bg-slate-200 dark:bg-slate-700 rounded-full w-12"></div>
        </div>
      </div>
    {/each}
  </div>
{:else if type === 'table'}
  <div class="space-y-3 animate-pulse">
    {#each Array(rows) as _}
      <div class="flex items-center gap-4 px-4 py-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
        <div class="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/4"></div>
        <div class="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/3"></div>
        <div class="h-4 bg-slate-200 dark:bg-slate-700 rounded w-16 ml-auto"></div>
      </div>
    {/each}
  </div>
{:else}
  <div class="space-y-2 animate-pulse">
    {#each Array(rows) as _}
      <div class="flex items-center gap-3 py-2">
        <div class="w-8 h-8 bg-slate-200 dark:bg-slate-700 rounded-full"></div>
        <div class="flex-1">
          <div class="h-4 bg-slate-200 dark:bg-slate-700 rounded w-2/3 mb-1"></div>
          <div class="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/3"></div>
        </div>
      </div>
    {/each}
  </div>
{/if}

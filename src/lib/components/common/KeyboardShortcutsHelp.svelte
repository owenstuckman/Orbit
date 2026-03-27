<!--
  @component KeyboardShortcutsHelp
  Modal showing available keyboard shortcuts. Toggled with '?'.
-->
<script lang="ts">
  export let show = false;

  const shortcuts = [
    { category: 'Navigation', items: [
      { keys: ['←', '→'], description: 'Move between board columns' },
      { keys: ['↑', '↓'], description: 'Move between tasks in a column' },
      { keys: ['Enter'], description: 'Open selected task' },
      { keys: ['Escape'], description: 'Deselect / close modal' },
    ]},
    { category: 'Actions', items: [
      { keys: ['n'], description: 'New task (PM/Admin)' },
      { keys: ['/'], description: 'Focus search' },
      { keys: ['f'], description: 'Toggle filters panel' },
      { keys: ['r'], description: 'Refresh tasks' },
      { keys: ['b'], description: 'Toggle board/list view' },
      { keys: ['a'], description: 'Accept selected task (Employee)' },
    ]},
    { category: 'Global', items: [
      { keys: ['?'], description: 'Show keyboard shortcuts' },
      { keys: ['g', 'd'], description: 'Go to Dashboard' },
      { keys: ['g', 't'], description: 'Go to Tasks' },
      { keys: ['g', 'p'], description: 'Go to Projects' },
      { keys: ['g', 's'], description: 'Go to Settings' },
    ]},
  ];
</script>

{#if show}
  <div class="fixed inset-0 z-[100] flex items-center justify-center">
    <button
      class="absolute inset-0 bg-black/50"
      on:click={() => show = false}
      aria-label="Close"
      tabindex="-1"
    />
    <div class="relative bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto">
      <div class="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
        <h2 class="text-lg font-semibold text-slate-900 dark:text-white">Keyboard Shortcuts</h2>
        <button
          on:click={() => show = false}
          class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
        >
          <span class="text-xl">&times;</span>
        </button>
      </div>
      <div class="p-6 space-y-6">
        {#each shortcuts as group}
          <div>
            <h3 class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
              {group.category}
            </h3>
            <div class="space-y-2">
              {#each group.items as shortcut}
                <div class="flex items-center justify-between">
                  <span class="text-sm text-slate-700 dark:text-slate-300">{shortcut.description}</span>
                  <div class="flex items-center gap-1">
                    {#each shortcut.keys as key, i}
                      {#if i > 0}
                        <span class="text-slate-400 text-xs">then</span>
                      {/if}
                      <kbd class="px-2 py-1 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded text-xs font-mono text-slate-700 dark:text-slate-300 min-w-[24px] text-center">
                        {key}
                      </kbd>
                    {/each}
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </div>
  </div>
{/if}

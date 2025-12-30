<script lang="ts">
  import { Download, FileSpreadsheet, FileText, ChevronDown } from 'lucide-svelte';

  export let onExport: (format: 'csv' | 'pdf' | 'json') => void;
  export let disabled = false;
  export let showJson = false;
  export let size: 'sm' | 'md' = 'md';

  let isOpen = false;

  function handleExport(format: 'csv' | 'pdf' | 'json') {
    onExport(format);
    isOpen = false;
  }

  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.export-dropdown')) {
      isOpen = false;
    }
  }

  $: buttonClasses = size === 'sm'
    ? 'px-3 py-1.5 text-sm'
    : 'px-4 py-2';
</script>

<svelte:window on:click={handleClickOutside} />

<div class="export-dropdown relative inline-block">
  <button
    on:click|stopPropagation={() => isOpen = !isOpen}
    {disabled}
    class="inline-flex items-center gap-2 {buttonClasses} bg-white border border-slate-300 rounded-lg font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
  >
    <Download size={size === 'sm' ? 14 : 16} />
    Export
    <ChevronDown size={size === 'sm' ? 12 : 14} class="text-slate-400" />
  </button>

  {#if isOpen}
    <div class="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-xl border border-slate-200 py-1 z-50">
      <button
        on:click|stopPropagation={() => handleExport('csv')}
        class="w-full flex items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
      >
        <FileSpreadsheet size={16} class="text-green-600" />
        Export as CSV
      </button>

      <button
        on:click|stopPropagation={() => handleExport('pdf')}
        class="w-full flex items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
      >
        <FileText size={16} class="text-red-600" />
        Export as PDF
      </button>

      {#if showJson}
        <button
          on:click|stopPropagation={() => handleExport('json')}
          class="w-full flex items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <FileText size={16} class="text-blue-600" />
          Export as JSON
        </button>
      {/if}
    </div>
  {/if}
</div>

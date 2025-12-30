<script lang="ts">
  import { Save, Clock, AlertCircle, Check } from 'lucide-svelte';

  export let artifactCount = 0;
  export let saving = false;
  export let lastSaved: string | null = null;
  export let error: string | null = null;

  function formatTime(isoString: string): string {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
</script>

<div class="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-3">
      <div class="flex items-center gap-2 text-sm font-medium text-slate-700">
        <Save size={16} />
        <span>Draft</span>
      </div>

      {#if artifactCount > 0}
        <span class="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs font-medium rounded-full">
          {artifactCount} artifact{artifactCount !== 1 ? 's' : ''}
        </span>
      {/if}
    </div>

    <div class="flex items-center gap-2 text-xs">
      {#if error}
        <span class="flex items-center gap-1 text-red-600">
          <AlertCircle size={12} />
          {error}
        </span>
      {:else if saving}
        <span class="flex items-center gap-1 text-slate-500">
          <div class="w-3 h-3 border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin"></div>
          Saving...
        </span>
      {:else if lastSaved}
        <span class="flex items-center gap-1 text-green-600">
          <Check size={12} />
          Saved at {formatTime(lastSaved)}
        </span>
      {:else}
        <span class="flex items-center gap-1 text-slate-400">
          <Clock size={12} />
          Not saved yet
        </span>
      {/if}
    </div>
  </div>
</div>

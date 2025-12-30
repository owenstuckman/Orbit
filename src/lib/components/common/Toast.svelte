<script lang="ts">
  import { fly } from 'svelte/transition';
  import { toasts, type Toast } from '$lib/stores/notifications';
  import {
    CheckCircle,
    XCircle,
    AlertTriangle,
    Info,
    X
  } from 'lucide-svelte';

  function getToastStyles(type: Toast['type']): { bg: string; icon: typeof CheckCircle } {
    switch (type) {
      case 'success': return { bg: 'bg-green-50 border-green-200 text-green-800', icon: CheckCircle };
      case 'error': return { bg: 'bg-red-50 border-red-200 text-red-800', icon: XCircle };
      case 'warning': return { bg: 'bg-amber-50 border-amber-200 text-amber-800', icon: AlertTriangle };
      case 'info': return { bg: 'bg-blue-50 border-blue-200 text-blue-800', icon: Info };
    }
  }

  function getIconColor(type: Toast['type']): string {
    switch (type) {
      case 'success': return 'text-green-500';
      case 'error': return 'text-red-500';
      case 'warning': return 'text-amber-500';
      case 'info': return 'text-blue-500';
    }
  }
</script>

<div class="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
  {#each $toasts as toast (toast.id)}
    {@const styles = getToastStyles(toast.type)}
    <div
      class="flex items-center gap-3 p-4 rounded-lg border shadow-lg {styles.bg}"
      transition:fly={{ y: 50, duration: 300 }}
    >
      <svelte:component this={styles.icon} class={getIconColor(toast.type)} size={20} />
      <p class="flex-1 text-sm font-medium">{toast.message}</p>
      <button
        on:click={() => toasts.remove(toast.id)}
        class="text-slate-400 hover:text-slate-600 transition-colors"
      >
        <X size={16} />
      </button>
    </div>
  {/each}
</div>

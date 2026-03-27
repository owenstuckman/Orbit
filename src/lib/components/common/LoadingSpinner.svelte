<script lang="ts">
  export let size: 'sm' | 'md' | 'lg' = 'md';
  export let message: string = '';

  const sizes = {
    sm: 'w-6 h-6 border-2',
    md: 'w-8 h-8 border-3',
    lg: 'w-10 h-10 border-4'
  };
</script>

<div class="flex flex-col items-center justify-center py-12 gap-3">
  <div class="{sizes[size]} border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
  {#if message}
    <p class="text-sm text-slate-500 dark:text-slate-400">{message}</p>
  {/if}
</div>

<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { auth } from '$lib/stores/auth';

  let ready = false;

  onMount(async () => {
    await auth.initialize();
    ready = true;
  });
</script>

{#if ready}
  <slot />
{:else}
  <!-- Initial loading state while auth initializes -->
  <div class="min-h-screen flex items-center justify-center bg-slate-50">
    <div class="flex flex-col items-center gap-4">
      <div class="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
    </div>
  </div>
{/if}

<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { auth } from '$lib/stores/auth';
  import { ParaglideJS } from '@inlang/paraglide-sveltekit';
  import { i18n } from '$lib/i18n';
  import { initializeLocale, LOCALE_STORAGE_KEY, SUPPORTED_LOCALES } from '$lib/stores/locale';

  let ready = false;

  onMount(async () => {
    // Apply persisted locale immediately (before auth, for login/register pages)
    try {
      const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
      if (stored && SUPPORTED_LOCALES.includes(stored)) {
        initializeLocale(stored, null);
      }
    } catch {
      // Ignore storage errors
    }

    await auth.initialize();
    ready = true;
  });
</script>

<ParaglideJS {i18n}>
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
</ParaglideJS>

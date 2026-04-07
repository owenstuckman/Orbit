<script lang="ts">
  import { onMount } from 'svelte';
  import { languageTag, onSetLanguageTag } from '$lib/paraglide/runtime.js';

  let lang = languageTag();

  onMount(() => {
    onSetLanguageTag((newTag) => {
      lang = newTag as string;
    });
  });
</script>

{#key lang}
  <slot />
{/key}

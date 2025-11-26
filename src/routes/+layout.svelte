<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { auth, user, organization } from '$lib/stores/auth';

  onMount(async () => {
    await auth.initialize();
  });
</script>

<slot />

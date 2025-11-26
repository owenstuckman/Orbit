<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { supabase } from '$lib/services/supabase';

  let checking = true;

  onMount(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session) {
      goto('/dashboard');
    } else {
      goto('/auth/login');
    }
  });
</script>

<div class="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-900 to-purple-900 flex items-center justify-center">
  <div class="flex flex-col items-center gap-4">
    <div class="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/25 animate-pulse">
      <span class="text-white font-bold text-3xl">O</span>
    </div>
    <div class="w-8 h-8 border-3 border-indigo-400 border-t-transparent rounded-full animate-spin"></div>
  </div>
</div>

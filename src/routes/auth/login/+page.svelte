<script lang="ts">
  import { goto } from '$app/navigation';
  import { auth, user, organization } from '$lib/stores/auth';
  import { supabase } from '$lib/services/supabase';
  import { Mail, Lock, ArrowRight, AlertCircle } from 'lucide-svelte';

  let email = '';
  let password = '';
  let loading = false;
  let error = '';

  async function handleLogin(e: Event) {
    e.preventDefault();
    
    if (!email || !password) {
      error = 'Please enter both email and password';
      return;
    }

    loading = true;
    error = '';

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (authError) {
        error = authError.message;
        return;
      }

      // Clear any redirect loop tracking from previous attempts
      try {
        sessionStorage.removeItem('orbit_auth_redirect_count');
      } catch {
        // Ignore storage errors
      }

      // Get the auth user to check profile
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        error = 'Authentication failed. Please try again.';
        return;
      }

      // Check if user profile exists
      const { data: existingProfile } = await supabase
        .from('users')
        .select('id, org_id')
        .eq('auth_id', authUser.id)
        .maybeSingle();

      if (!existingProfile) {
        goto('/auth/complete-registration', { replaceState: true });
        return;
      }

      const loadedUser = await user.load();

      if (!loadedUser) {
        error = 'Failed to load your profile. Please try again or contact support.';
        return;
      }

      // Load organization
      await organization.load();

      // Redirect to dashboard
      goto('/dashboard', { replaceState: true });
    } catch (err) {
      error = err instanceof Error ? err.message : 'An error occurred';
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>Sign In - Orbit</title>
</svelte:head>

<div class="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-900 to-purple-900 flex items-center justify-center p-4">
  <!-- Background decoration -->
  <div class="absolute inset-0 overflow-hidden">
    <div class="absolute -top-1/2 -right-1/4 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl"></div>
    <div class="absolute -bottom-1/4 -left-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl"></div>
  </div>

  <div class="relative w-full max-w-md">
    <!-- Logo -->
    <div class="text-center mb-8">
      <div class="inline-flex items-center gap-3 mb-4">
        <div class="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/25">
          <span class="text-white font-bold text-2xl">O</span>
        </div>
        <span class="text-white font-bold text-3xl tracking-tight">Orbit</span>
      </div>
      <p class="text-indigo-200">Sign in to your workspace</p>
    </div>

    <!-- Login Card -->
    <div class="bg-white/10 backdrop-blur-lg rounded-2xl p-8 shadow-2xl border border-white/10">
      <form on:submit={handleLogin} class="space-y-6">
        <!-- Error message -->
        {#if error}
          <div class="bg-red-500/20 border border-red-500/50 rounded-lg p-4 flex items-center gap-3">
            <AlertCircle class="text-red-400 flex-shrink-0" size={20} />
            <p class="text-red-200 text-sm">{error}</p>
          </div>
        {/if}

        <!-- Email -->
        <div>
          <label class="block text-sm font-medium text-indigo-200 mb-2" for="email">
            Email address
          </label>
          <div class="relative">
            <Mail class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              id="email"
              type="email"
              bind:value={email}
              placeholder="you@company.com"
              class="w-full pl-12 pr-4 py-3 bg-white/10 border border-white/10 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              required
            />
          </div>
        </div>

        <!-- Password -->
        <div>
          <label class="block text-sm font-medium text-indigo-200 mb-2" for="password">
            Password
          </label>
          <div class="relative">
            <Lock class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              id="password"
              type="password"
              bind:value={password}
              placeholder="••••••••"
              class="w-full pl-12 pr-4 py-3 bg-white/10 border border-white/10 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              required
            />
          </div>
        </div>

        <!-- Forgot password -->
        <div class="flex justify-end">
          <a href="/auth/reset-password" class="text-sm text-indigo-300 hover:text-indigo-200 transition-colors">
            Forgot password?
          </a>
        </div>

        <!-- Submit -->
        <button
          type="submit"
          disabled={loading}
          class="w-full py-3 px-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-xl hover:from-indigo-500 hover:to-purple-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-900 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {#if loading}
            <div class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            Signing in...
          {:else}
            Sign in
            <ArrowRight size={18} />
          {/if}
        </button>
      </form>

      <!-- Divider -->
      <div class="relative my-8">
        <div class="absolute inset-0 flex items-center">
          <div class="w-full border-t border-white/10"></div>
        </div>
        <div class="relative flex justify-center text-sm">
          <span class="px-4 bg-transparent text-slate-400">New to Orbit?</span>
        </div>
      </div>

      <!-- Register link -->
      <a
        href="/auth/register"
        class="block w-full py-3 px-4 text-center text-indigo-300 font-medium border border-indigo-500/50 rounded-xl hover:bg-indigo-500/10 transition-colors"
      >
        Create an account
      </a>
    </div>

    <!-- Footer -->
    <p class="mt-8 text-center text-sm text-slate-400">
      By signing in, you agree to our
      <a href="/terms" class="text-indigo-300 hover:text-indigo-200">Terms of Service</a>
      and
      <a href="/privacy" class="text-indigo-300 hover:text-indigo-200">Privacy Policy</a>
    </p>
  </div>
</div>

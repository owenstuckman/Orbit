<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { auth, user, organization } from '$lib/stores/auth';
  import { supabase } from '$lib/services/supabase';
  import { Mail, Lock, ArrowRight, AlertCircle, Fingerprint } from 'lucide-svelte';
  import * as m from '$lib/paraglide/messages.js';

  let email = '';
  let password = '';
  let loading = false;
  let error = '';

  // Biometric state
  let biometricAvailable = false;
  let biometricLoading = false;
  let offerBiometricEnroll = false;
  let enrollingBiometrics = false;

  onMount(async () => {
    // 1. Check if biometrics are available on this device
    const { checkBiometricAvailability, authenticateWithBiometrics, isBiometricEnrolled } =
      await import('$lib/services/capacitor');

    const availability = await checkBiometricAvailability();
    if (availability !== 'available') return;

    const enrolled = await isBiometricEnrolled();

    if (enrolled) {
      // Auto-attempt biometric on page load if already enrolled
      biometricLoading = true;
      try {
        const session = await authenticateWithBiometrics();
        if (session) {
          await finishLogin();
          return;
        }
      } finally {
        biometricLoading = false;
      }
    } else {
      // Show biometric button (user can opt in after password login)
      biometricAvailable = true;
    }
  });

  async function finishLogin() {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) { error = m.authentication_failed(); return; }

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
    if (!loadedUser) { error = m.failed_to_load_profile(); return; }
    await organization.load();
    goto('/dashboard', { replaceState: true });
  }

  async function handleLogin(e: Event) {
    e.preventDefault();

    if (!email || !password) {
      error = m.please_enter_email_password();
      return;
    }

    loading = true;
    error = '';

    try {
      const { data: signInData, error: authError } = await supabase.auth.signInWithPassword({
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

      // Update stored biometric tokens with fresh session
      if (signInData.session) {
        const { initializeBiometrics } = await import('$lib/services/capacitor');
        await initializeBiometrics(signInData.session);
      }

      // If biometrics available but not enrolled, offer enrollment before redirect
      if (biometricAvailable && signInData.session) {
        offerBiometricEnroll = true;
        loading = false;
        return; // will redirect after user responds
      }

      await finishLogin();
    } catch (err) {
      error = err instanceof Error ? err.message : 'An error occurred';
    } finally {
      loading = false;
    }
  }

  async function handleEnrollBiometrics() {
    enrollingBiometrics = true;
    try {
      const { enrollBiometrics } = await import('$lib/services/capacitor');
      const { data: { session } } = await supabase.auth.getSession();
      if (session) await enrollBiometrics(session);
    } finally {
      enrollingBiometrics = false;
    }
    offerBiometricEnroll = false;
    await finishLogin();
  }
</script>

<svelte:head>
  <title>{m.sign_in_title()}</title>
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
      <p class="text-indigo-200">{m.sign_in_to_workspace()}</p>
    </div>

    <!-- Biometric loading overlay -->
    {#if biometricLoading}
      <div class="bg-white/10 backdrop-blur-lg rounded-2xl p-8 shadow-2xl border border-white/10 text-center">
        <Fingerprint class="mx-auto text-indigo-300 mb-4 animate-pulse" size={48} />
        <p class="text-white font-medium">{m.authenticating()}</p>
        <p class="text-indigo-200 text-sm mt-1">{m.use_face_id_or_fingerprint()}</p>
      </div>
    {/if}

    <!-- Biometric enroll offer -->
    {#if offerBiometricEnroll}
      <div class="bg-white/10 backdrop-blur-lg rounded-2xl p-8 shadow-2xl border border-white/10 text-center space-y-4">
        <Fingerprint class="mx-auto text-indigo-300 mb-2" size={40} />
        <h3 class="text-white font-semibold text-lg">{m.enable_biometric_login()}</h3>
        <p class="text-indigo-200 text-sm">{m.enable_biometric_faster()}</p>
        <button
          on:click={handleEnrollBiometrics}
          disabled={enrollingBiometrics}
          class="w-full py-3 px-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-xl hover:from-indigo-500 hover:to-purple-500 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {#if enrollingBiometrics}
            <div class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
          {:else}
            <Fingerprint size={18} />
          {/if}
          Enable Biometrics
        </button>
        <button
          on:click={async () => { offerBiometricEnroll = false; await finishLogin(); }}
          class="w-full py-2 text-indigo-300 hover:text-indigo-200 text-sm transition-colors"
        >
          Skip for now
        </button>
      </div>
    {/if}

    <!-- Login Card -->
    <div class="bg-white/10 backdrop-blur-lg rounded-2xl p-8 shadow-2xl border border-white/10" class:hidden={biometricLoading || offerBiometricEnroll}>
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

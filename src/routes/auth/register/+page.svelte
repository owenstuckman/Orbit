<script lang="ts">
  import { goto } from '$app/navigation';
  import { supabase } from '$lib/services/supabase';
  import { Mail, Lock, ArrowRight, AlertCircle, Check, ArrowLeft } from 'lucide-svelte';

  let email = '';
  let password = '';
  let confirmPassword = '';
  let loading = false;
  let error = '';
  let success = false;

  // Password validation
  $: passwordValid = password.length >= 8;
  $: passwordMatch = password === confirmPassword && confirmPassword.length > 0;
  $: emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  async function handleRegister(e: Event) {
    e.preventDefault();
    
    if (!emailValid) {
      error = 'Please enter a valid email address';
      return;
    }
    
    if (!passwordValid) {
      error = 'Password must be at least 8 characters';
      return;
    }
    
    if (!passwordMatch) {
      error = 'Passwords do not match';
      return;
    }

    loading = true;
    error = '';

    try {
      // Sign up with Supabase Auth - redirects to complete-registration after email confirm
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/complete-registration`
        }
      });

      if (authError) {
        error = authError.message;
        return;
      }

      if (!authData.user) {
        error = 'Failed to create account';
        return;
      }

      console.log('[Register] Auth user created, confirmation email sent');
      success = true;

    } catch (err) {
      console.error('[Register] Unexpected error:', err);
      error = err instanceof Error ? err.message : 'An error occurred';
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>Create Account - Orbit</title>
</svelte:head>

<div class="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-900 to-purple-900 flex items-center justify-center p-4">
  <!-- Background decoration -->
  <div class="absolute inset-0 overflow-hidden">
    <div class="absolute -top-1/2 -right-1/4 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl"></div>
    <div class="absolute -bottom-1/4 -left-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl"></div>
  </div>

  <div class="relative w-full max-w-md">
    <!-- Back link -->
    <a 
      href="/auth/login" 
      class="inline-flex items-center gap-2 text-indigo-300 hover:text-indigo-200 mb-6 transition-colors"
    >
      <ArrowLeft size={18} />
      Back to sign in
    </a>

    <!-- Logo -->
    <div class="text-center mb-8">
      <div class="inline-flex items-center gap-3 mb-4">
        <div class="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/25">
          <span class="text-white font-bold text-2xl">O</span>
        </div>
        <span class="text-white font-bold text-3xl tracking-tight">Orbit</span>
      </div>
      <p class="text-indigo-200">Create your account</p>
    </div>

    <!-- Registration Card -->
    <div class="bg-white/10 backdrop-blur-lg rounded-2xl p-8 shadow-2xl border border-white/10">
      {#if success}
        <!-- Success / Email confirmation -->
        <div class="text-center py-4">
          <div class="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check class="text-green-400" size={32} />
          </div>
          <h2 class="text-xl font-semibold text-white mb-2">Check your email</h2>
          <p class="text-indigo-200 mb-4">
            We've sent a confirmation link to <strong class="text-white">{email}</strong>
          </p>
          <p class="text-sm text-slate-400 mb-6">
            Click the link in the email to verify your account and complete your registration.
          </p>
          <div class="bg-indigo-500/20 rounded-lg p-4 text-left">
            <p class="text-sm text-indigo-200">
              <strong class="text-white">What happens next?</strong><br />
              After confirming your email, you'll be asked to set up your profile and organization.
            </p>
          </div>
        </div>
      {:else}
        <form on:submit={handleRegister} class="space-y-6">
          <!-- Error message -->
          {#if error}
            <div class="bg-red-500/20 border border-red-500/50 rounded-lg p-4 flex items-center gap-3">
              <AlertCircle class="text-red-400 flex-shrink-0" size={20} />
              <p class="text-red-200 text-sm">{error}</p>
            </div>
          {/if}

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
            {#if email && !emailValid}
              <p class="mt-1 text-xs text-red-400">Please enter a valid email</p>
            {/if}
          </div>

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
            <div class="mt-2 flex items-center gap-2">
              <div class="flex-1 h-1 rounded-full bg-white/20 overflow-hidden">
                <div 
                  class="h-full transition-all duration-300 {password.length >= 12 ? 'bg-green-500 w-full' : password.length >= 8 ? 'bg-yellow-500 w-2/3' : password.length >= 4 ? 'bg-red-500 w-1/3' : 'w-0'}"
                ></div>
              </div>
              <span class="text-xs {passwordValid ? 'text-green-400' : 'text-slate-400'}">
                {passwordValid ? 'Strong' : 'Min 8 chars'}
              </span>
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-indigo-200 mb-2" for="confirmPassword">
              Confirm password
            </label>
            <div class="relative">
              <Lock class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                id="confirmPassword"
                type="password"
                bind:value={confirmPassword}
                placeholder="••••••••"
                class="w-full pl-12 pr-4 py-3 bg-white/10 border border-white/10 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                required
              />
            </div>
            {#if confirmPassword && !passwordMatch}
              <p class="mt-1 text-xs text-red-400">Passwords do not match</p>
            {:else if passwordMatch}
              <p class="mt-1 text-xs text-green-400">Passwords match</p>
            {/if}
          </div>

          <button
            type="submit"
            disabled={loading || !emailValid || !passwordValid || !passwordMatch}
            class="w-full py-3 px-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-xl hover:from-indigo-500 hover:to-purple-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-900 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {#if loading}
              <div class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              Creating account...
            {:else}
              Create account
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
            <span class="px-4 bg-transparent text-slate-400">Already have an account?</span>
          </div>
        </div>

        <!-- Login link -->
        <a
          href="/auth/login"
          class="block w-full py-3 px-4 text-center text-indigo-300 font-medium border border-indigo-500/50 rounded-xl hover:bg-indigo-500/10 transition-colors"
        >
          Sign in instead
        </a>
      {/if}
    </div>

    <!-- Footer -->
    <p class="mt-8 text-center text-sm text-slate-400">
      By creating an account, you agree to our
      <a href="/terms" class="text-indigo-300 hover:text-indigo-200">Terms of Service</a>
      and
      <a href="/privacy" class="text-indigo-300 hover:text-indigo-200">Privacy Policy</a>
    </p>
  </div>
</div>
<script lang="ts">
  import { supabase } from '$lib/services/supabase';
  import { Mail, ArrowLeft, AlertCircle, Check } from 'lucide-svelte';

  let email = '';
  let loading = false;
  let error = '';
  let success = false;

  $: emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  async function handleReset(e: Event) {
    e.preventDefault();
    
    if (!emailValid) {
      error = 'Please enter a valid email address';
      return;
    }

    loading = true;
    error = '';

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/update-password`
      });

      if (resetError) {
        error = resetError.message;
        return;
      }

      success = true;
    } catch (err) {
      error = err instanceof Error ? err.message : 'An error occurred';
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>Reset Password - Orbit</title>
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
      class="inline-flex items-center gap-2 text-indigo-300 hover:text-indigo-200 mb-8 transition-colors"
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
      <p class="text-indigo-200">Reset your password</p>
    </div>

    <!-- Reset Card -->
    <div class="bg-white/10 backdrop-blur-lg rounded-2xl p-8 shadow-2xl border border-white/10">
      {#if success}
        <!-- Success message -->
        <div class="text-center py-4">
          <div class="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check class="text-green-400" size={32} />
          </div>
          <h2 class="text-xl font-semibold text-white mb-2">Check your email</h2>
          <p class="text-indigo-200 mb-6">
            We've sent a password reset link to <strong class="text-white">{email}</strong>. 
            Click the link in the email to reset your password.
          </p>
          <p class="text-sm text-slate-400">
            Didn't receive the email? Check your spam folder or
            <button 
              class="text-indigo-300 hover:text-indigo-200 underline"
              on:click={() => { success = false; }}
            >
              try again
            </button>
          </p>
        </div>
      {:else}
        <form on:submit={handleReset} class="space-y-6">
          <div class="text-center mb-4">
            <p class="text-slate-300 text-sm">
              Enter your email address and we'll send you a link to reset your password.
            </p>
          </div>

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

          <!-- Submit -->
          <button
            type="submit"
            disabled={loading || !emailValid}
            class="w-full py-3 px-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-xl hover:from-indigo-500 hover:to-purple-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-900 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {#if loading}
              <div class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              Sending...
            {:else}
              Send reset link
            {/if}
          </button>
        </form>
      {/if}
    </div>
  </div>
</div>

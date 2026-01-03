<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { supabase } from '$lib/services/supabase';
  import { user as userStore, organization as orgStore, auth } from '$lib/stores/auth';
  import { guestProjectsApi } from '$lib/services/api';
  import { User, Building, ArrowRight, AlertCircle, Check, Loader, FolderInput } from 'lucide-svelte';

  let fullName = '';
  let organizationName = '';
  let organizationCode = '';
  let joinExisting = false;
  let loading = false;
  let error = '';
  let success = false;
  let checking = true;
  let authUser: { id: string; email: string } | null = null;
  let hasGuestProject = false;
  let guestProjectImported = false;
  let importingProject = false;

  onMount(async () => {
    // Check if user is authenticated
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      console.log('[CompleteReg] No authenticated user, redirecting to login');
      goto('/auth/login', { replaceState: true });
      return;
    }

    authUser = { id: user.id, email: user.email || '' };
    console.log('[CompleteReg] Auth user found:', authUser.email);

    // First, check if a user profile exists at all (simple query without joins)
    const { data: existingProfile, error: profileError } = await supabase
      .from('users')
      .select('id, org_id')
      .eq('auth_id', user.id)
      .maybeSingle();

    if (profileError) {
      console.error('[CompleteReg] Error checking profile:', profileError);
      console.error('[CompleteReg] Error code:', profileError.code, 'Details:', profileError.details, 'Hint:', profileError.hint);

      // If it's an RLS error, the user likely doesn't have a profile yet - continue to show form
      if (profileError.code === '42501' || profileError.message?.includes('permission denied') || profileError.code === 'PGRST301') {
        console.log('[CompleteReg] RLS error - user likely has no profile, showing registration form');
        // Continue to show registration form
      } else {
        error = `Error checking your account: ${profileError.message || profileError.code}`;
        checking = false;
        return;
      }
    }

    if (existingProfile) {
      console.log('[CompleteReg] User profile exists:', existingProfile.id);

      // User profile exists - try to load it fully
      const loadedUser = await userStore.load();

      if (loadedUser) {
        console.log('[CompleteReg] User profile loaded successfully, loading org...');
        const loadedOrg = await orgStore.load();

        if (loadedOrg) {
          console.log('[CompleteReg] User and org loaded, redirecting to dashboard');
          goto('/dashboard', { replaceState: true });
          return;
        }
      }

      // User exists but something failed - check if org_id is the issue
      if (!existingProfile.org_id) {
        console.log('[CompleteReg] User exists but has no org_id, showing form to join/create org');
        error = 'Your account exists but is not linked to an organization. Please join or create one.';
      } else {
        // org_id exists but org load failed - might be invalid reference
        console.log('[CompleteReg] User exists with org_id but org load failed, redirecting to dashboard to show error');
        goto('/dashboard', { replaceState: true });
        return;
      }
    }

    console.log('[CompleteReg] No user profile, showing registration form');

    // Check if there's a pending guest project to import
    const importPending = localStorage.getItem('orbit_import_pending');
    if (importPending) {
      const guestProject = await guestProjectsApi.getCurrent();
      if (guestProject && guestProject.tasks.length > 0) {
        hasGuestProject = true;
        console.log('[CompleteReg] Guest project found with', guestProject.tasks.length, 'tasks');
      }
    }

    checking = false;
  });

  async function handleComplete(e: Event) {
    e.preventDefault();
    
    if (!authUser) {
      error = 'Not authenticated. Please try again.';
      return;
    }

    if (!fullName.trim()) {
      error = 'Please enter your full name';
      return;
    }

    if (!joinExisting && !organizationName.trim()) {
      error = 'Please enter your organization name';
      return;
    }

    if (joinExisting && !organizationCode.trim()) {
      error = 'Please enter your organization code';
      return;
    }

    loading = true;
    error = '';

    try {
      let regResult;
      let regError;

      if (joinExisting) {
        // Join an existing organization with invite code
        const result = await supabase.rpc('accept_organization_invite', {
          p_auth_id: authUser.id,
          p_email: authUser.email,
          p_full_name: fullName,
          p_invite_code: organizationCode.trim().toUpperCase()
        });
        regResult = result.data;
        regError = result.error;
      } else {
        // Create a new organization
        const result = await supabase.rpc('register_user_and_org', {
          p_auth_id: authUser.id,
          p_email: authUser.email,
          p_full_name: fullName,
          p_org_name: organizationName
        });
        regResult = result.data;
        regError = result.error;
      }

      console.log('[CompleteReg] Registration result:', regResult, regError);

      if (regError) {
        error = regError.message || 'Registration failed';
        console.error('Registration error:', regError);
        return;
      }

      if (!regResult?.success) {
        error = regResult?.error || 'Failed to complete registration';
        console.error('Registration failed:', regResult);
        return;
      }

      console.log('[CompleteReg] Registration successful!');
      success = true;

      // Clear any redirect loop tracking
      try {
        sessionStorage.removeItem('orbit_auth_redirect_count');
      } catch {
        // Ignore storage errors
      }

      // Load user and org into stores
      await userStore.load();
      await orgStore.load();

      // Import guest project if available
      if (hasGuestProject && regResult.org_id) {
        importingProject = true;
        console.log('[CompleteReg] Importing guest project...');

        const importResult = await guestProjectsApi.importToOrganization(regResult.org_id);

        if (importResult.success) {
          guestProjectImported = true;
          console.log('[CompleteReg] Guest project imported:', importResult.project_id);
        } else {
          console.error('[CompleteReg] Failed to import guest project:', importResult.error);
        }

        // Clear the import pending flag
        localStorage.removeItem('orbit_import_pending');
        importingProject = false;
      }

      // Redirect to dashboard after short delay
      setTimeout(() => goto('/dashboard', { replaceState: true }), hasGuestProject ? 2500 : 1500);

    } catch (err) {
      console.error('[CompleteReg] Unexpected error:', err);
      error = err instanceof Error ? err.message : 'An error occurred';
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>Complete Registration - Orbit</title>
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
      <p class="text-indigo-200">Complete your registration</p>
    </div>

    <!-- Card -->
    <div class="bg-white/10 backdrop-blur-lg rounded-2xl p-8 shadow-2xl border border-white/10">
      {#if checking}
        <!-- Loading state -->
        <div class="text-center py-8">
          <Loader class="animate-spin text-indigo-400 mx-auto mb-4" size={32} />
          <p class="text-indigo-200">Verifying your account...</p>
        </div>
      {:else if success}
        <!-- Success message -->
        <div class="text-center py-4">
          <div class="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check class="text-green-400" size={32} />
          </div>
          <h2 class="text-xl font-semibold text-white mb-2">Welcome to Orbit!</h2>
          <p class="text-indigo-200 mb-4">
            Your account is ready. Redirecting to your dashboard...
          </p>

          {#if hasGuestProject}
            <div class="bg-indigo-500/20 rounded-lg p-4 mb-4">
              {#if importingProject}
                <div class="flex items-center justify-center gap-2 text-indigo-200">
                  <div class="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></div>
                  <span>Importing your project...</span>
                </div>
              {:else if guestProjectImported}
                <div class="flex items-center justify-center gap-2 text-green-300">
                  <FolderInput size={18} />
                  <span>Your project has been imported!</span>
                </div>
              {:else}
                <div class="flex items-center justify-center gap-2 text-amber-300">
                  <AlertCircle size={18} />
                  <span>Could not import project</span>
                </div>
              {/if}
            </div>
          {/if}

          <div class="w-8 h-8 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin mx-auto"></div>
        </div>
      {:else}
        <!-- Email verified badge -->
        <div class="flex items-center gap-2 bg-green-500/20 text-green-300 px-4 py-2 rounded-lg mb-6">
          <Check size={18} />
          <span class="text-sm font-medium">Email verified: {authUser?.email}</span>
        </div>

        {#if hasGuestProject}
          <!-- Guest project notice -->
          <div class="flex items-center gap-2 bg-indigo-500/20 text-indigo-300 px-4 py-2 rounded-lg mb-6">
            <FolderInput size={18} />
            <span class="text-sm font-medium">Your project will be imported after setup</span>
          </div>
        {/if}

        <form on:submit={handleComplete} class="space-y-6">
          <!-- Error message -->
          {#if error}
            <div class="bg-red-500/20 border border-red-500/50 rounded-lg p-4 flex items-center gap-3">
              <AlertCircle class="text-red-400 flex-shrink-0" size={20} />
              <p class="text-red-200 text-sm">{error}</p>
            </div>
          {/if}

          <!-- Full name -->
          <div>
            <label class="block text-sm font-medium text-indigo-200 mb-2" for="fullName">
              Full name
            </label>
            <div class="relative">
              <User class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                id="fullName"
                type="text"
                bind:value={fullName}
                placeholder="John Smith"
                class="w-full pl-12 pr-4 py-3 bg-white/10 border border-white/10 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                required
              />
            </div>
          </div>

          <!-- Organization choice -->
          <div>
            <label class="block text-sm font-medium text-indigo-200 mb-2">
              Organization
            </label>
            <div class="flex gap-2 p-1 bg-white/5 rounded-xl">
              <button
                type="button"
                class="flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all {!joinExisting ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}"
                on:click={() => joinExisting = false}
              >
                Create new
              </button>
              <button
                type="button"
                class="flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all {joinExisting ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}"
                on:click={() => joinExisting = true}
              >
                Join existing
              </button>
            </div>
          </div>

          {#if !joinExisting}
            <div>
              <label class="block text-sm font-medium text-indigo-200 mb-2" for="organizationName">
                Organization name
              </label>
              <div class="relative">
                <Building class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  id="organizationName"
                  type="text"
                  bind:value={organizationName}
                  placeholder="Acme Inc."
                  class="w-full pl-12 pr-4 py-3 bg-white/10 border border-white/10 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  required={!joinExisting}
                />
              </div>
              <p class="mt-1 text-xs text-slate-400">You'll be the admin of this organization</p>
            </div>
          {:else}
            <div>
              <label class="block text-sm font-medium text-indigo-200 mb-2" for="organizationCode">
                Organization invite code
              </label>
              <div class="relative">
                <Building class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  id="organizationCode"
                  type="text"
                  bind:value={organizationCode}
                  placeholder="ABC123"
                  class="w-full pl-12 pr-4 py-3 bg-white/10 border border-white/10 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all uppercase"
                  required={joinExisting}
                />
              </div>
              <p class="mt-1 text-xs text-slate-400">Get this code from your organization admin</p>
            </div>
          {/if}

          <button
            type="submit"
            disabled={loading}
            class="w-full py-3 px-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-xl hover:from-indigo-500 hover:to-purple-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-900 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {#if loading}
              <div class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              Setting up...
            {:else}
              Complete Setup
              <ArrowRight size={18} />
            {/if}
          </button>
        </form>
      {/if}
    </div>
  </div>
</div>
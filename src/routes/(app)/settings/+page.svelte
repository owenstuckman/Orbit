<script lang="ts">
  import { user, organization, userOrganizations, currentOrgRole } from '$lib/stores/auth';
  import { formatCurrency, calculateSalaryBreakdown, projectAnnualSalary, validateR } from '$lib/utils/payout';
  import { toasts } from '$lib/stores/notifications';
  import { supabase } from '$lib/services/supabase';
  import { usersApi } from '$lib/services/api';
  import { goto } from '$app/navigation';
  import {
    User,
    DollarSign,
    Sliders,
    Bell,
    Shield,
    Save,
    Info,
    TrendingUp,
    AlertTriangle,
    X,
    Eye,
    EyeOff,
    Lock,
    Building2,
    Plus,
    Check,
    Loader
  } from 'lucide-svelte';

  // Local state for form
  let localR = $user?.r ?? $organization?.default_r ?? 0.7;

  // Slider works with percentage values (50-90) while localR is decimal (0.5-0.9)
  $: sliderValue = Math.round(localR * 100);
  let saving = false;
  let saveSuccess = false;

  // Password change state
  let showPasswordModal = false;
  let passwordForm = {
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  };
  let showCurrentPassword = false;
  let showNewPassword = false;
  let changingPassword = false;
  let passwordError = '';

  // Password validation
  $: passwordStrength = getPasswordStrength(passwordForm.newPassword);
  $: passwordsMatch = passwordForm.newPassword === passwordForm.confirmPassword;
  $: canSubmitPassword = passwordForm.currentPassword.length > 0 &&
    passwordForm.newPassword.length >= 8 &&
    passwordsMatch;

  function getPasswordStrength(password: string): { score: number; label: string; color: string } {
    if (password.length === 0) return { score: 0, label: '', color: '' };
    if (password.length < 8) return { score: 1, label: 'Too short', color: 'text-red-500' };

    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[^a-zA-Z0-9]/.test(password)) score++;

    if (score <= 2) return { score: 2, label: 'Weak', color: 'text-amber-500' };
    if (score <= 3) return { score: 3, label: 'Fair', color: 'text-yellow-500' };
    if (score <= 4) return { score: 4, label: 'Strong', color: 'text-green-500' };
    return { score: 5, label: 'Very Strong', color: 'text-green-600' };
  }

  async function handleChangePassword() {
    if (!canSubmitPassword) return;

    changingPassword = true;
    passwordError = '';

    try {
      // Supabase password update
      const { error } = await supabase.auth.updateUser({
        password: passwordForm.newPassword
      });

      if (error) throw error;

      toasts.success('Password changed successfully');
      showPasswordModal = false;
      passwordForm = { currentPassword: '', newPassword: '', confirmPassword: '' };
    } catch (error) {
      passwordError = error instanceof Error ? error.message : 'Failed to change password';
      toasts.error(passwordError);
    } finally {
      changingPassword = false;
    }
  }

  function closePasswordModal() {
    showPasswordModal = false;
    passwordForm = { currentPassword: '', newPassword: '', confirmPassword: '' };
    passwordError = '';
  }

  // Join organization state
  let showJoinOrgModal = false;
  let inviteCode = '';
  let joiningOrg = false;
  let joinError = '';
  let joinSuccess = false;
  let joinedOrgName = '';

  async function handleJoinOrganization() {
    if (!inviteCode.trim()) {
      joinError = 'Please enter an invite code';
      return;
    }

    joiningOrg = true;
    joinError = '';

    try {
      const result = await usersApi.acceptInvitation(inviteCode.trim());

      if (!result.success) {
        joinError = result.error || 'Failed to join organization';
        return;
      }

      // Reload organizations list
      await userOrganizations.load();

      // Find the org name from the memberships
      const newMembership = $userOrganizations.find(m => m.org_id === result.org_id);
      joinedOrgName = newMembership?.organization?.name || 'the organization';

      joinSuccess = true;
      inviteCode = '';
      toasts.success(`Successfully joined ${joinedOrgName}!`);

      // Close modal after brief delay
      setTimeout(() => {
        closeJoinOrgModal();
      }, 2000);

    } catch (error) {
      joinError = error instanceof Error ? error.message : 'An error occurred';
    } finally {
      joiningOrg = false;
    }
  }

  function closeJoinOrgModal() {
    showJoinOrgModal = false;
    inviteCode = '';
    joinError = '';
    joinSuccess = false;
    joinedOrgName = '';
  }

  async function handleSwitchOrg(orgId: string) {
    const success = await userOrganizations.switchOrg(orgId);
    if (success) {
      toasts.success('Switched organization');
      goto('/dashboard');
    } else {
      toasts.error('Failed to switch organization');
    }
  }

  // Calculate preview values
  $: rBounds = $organization?.r_bounds ?? { min: 0.5, max: 0.9 };
  $: validation = validateR(localR, rBounds);
  
  // Sample monthly task value for projection (could be from actual data)
  $: avgMonthlyTaskValue = 5000; // Placeholder
  
  $: salaryProjection = $user?.base_salary 
    ? projectAnnualSalary($user.base_salary, localR, avgMonthlyTaskValue)
    : null;

  $: monthlyBreakdown = $user?.base_salary
    ? calculateSalaryBreakdown($user.base_salary / 12, localR, avgMonthlyTaskValue)
    : null;

  async function handleSave() {
    if (!validation.valid) return;
    
    saving = true;
    try {
      await user.updateR(localR);
      saveSuccess = true;
      setTimeout(() => saveSuccess = false, 3000);
    } catch (error) {
      console.error('Failed to save:', error);
    } finally {
      saving = false;
    }
  }

  function getRiskLevel(r: number): { level: string; color: string; description: string } {
    if (r >= 0.8) {
      return { 
        level: 'Conservative', 
        color: 'text-green-600',
        description: 'Stable income with modest task bonuses'
      };
    }
    if (r >= 0.6) {
      return { 
        level: 'Balanced', 
        color: 'text-blue-600',
        description: 'Good mix of stability and performance rewards'
      };
    }
    return { 
      level: 'Performance-focused', 
      color: 'text-amber-600',
      description: 'Higher potential earnings, more variable income'
    };
  }

  $: riskProfile = getRiskLevel(localR);
</script>

<div class="max-w-4xl mx-auto space-y-8">
  <!-- Header -->
  <div>
    <h1 class="text-2xl font-bold text-slate-900 dark:text-white">Settings</h1>
    <p class="mt-1 text-slate-600 dark:text-slate-300">Manage your account and compensation preferences</p>
  </div>

  <!-- Profile Section -->
  <section class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
    <div class="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center gap-3">
      <User class="text-slate-400 dark:text-slate-500" size={20} />
      <h2 class="font-semibold text-slate-900 dark:text-white">Profile</h2>
    </div>
    <div class="p-6 space-y-4">
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label for="settings-fullname" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Full Name</label>
          <input
            type="text"
            id="settings-fullname"
            value={$user?.full_name || ''}
            class="w-full px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            disabled
          />
        </div>
        <div>
          <label for="settings-email" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Email</label>
          <input
            type="email"
            id="settings-email"
            value={$user?.email || ''}
            class="w-full px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white"
            disabled
          />
        </div>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label for="settings-role" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Role</label>
          <input
            type="text"
            id="settings-role"
            value={$currentOrgRole || ''}
            class="w-full px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white capitalize"
            disabled
          />
        </div>
        <div>
          <label for="settings-level" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Level</label>
          <input
            type="text"
            id="settings-level"
            value="Level {$user?.level || 1} (Training Level {$user?.training_level || 1})"
            class="w-full px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white"
            disabled
          />
        </div>
      </div>
    </div>
  </section>

  <!-- Salary Mixer Section -->
  {#if $currentOrgRole === 'employee' || $currentOrgRole === 'contractor'}
    <section class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
      <div class="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center gap-3">
        <Sliders class="text-slate-400 dark:text-slate-500" size={20} />
        <h2 class="font-semibold text-slate-900 dark:text-white">Salary Mix</h2>
      </div>

      <div class="p-6 space-y-6">
        <!-- Explanation -->
        <div class="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-4 flex gap-3">
          <Info class="text-indigo-600 dark:text-indigo-400 flex-shrink-0" size={20} />
          <div class="text-sm text-indigo-800 dark:text-indigo-300">
            <p class="font-medium mb-1">How the salary mix works</p>
            <p>
              Your compensation is split between a guaranteed base salary and performance-based task earnings.
              A higher base ratio (r) means more stable income. A lower ratio means more of your pay comes from
              completing tasks, offering higher potential earnings if you're productive.
            </p>
          </div>
        </div>

        <!-- The Slider -->
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <label for="salary-ratio-slider" class="text-sm font-medium text-slate-700 dark:text-slate-300">
              Base Salary Ratio (r)
            </label>
            <span class="text-2xl font-bold text-slate-900 dark:text-white">
              {(localR * 100).toFixed(0)}%
            </span>
          </div>

          <input
            type="range"
            id="salary-ratio-slider"
            min={rBounds.min * 100}
            max={rBounds.max * 100}
            step="5"
            value={sliderValue}
            on:input={(e) => localR = parseInt(e.currentTarget.value) / 100}
            class="w-full h-3 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-600"
          />

          <div class="flex justify-between text-sm text-slate-500 dark:text-slate-400">
            <span>More task-based ({(rBounds.min * 100).toFixed(0)}%)</span>
            <span>More stable ({(rBounds.max * 100).toFixed(0)}%)</span>
          </div>
        </div>

        <!-- Risk Profile -->
        <div class="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
          <TrendingUp class={riskProfile.color} size={24} />
          <div>
            <p class="font-semibold {riskProfile.color}">{riskProfile.level}</p>
            <p class="text-sm text-slate-600 dark:text-slate-400">{riskProfile.description}</p>
          </div>
        </div>

        <!-- Projection -->
        {#if salaryProjection && monthlyBreakdown}
          <div class="grid grid-cols-2 gap-4">
            <div class="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl p-6 text-white">
              <p class="text-indigo-200 text-sm">Monthly Projection</p>
              <p class="text-3xl font-bold mt-1">{formatCurrency(monthlyBreakdown.total)}</p>
              <div class="mt-4 space-y-2 text-sm">
                <div class="flex justify-between">
                  <span class="text-indigo-200">Base ({(localR * 100).toFixed(0)}%)</span>
                  <span>{formatCurrency(monthlyBreakdown.base)}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-indigo-200">Tasks ({((1 - localR) * 100).toFixed(0)}%)</span>
                  <span>{formatCurrency(monthlyBreakdown.tasks)}</span>
                </div>
              </div>
            </div>

            <div class="bg-slate-900 rounded-xl p-6 text-white">
              <p class="text-slate-400 text-sm">Annual Projection</p>
              <p class="text-3xl font-bold mt-1">{formatCurrency(salaryProjection.projected)}</p>
              <div class="mt-4 space-y-2 text-sm">
                <div class="flex justify-between">
                  <span class="text-slate-400">From base</span>
                  <span>{formatCurrency(salaryProjection.fromBase)}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-slate-400">From tasks</span>
                  <span>{formatCurrency(salaryProjection.fromTasks)}</span>
                </div>
              </div>
            </div>
          </div>

          <p class="text-xs text-slate-500 dark:text-slate-400 text-center">
            * Projections based on average monthly task value of {formatCurrency(avgMonthlyTaskValue)}. Actual earnings may vary.
          </p>
        {/if}

        <!-- Validation Warning -->
        {#if !validation.valid}
          <div class="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 flex items-center gap-3">
            <AlertTriangle class="text-amber-600 dark:text-amber-400" size={20} />
            <p class="text-sm text-amber-800 dark:text-amber-300">
              Value will be adjusted to {(validation.clamped * 100).toFixed(0)}% (within allowed range)
            </p>
          </div>
        {/if}

        <!-- Save Button -->
        <div class="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-700">
          <div>
            {#if saveSuccess}
              <p class="text-green-600 dark:text-green-400 text-sm font-medium">✓ Settings saved successfully</p>
            {/if}
          </div>
          <button
            class="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            on:click={handleSave}
            disabled={saving || localR === $user?.r}
          >
            <Save size={18} />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </section>
  {/if}

  <!-- Notification Settings -->
  <section class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
    <div class="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center gap-3">
      <Bell class="text-slate-400 dark:text-slate-500" size={20} />
      <h2 class="font-semibold text-slate-900 dark:text-white">Notifications</h2>
    </div>
    <div class="p-6 space-y-4">
      <label class="flex items-center justify-between cursor-pointer">
        <div>
          <p class="font-medium text-slate-900 dark:text-white">Task assignments</p>
          <p class="text-sm text-slate-500 dark:text-slate-400">Get notified when a new task is assigned to you</p>
        </div>
        <input type="checkbox" checked class="w-5 h-5 rounded text-indigo-600" />
      </label>
      <label class="flex items-center justify-between cursor-pointer">
        <div>
          <p class="font-medium text-slate-900 dark:text-white">QC reviews</p>
          <p class="text-sm text-slate-500 dark:text-slate-400">Get notified when your work is reviewed</p>
        </div>
        <input type="checkbox" checked class="w-5 h-5 rounded text-indigo-600" />
      </label>
      <label class="flex items-center justify-between cursor-pointer">
        <div>
          <p class="font-medium text-slate-900 dark:text-white">Payouts</p>
          <p class="text-sm text-slate-500 dark:text-slate-400">Get notified when you receive a payout</p>
        </div>
        <input type="checkbox" checked class="w-5 h-5 rounded text-indigo-600" />
      </label>
      <label class="flex items-center justify-between cursor-pointer">
        <div>
          <p class="font-medium text-slate-900 dark:text-white">Deadline reminders</p>
          <p class="text-sm text-slate-500 dark:text-slate-400">Get reminded about upcoming task deadlines</p>
        </div>
        <input type="checkbox" checked class="w-5 h-5 rounded text-indigo-600" />
      </label>
    </div>
  </section>

  <!-- Security -->
  <section class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
    <div class="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center gap-3">
      <Shield class="text-slate-400 dark:text-slate-500" size={20} />
      <h2 class="font-semibold text-slate-900 dark:text-white">Security</h2>
    </div>
    <div class="p-6 space-y-4">
      <div class="flex items-center justify-between">
        <div>
          <p class="font-medium text-slate-900 dark:text-white">Password</p>
          <p class="text-sm text-slate-500 dark:text-slate-400">Change your account password</p>
        </div>
        <button
          on:click={() => showPasswordModal = true}
          class="px-4 py-2 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg font-medium transition-colors"
        >
          Change Password
        </button>
      </div>
      <div class="flex items-center justify-between">
        <div>
          <p class="font-medium text-slate-900 dark:text-white">Two-factor authentication</p>
          <p class="text-sm text-slate-500 dark:text-slate-400">Add an extra layer of security</p>
        </div>
        <button class="px-4 py-2 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg font-medium transition-colors">
          Enable
        </button>
      </div>
    </div>
  </section>

  <!-- Organizations Section -->
  <section class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
    <div class="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <Building2 class="text-slate-400 dark:text-slate-500" size={20} />
        <h2 class="font-semibold text-slate-900 dark:text-white">Organizations</h2>
      </div>
      <button
        on:click={() => showJoinOrgModal = true}
        class="flex items-center gap-2 px-3 py-1.5 text-sm bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 rounded-lg font-medium transition-colors"
      >
        <Plus size={16} />
        Join Organization
      </button>
    </div>
    <div class="p-6">
      {#if $userOrganizations.length === 0}
        <p class="text-slate-500 dark:text-slate-400 text-center py-4">Loading organizations...</p>
      {:else}
        <div class="space-y-3">
          {#each $userOrganizations as membership}
            <div class="flex items-center justify-between p-4 rounded-lg border {membership.org_id === $organization?.id ? 'border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/20' : 'border-slate-200 dark:border-slate-700'}">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-lg flex items-center justify-center {membership.org_id === $organization?.id ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-700'}">
                  <Building2 size={18} class={membership.org_id === $organization?.id ? 'text-white' : 'text-slate-500 dark:text-slate-400'} />
                </div>
                <div>
                  <p class="font-medium text-slate-900 dark:text-white">{membership.organization?.name || 'Unknown Organization'}</p>
                  <div class="flex items-center gap-2">
                    <span class="text-sm text-slate-500 dark:text-slate-400 capitalize">{membership.role}</span>
                    {#if membership.is_primary}
                      <span class="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded">Primary</span>
                    {/if}
                  </div>
                </div>
              </div>
              <div class="flex items-center gap-2">
                {#if membership.org_id === $organization?.id}
                  <span class="flex items-center gap-1 text-sm text-indigo-600 dark:text-indigo-400 font-medium">
                    <Check size={16} />
                    Active
                  </span>
                {:else}
                  <button
                    on:click={() => handleSwitchOrg(membership.org_id)}
                    class="px-3 py-1.5 text-sm text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/20 rounded-lg font-medium transition-colors"
                  >
                    Switch
                  </button>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </section>
</div>

<!-- Join Organization Modal -->
{#if showJoinOrgModal}
  <div class="fixed inset-0 z-50 overflow-y-auto">
    <div class="flex min-h-full items-center justify-center p-4">
      <button
        class="fixed inset-0 bg-black/50"
        on:click={closeJoinOrgModal}
        aria-label="Close modal"
      />

      <div class="relative bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md">
        <!-- Header -->
        <div class="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center">
              <Building2 class="text-indigo-600 dark:text-indigo-400" size={20} />
            </div>
            <h2 class="text-lg font-semibold text-slate-900 dark:text-white">Join Organization</h2>
          </div>
          <button
            on:click={closeJoinOrgModal}
            class="p-2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
          >
            <X size={20} />
          </button>
        </div>

        <!-- Content -->
        {#if joinSuccess}
          <div class="p-6 text-center">
            <div class="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check class="text-green-600 dark:text-green-400" size={32} />
            </div>
            <h3 class="text-lg font-semibold text-slate-900 dark:text-white mb-2">Welcome!</h3>
            <p class="text-slate-600 dark:text-slate-300">You've successfully joined <span class="font-medium">{joinedOrgName}</span>.</p>
            <p class="text-sm text-slate-500 dark:text-slate-400 mt-2">You can now switch to this organization using the switcher in the sidebar.</p>
          </div>
        {:else}
          <form on:submit|preventDefault={handleJoinOrganization} class="p-6 space-y-4">
            <p class="text-slate-600 dark:text-slate-300 text-sm">
              Enter the invite code provided by your organization admin to join a new organization.
            </p>

            {#if joinError}
              <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 flex items-center gap-2 text-sm text-red-700 dark:text-red-400">
                <AlertTriangle size={16} />
                {joinError}
              </div>
            {/if}

            <div>
              <label for="invite-code-input" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Invite Code
              </label>
              <input
                type="text"
                id="invite-code-input"
                bind:value={inviteCode}
                class="w-full px-4 py-3 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-center text-xl font-mono uppercase tracking-widest"
                placeholder="ABC123"
                maxlength="6"
                disabled={joiningOrg}
              />
              <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">The 6-character code from your organization admin</p>
            </div>

            <!-- Actions -->
            <div class="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
              <button
                type="button"
                on:click={closeJoinOrgModal}
                class="px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                disabled={joiningOrg}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!inviteCode.trim() || joiningOrg}
                class="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {#if joiningOrg}
                  <Loader size={16} class="animate-spin" />
                  Joining...
                {:else}
                  Join Organization
                {/if}
              </button>
            </div>
          </form>
        {/if}
      </div>
    </div>
  </div>
{/if}

<!-- Password Change Modal -->
{#if showPasswordModal}
  <div class="fixed inset-0 z-50 overflow-y-auto">
    <div class="flex min-h-full items-center justify-center p-4">
      <button
        class="fixed inset-0 bg-black/50"
        on:click={closePasswordModal}
      />

      <div class="relative bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md">
        <!-- Header -->
        <div class="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center">
              <Lock class="text-indigo-600 dark:text-indigo-400" size={20} />
            </div>
            <h2 class="text-lg font-semibold text-slate-900 dark:text-white">Change Password</h2>
          </div>
          <button
            on:click={closePasswordModal}
            class="p-2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
          >
            <X size={20} />
          </button>
        </div>

        <!-- Form -->
        <form on:submit|preventDefault={handleChangePassword} class="p-6 space-y-4">
          {#if passwordError}
            <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-400">
              {passwordError}
            </div>
          {/if}

          <!-- Current Password -->
          <div>
            <label for="current-password" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Current Password
            </label>
            <div class="relative">
              {#if showCurrentPassword}
                <input
                  type="text"
                  id="current-password"
                  bind:value={passwordForm.currentPassword}
                  class="w-full px-4 py-2 pr-10 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Enter current password"
                  required
                />
              {:else}
                <input
                  type="password"
                  id="current-password"
                  bind:value={passwordForm.currentPassword}
                  class="w-full px-4 py-2 pr-10 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Enter current password"
                  required
                />
              {/if}
              <button
                type="button"
                on:click={() => showCurrentPassword = !showCurrentPassword}
                class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
              >
                {#if showCurrentPassword}
                  <EyeOff size={18} />
                {:else}
                  <Eye size={18} />
                {/if}
              </button>
            </div>
          </div>

          <!-- New Password -->
          <div>
            <label for="new-password" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              New Password
            </label>
            <div class="relative">
              {#if showNewPassword}
                <input
                  type="text"
                  id="new-password"
                  bind:value={passwordForm.newPassword}
                  class="w-full px-4 py-2 pr-10 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Enter new password"
                  required
                  minlength="8"
                />
              {:else}
                <input
                  type="password"
                  id="new-password"
                  bind:value={passwordForm.newPassword}
                  class="w-full px-4 py-2 pr-10 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Enter new password"
                  required
                  minlength="8"
                />
              {/if}
              <button
                type="button"
                on:click={() => showNewPassword = !showNewPassword}
                class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
              >
                {#if showNewPassword}
                  <EyeOff size={18} />
                {:else}
                  <Eye size={18} />
                {/if}
              </button>
            </div>

            <!-- Password Strength -->
            {#if passwordForm.newPassword.length > 0}
              <div class="mt-2">
                <div class="flex items-center gap-2 mb-1">
                  <div class="flex-1 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      class="h-full transition-all duration-300
                        {passwordStrength.score <= 1 ? 'bg-red-500' :
                         passwordStrength.score <= 2 ? 'bg-amber-500' :
                         passwordStrength.score <= 3 ? 'bg-yellow-500' :
                         'bg-green-500'}"
                      style="width: {(passwordStrength.score / 5) * 100}%"
                    ></div>
                  </div>
                  <span class="text-xs font-medium {passwordStrength.color}">
                    {passwordStrength.label}
                  </span>
                </div>
                <p class="text-xs text-slate-500 dark:text-slate-400">
                  Use 8+ characters with uppercase, lowercase, numbers, and symbols
                </p>
              </div>
            {/if}
          </div>

          <!-- Confirm Password -->
          <div>
            <label for="confirm-password" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Confirm New Password
            </label>
            <input
              type="password"
              id="confirm-password"
              bind:value={passwordForm.confirmPassword}
              class="w-full px-4 py-2 border rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500
                {passwordForm.confirmPassword.length > 0 && !passwordsMatch ? 'border-red-300 dark:border-red-700' : 'border-slate-200 dark:border-slate-600'}"
              placeholder="Confirm new password"
              required
            />
            {#if passwordForm.confirmPassword.length > 0 && !passwordsMatch}
              <p class="mt-1 text-xs text-red-500 dark:text-red-400">Passwords do not match</p>
            {/if}
          </div>

          <!-- Actions -->
          <div class="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
            <button
              type="button"
              on:click={closePasswordModal}
              class="px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmitPassword || changingPassword}
              class="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {changingPassword ? 'Changing...' : 'Change Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
{/if}

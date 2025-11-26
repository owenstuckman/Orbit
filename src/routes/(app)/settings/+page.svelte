<script lang="ts">
  import { user, organization } from '$lib/stores/auth';
  import { formatCurrency, calculateSalaryBreakdown, projectAnnualSalary, validateR } from '$lib/utils/payout';
  import { 
    User, 
    DollarSign, 
    Sliders, 
    Bell, 
    Shield, 
    Save,
    Info,
    TrendingUp,
    AlertTriangle
  } from 'lucide-svelte';

  // Local state for form
  let localR = $user?.r ?? $organization?.default_r ?? 0.7;
  let saving = false;
  let saveSuccess = false;

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
    <h1 class="text-2xl font-bold text-slate-900">Settings</h1>
    <p class="mt-1 text-slate-600">Manage your account and compensation preferences</p>
  </div>

  <!-- Profile Section -->
  <section class="bg-white rounded-xl border border-slate-200">
    <div class="px-6 py-4 border-b border-slate-200 flex items-center gap-3">
      <User class="text-slate-400" size={20} />
      <h2 class="font-semibold text-slate-900">Profile</h2>
    </div>
    <div class="p-6 space-y-4">
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
          <input
            type="text"
            value={$user?.full_name || ''}
            class="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            disabled
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1">Email</label>
          <input
            type="email"
            value={$user?.email || ''}
            class="w-full px-4 py-2 border border-slate-200 rounded-lg bg-slate-50"
            disabled
          />
        </div>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1">Role</label>
          <input
            type="text"
            value={$user?.role || ''}
            class="w-full px-4 py-2 border border-slate-200 rounded-lg bg-slate-50 capitalize"
            disabled
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1">Level</label>
          <input
            type="text"
            value="Level {$user?.level || 1} (Training Level {$user?.training_level || 1})"
            class="w-full px-4 py-2 border border-slate-200 rounded-lg bg-slate-50"
            disabled
          />
        </div>
      </div>
    </div>
  </section>

  <!-- Salary Mixer Section -->
  {#if $user?.role === 'employee' || $user?.role === 'contractor'}
    <section class="bg-white rounded-xl border border-slate-200">
      <div class="px-6 py-4 border-b border-slate-200 flex items-center gap-3">
        <Sliders class="text-slate-400" size={20} />
        <h2 class="font-semibold text-slate-900">Salary Mix</h2>
      </div>
      
      <div class="p-6 space-y-6">
        <!-- Explanation -->
        <div class="bg-indigo-50 rounded-lg p-4 flex gap-3">
          <Info class="text-indigo-600 flex-shrink-0" size={20} />
          <div class="text-sm text-indigo-800">
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
            <label class="text-sm font-medium text-slate-700">
              Base Salary Ratio (r)
            </label>
            <span class="text-2xl font-bold text-slate-900">
              {(localR * 100).toFixed(0)}%
            </span>
          </div>

          <input
            type="range"
            min={rBounds.min * 100}
            max={rBounds.max * 100}
            step="5"
            bind:value={localR}
            on:input={(e) => localR = parseInt(e.currentTarget.value) / 100}
            class="w-full h-3 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
          />

          <div class="flex justify-between text-sm text-slate-500">
            <span>More task-based ({(rBounds.min * 100).toFixed(0)}%)</span>
            <span>More stable ({(rBounds.max * 100).toFixed(0)}%)</span>
          </div>
        </div>

        <!-- Risk Profile -->
        <div class="flex items-center gap-3 p-4 bg-slate-50 rounded-lg">
          <TrendingUp class={riskProfile.color} size={24} />
          <div>
            <p class="font-semibold {riskProfile.color}">{riskProfile.level}</p>
            <p class="text-sm text-slate-600">{riskProfile.description}</p>
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

          <p class="text-xs text-slate-500 text-center">
            * Projections based on average monthly task value of {formatCurrency(avgMonthlyTaskValue)}. Actual earnings may vary.
          </p>
        {/if}

        <!-- Validation Warning -->
        {#if !validation.valid}
          <div class="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center gap-3">
            <AlertTriangle class="text-amber-600" size={20} />
            <p class="text-sm text-amber-800">
              Value will be adjusted to {(validation.clamped * 100).toFixed(0)}% (within allowed range)
            </p>
          </div>
        {/if}

        <!-- Save Button -->
        <div class="flex items-center justify-between pt-4 border-t border-slate-200">
          <div>
            {#if saveSuccess}
              <p class="text-green-600 text-sm font-medium">✓ Settings saved successfully</p>
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
  <section class="bg-white rounded-xl border border-slate-200">
    <div class="px-6 py-4 border-b border-slate-200 flex items-center gap-3">
      <Bell class="text-slate-400" size={20} />
      <h2 class="font-semibold text-slate-900">Notifications</h2>
    </div>
    <div class="p-6 space-y-4">
      <label class="flex items-center justify-between cursor-pointer">
        <div>
          <p class="font-medium text-slate-900">Task assignments</p>
          <p class="text-sm text-slate-500">Get notified when a new task is assigned to you</p>
        </div>
        <input type="checkbox" checked class="w-5 h-5 rounded text-indigo-600" />
      </label>
      <label class="flex items-center justify-between cursor-pointer">
        <div>
          <p class="font-medium text-slate-900">QC reviews</p>
          <p class="text-sm text-slate-500">Get notified when your work is reviewed</p>
        </div>
        <input type="checkbox" checked class="w-5 h-5 rounded text-indigo-600" />
      </label>
      <label class="flex items-center justify-between cursor-pointer">
        <div>
          <p class="font-medium text-slate-900">Payouts</p>
          <p class="text-sm text-slate-500">Get notified when you receive a payout</p>
        </div>
        <input type="checkbox" checked class="w-5 h-5 rounded text-indigo-600" />
      </label>
      <label class="flex items-center justify-between cursor-pointer">
        <div>
          <p class="font-medium text-slate-900">Deadline reminders</p>
          <p class="text-sm text-slate-500">Get reminded about upcoming task deadlines</p>
        </div>
        <input type="checkbox" checked class="w-5 h-5 rounded text-indigo-600" />
      </label>
    </div>
  </section>

  <!-- Security -->
  <section class="bg-white rounded-xl border border-slate-200">
    <div class="px-6 py-4 border-b border-slate-200 flex items-center gap-3">
      <Shield class="text-slate-400" size={20} />
      <h2 class="font-semibold text-slate-900">Security</h2>
    </div>
    <div class="p-6 space-y-4">
      <div class="flex items-center justify-between">
        <div>
          <p class="font-medium text-slate-900">Password</p>
          <p class="text-sm text-slate-500">Last changed 30 days ago</p>
        </div>
        <button class="px-4 py-2 text-indigo-600 hover:bg-indigo-50 rounded-lg font-medium transition-colors">
          Change Password
        </button>
      </div>
      <div class="flex items-center justify-between">
        <div>
          <p class="font-medium text-slate-900">Two-factor authentication</p>
          <p class="text-sm text-slate-500">Add an extra layer of security</p>
        </div>
        <button class="px-4 py-2 text-indigo-600 hover:bg-indigo-50 rounded-lg font-medium transition-colors">
          Enable
        </button>
      </div>
    </div>
  </section>
</div>

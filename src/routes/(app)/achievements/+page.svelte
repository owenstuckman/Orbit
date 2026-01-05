<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { user, currentOrgRole } from '$lib/stores/auth';
  import { toasts } from '$lib/stores/notifications';
  import { tasksApi, payoutsApi } from '$lib/services/api';
  import {
    Trophy,
    Star,
    Flame,
    Target,
    Zap,
    TrendingUp,
    Calendar,
    Award,
    Crown,
    Medal,
    Rocket,
    Lock,
    CheckCircle
  } from 'lucide-svelte';

  let loading = true;

  // Progress data computed from real data
  let progress = {
    tasksCompleted: 0,
    firstPassApprovals: 0,
    currentStreak: 0,
    longestStreak: 0,
    totalEarnings: 0,
    level: 1,
    xp: 0
  };

  type BadgeTier = 'bronze' | 'silver' | 'gold' | 'platinum';

  // Badge definitions with requirements
  const BADGES: Array<{
    id: string;
    name: string;
    description: string;
    icon: typeof Target;
    tier: BadgeTier;
    category: string;
    type: string;
    requirement: number;
    xp: number;
  }> = [
    // Task completion badges
    { id: 'first-task', name: 'First Task', description: 'Complete your first task', icon: Target, tier: 'bronze', category: 'Tasks', type: 'tasks', requirement: 1, xp: 50 },
    { id: 'task-novice', name: 'Task Novice', description: 'Complete 10 tasks', icon: Target, tier: 'bronze', category: 'Tasks', type: 'tasks', requirement: 10, xp: 100 },
    { id: 'task-expert', name: 'Task Expert', description: 'Complete 50 tasks', icon: Target, tier: 'silver', category: 'Tasks', type: 'tasks', requirement: 50, xp: 250 },
    { id: 'task-master', name: 'Task Master', description: 'Complete 100 tasks', icon: Trophy, tier: 'gold', category: 'Tasks', type: 'tasks', requirement: 100, xp: 500 },
    { id: 'task-legend', name: 'Task Legend', description: 'Complete 500 tasks', icon: Crown, tier: 'platinum', category: 'Tasks', type: 'tasks', requirement: 500, xp: 1000 },

    // Quality badges
    { id: 'quality-start', name: 'Quality Start', description: 'Get your first first-pass approval', icon: Star, tier: 'bronze', category: 'Quality', type: 'quality', requirement: 1, xp: 75 },
    { id: 'quality-pro', name: 'Quality Pro', description: 'Get 25 first-pass approvals', icon: Star, tier: 'silver', category: 'Quality', type: 'quality', requirement: 25, xp: 300 },
    { id: 'perfectionist', name: 'Perfectionist', description: 'Get 100 first-pass approvals', icon: Award, tier: 'gold', category: 'Quality', type: 'quality', requirement: 100, xp: 750 },

    // Streak badges
    { id: 'streak-starter', name: 'Streak Starter', description: 'Maintain a 3-day streak', icon: Flame, tier: 'bronze', category: 'Streaks', type: 'streak', requirement: 3, xp: 50 },
    { id: 'streak-keeper', name: 'Streak Keeper', description: 'Maintain a 7-day streak', icon: Flame, tier: 'bronze', category: 'Streaks', type: 'streak', requirement: 7, xp: 100 },
    { id: 'streak-warrior', name: 'Streak Warrior', description: 'Maintain a 30-day streak', icon: Flame, tier: 'silver', category: 'Streaks', type: 'streak', requirement: 30, xp: 500 },
    { id: 'streak-champion', name: 'Streak Champion', description: 'Maintain a 100-day streak', icon: Flame, tier: 'gold', category: 'Streaks', type: 'streak', requirement: 100, xp: 1500 },

    // Level badges
    { id: 'level-5', name: 'Rising Star', description: 'Reach level 5', icon: Rocket, tier: 'bronze', category: 'Levels', type: 'level', requirement: 5, xp: 150 },
    { id: 'level-10', name: 'Seasoned Pro', description: 'Reach level 10', icon: Rocket, tier: 'silver', category: 'Levels', type: 'level', requirement: 10, xp: 300 },
    { id: 'level-25', name: 'Elite Member', description: 'Reach level 25', icon: Crown, tier: 'gold', category: 'Levels', type: 'level', requirement: 25, xp: 750 },
    { id: 'level-50', name: 'Legendary', description: 'Reach level 50', icon: Crown, tier: 'platinum', category: 'Levels', type: 'level', requirement: 50, xp: 2000 },

    // Earnings badges
    { id: 'first-payout', name: 'First Payout', description: 'Receive your first payout', icon: Zap, tier: 'bronze', category: 'Earnings', type: 'earnings', requirement: 1, xp: 50 },
    { id: 'earner-1k', name: '$1K Club', description: 'Earn $1,000 total', icon: Zap, tier: 'silver', category: 'Earnings', type: 'earnings', requirement: 1000, xp: 200 },
    { id: 'earner-10k', name: '$10K Club', description: 'Earn $10,000 total', icon: Medal, tier: 'gold', category: 'Earnings', type: 'earnings', requirement: 10000, xp: 500 },
    { id: 'earner-100k', name: '$100K Club', description: 'Earn $100,000 total', icon: Crown, tier: 'platinum', category: 'Earnings', type: 'earnings', requirement: 100000, xp: 2500 }
  ];

  const tierColors = {
    bronze: { bg: 'from-amber-600 to-amber-800', border: 'border-amber-500', text: 'text-amber-600' },
    silver: { bg: 'from-slate-400 to-slate-600', border: 'border-slate-400', text: 'text-slate-500' },
    gold: { bg: 'from-yellow-400 to-yellow-600', border: 'border-yellow-500', text: 'text-yellow-600' },
    platinum: { bg: 'from-cyan-400 to-blue-600', border: 'border-cyan-400', text: 'text-cyan-600' }
  };

  onMount(async () => {
    // Route guard: Only employees and contractors see achievements
    if ($currentOrgRole !== 'employee' && $currentOrgRole !== 'contractor') {
      toasts.error('Achievements are only available for employees and contractors');
      goto('/dashboard');
      return;
    }

    await loadProgress();
    loading = false;
  });

  async function loadProgress() {
    if (!$user) return;

    try {
      // Load tasks for this user
      const userTasks = await tasksApi.list({ eq: { assignee_id: $user.id } });

      const completedTasks = userTasks.filter(t =>
        ['completed', 'under_review', 'approved', 'paid'].includes(t.status)
      );

      // Calculate first-pass approvals (tasks approved on first QC review)
      const approvedTasks = userTasks.filter(t => ['approved', 'paid'].includes(t.status));
      const firstPassApprovals = approvedTasks.filter(t => {
        if (!t.qc_reviews || t.qc_reviews.length === 0) return false;
        const firstReview = t.qc_reviews.find(r => r.pass_number === 1);
        return firstReview?.passed === true;
      }).length;

      // Load payout summary
      const payoutSummary = await payoutsApi.getSummary($user.id);

      // Get streak from user metadata
      const currentStreak = ($user.metadata?.current_streak as number) || 0;
      const longestStreak = ($user.metadata?.longest_streak as number) || currentStreak;

      // Calculate XP from level + completions
      const xp = (($user.level - 1) * 100) + (completedTasks.length * 10);

      progress = {
        tasksCompleted: completedTasks.length,
        firstPassApprovals,
        currentStreak,
        longestStreak,
        totalEarnings: payoutSummary.total || 0,
        level: $user.level,
        xp
      };
    } catch (error) {
      console.error('Failed to load progress:', error);
      // Use default progress values
    }
  }

  function getBadgeProgress(badge: typeof BADGES[0]): number {
    switch (badge.type) {
      case 'tasks': return progress.tasksCompleted;
      case 'quality': return progress.firstPassApprovals;
      case 'streak': return Math.max(progress.currentStreak, progress.longestStreak);
      case 'level': return progress.level;
      case 'earnings': return progress.totalEarnings;
      default: return 0;
    }
  }

  function isBadgeEarned(badge: typeof BADGES[0]): boolean {
    return getBadgeProgress(badge) >= badge.requirement;
  }

  function getProgressPercent(badge: typeof BADGES[0]): number {
    const current = getBadgeProgress(badge);
    return Math.min((current / badge.requirement) * 100, 100);
  }

  // Compute badges with progress
  $: badgesWithProgress = BADGES.map(badge => ({
    ...badge,
    earned: isBadgeEarned(badge),
    current: getBadgeProgress(badge),
    progressPercent: getProgressPercent(badge)
  }));

  // Group badges by category
  $: groupedBadges = badgesWithProgress.reduce((acc, badge) => {
    if (!acc[badge.category]) acc[badge.category] = [];
    acc[badge.category].push(badge);
    return acc;
  }, {} as Record<string, typeof badgesWithProgress>);

  $: earnedCount = badgesWithProgress.filter(b => b.earned).length;
  $: totalCount = badgesWithProgress.length;
  $: overallProgress = totalCount > 0 ? (earnedCount / totalCount) * 100 : 0;

  // XP calculations
  function xpForLevel(level: number): number {
    return 50 * level * (level - 1);
  }

  $: currentLevelXp = xpForLevel(progress.level);
  $: nextLevelXp = xpForLevel(progress.level + 1);
  $: xpProgress = nextLevelXp - currentLevelXp > 0
    ? ((progress.xp - currentLevelXp) / (nextLevelXp - currentLevelXp)) * 100
    : 0;
  $: xpToNext = nextLevelXp - progress.xp;

  // Stats for the header
  $: stats = [
    { label: 'Tasks Completed', value: progress.tasksCompleted, icon: Target, color: 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30' },
    { label: 'Current Streak', value: `${progress.currentStreak} days`, icon: Flame, color: 'text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-900/30' },
    { label: 'First-Pass Approvals', value: progress.firstPassApprovals, icon: Star, color: 'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30' },
    { label: 'Total Earnings', value: `$${progress.totalEarnings.toLocaleString()}`, icon: Zap, color: 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30' }
  ];

  let showLocked = true;
</script>

<svelte:head>
  <title>Achievements - Orbit</title>
</svelte:head>

<div class="max-w-6xl mx-auto space-y-6">
  {#if loading}
    <div class="flex items-center justify-center py-20">
      <div class="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
    </div>
  {:else}
    <!-- Header with Level & XP -->
    <div class="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 rounded-2xl p-6 lg:p-8 text-white">
      <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
        <div class="flex items-center gap-4 lg:gap-6">
          <!-- Level badge -->
          <div class="relative flex-shrink-0">
            <div class="w-20 h-20 lg:w-24 lg:h-24 rounded-full bg-white/20 backdrop-blur flex items-center justify-center border-4 border-white/30">
              <div class="text-center">
                <span class="text-2xl lg:text-3xl font-bold">{progress.level}</span>
                <p class="text-xs uppercase tracking-wider opacity-80">Level</p>
              </div>
            </div>
            <div class="absolute -bottom-1 -right-1 w-7 h-7 lg:w-8 lg:h-8 bg-amber-400 rounded-full flex items-center justify-center border-2 border-white">
              <Trophy size={14} class="text-amber-800" />
            </div>
          </div>

          <div class="min-w-0">
            <h1 class="text-xl lg:text-2xl font-bold mb-1 truncate">{$user?.full_name || 'Your'} Achievements</h1>
            <p class="text-indigo-200 text-sm lg:text-base">
              {earnedCount} of {totalCount} badges earned
            </p>
          </div>
        </div>

        <!-- XP Progress -->
        <div class="flex-1 max-w-md">
          <div class="flex items-center justify-between text-sm mb-2">
            <span class="font-medium">{progress.xp} XP Total</span>
            <span class="text-indigo-200">
              {xpToNext} XP to Level {progress.level + 1}
            </span>
          </div>
          <div class="w-full bg-white/20 rounded-full h-3 lg:h-4">
            <div
              class="bg-gradient-to-r from-amber-400 to-orange-500 h-3 lg:h-4 rounded-full transition-all duration-500"
              style="width: {Math.max(xpProgress, 5)}%"
            ></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Stats Grid -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
      {#each stats as stat}
        <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-3 lg:p-4">
          <div class="flex items-center gap-2 lg:gap-3">
            <div class="w-9 h-9 lg:w-10 lg:h-10 rounded-lg flex items-center justify-center {stat.color}">
              <svelte:component this={stat.icon} size={18} />
            </div>
            <div class="min-w-0">
              <p class="text-lg lg:text-xl font-bold text-slate-900 dark:text-white truncate">{stat.value}</p>
              <p class="text-xs lg:text-sm text-slate-500 dark:text-slate-400 truncate">{stat.label}</p>
            </div>
          </div>
        </div>
      {/each}
    </div>

    <!-- Badges Section -->
    <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 lg:p-6">
      <!-- Badges Header -->
      <div class="flex items-center justify-between mb-6">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center">
            <Trophy class="text-white" size={24} />
          </div>
          <div>
            <h3 class="text-lg font-semibold text-slate-900 dark:text-white">All Achievements</h3>
            <p class="text-sm text-slate-500 dark:text-slate-400">
              {earnedCount} of {totalCount} badges earned
            </p>
          </div>
        </div>

        <label class="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 cursor-pointer">
          <input
            type="checkbox"
            bind:checked={showLocked}
            class="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"
          />
          Show locked
        </label>
      </div>

      <!-- Overall Progress Bar -->
      <div class="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2.5 mb-6">
        <div
          class="bg-gradient-to-r from-amber-400 to-orange-500 h-2.5 rounded-full transition-all duration-500"
          style="width: {overallProgress}%"
        ></div>
      </div>

      <!-- Badges by Category -->
      {#each Object.entries(groupedBadges) as [category, categoryBadges]}
        {@const visibleBadges = showLocked ? categoryBadges : categoryBadges.filter(b => b.earned)}
        {#if visibleBadges.length > 0}
          <div class="mb-8 last:mb-0">
            <div class="flex items-center gap-2 mb-4">
              <h4 class="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{category}</h4>
              <span class="text-xs text-slate-400 dark:text-slate-500">
                ({categoryBadges.filter(b => b.earned).length}/{categoryBadges.length})
              </span>
            </div>

            <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
              {#each visibleBadges as badge (badge.id)}
                <div class="relative group" title={badge.description}>
                  <!-- Badge Circle -->
                  <div class="relative mx-auto">
                    <div
                      class="w-16 h-16 lg:w-20 lg:h-20 mx-auto rounded-full flex items-center justify-center transition-all duration-300
                             {badge.earned
                               ? `bg-gradient-to-br ${tierColors[badge.tier].bg} border-2 ${tierColors[badge.tier].border} shadow-lg hover:shadow-xl hover:scale-105`
                               : 'bg-slate-100 dark:bg-slate-700 border-2 border-slate-200 dark:border-slate-600 opacity-60'}"
                    >
                      <svelte:component
                        this={badge.icon}
                        size={24}
                        class={badge.earned ? 'text-white' : 'text-slate-400 dark:text-slate-500'}
                      />
                    </div>

                    <!-- Progress Ring for Unearned -->
                    {#if !badge.earned}
                      <svg
                        class="absolute inset-0 w-16 h-16 lg:w-20 lg:h-20 mx-auto -rotate-90"
                        viewBox="0 0 100 100"
                      >
                        <circle
                          cx="50"
                          cy="50"
                          r="46"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="4"
                          class="text-slate-200 dark:text-slate-600"
                        />
                        <circle
                          cx="50"
                          cy="50"
                          r="46"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="4"
                          stroke-dasharray="{badge.progressPercent * 2.89} 289"
                          class="text-indigo-500 transition-all duration-500"
                        />
                      </svg>
                    {/if}

                    <!-- Earned Checkmark -->
                    {#if badge.earned}
                      <div class="absolute -top-1 -right-1 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center border-2 border-white dark:border-slate-800">
                        <CheckCircle size={14} class="text-white" />
                      </div>
                    {/if}
                  </div>

                  <!-- Badge Name -->
                  <p class="mt-2 text-center text-xs lg:text-sm font-medium truncate {badge.earned ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-500'}">
                    {badge.name}
                  </p>

                  <!-- Progress Text -->
                  {#if !badge.earned}
                    <p class="text-center text-xs text-slate-400 dark:text-slate-500">
                      {badge.current}/{badge.requirement}
                    </p>
                  {:else}
                    <p class="text-center text-xs {tierColors[badge.tier].text}">
                      +{badge.xp} XP
                    </p>
                  {/if}

                  <!-- Tooltip -->
                  <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                    <p class="font-medium">{badge.name}</p>
                    <p class="text-slate-300">{badge.description}</p>
                    {#if !badge.earned}
                      <p class="text-indigo-300 mt-1">{badge.current} / {badge.requirement}</p>
                    {:else}
                      <p class="text-green-300 mt-1">Earned!</p>
                    {/if}
                    <div class="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900"></div>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      {/each}
    </div>

    <!-- Recent Earned (only if any earned) -->
    {#if earnedCount > 0}
      <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 lg:p-6">
        <h2 class="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
          <Calendar class="text-slate-400 dark:text-slate-500" size={20} />
          Earned Badges
        </h2>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {#each badgesWithProgress.filter(b => b.earned).slice(0, 6) as badge}
            <div class="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
              <div class="w-12 h-12 rounded-full bg-gradient-to-br {tierColors[badge.tier].bg} flex items-center justify-center flex-shrink-0">
                <svelte:component this={badge.icon} size={20} class="text-white" />
              </div>
              <div class="flex-1 min-w-0">
                <p class="font-medium text-slate-900 dark:text-white truncate">{badge.name}</p>
                <p class="text-sm text-slate-500 dark:text-slate-400 truncate">{badge.description}</p>
              </div>
              <div class="text-right flex-shrink-0">
                <p class="text-sm font-medium {tierColors[badge.tier].text}">+{badge.xp} XP</p>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</div>

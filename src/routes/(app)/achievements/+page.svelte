<script lang="ts">
  import { onMount } from 'svelte';
  import { user } from '$lib/stores/auth';
  import { gamification, BADGE_DEFINITIONS, xpToNextLevel } from '$lib/stores/gamification';
  import AchievementsGrid from '$lib/components/gamification/AchievementsGrid.svelte';
  import {
    Trophy,
    Star,
    Flame,
    Target,
    Zap,
    TrendingUp,
    Calendar
  } from 'lucide-svelte';

  let loading = true;

  onMount(async () => {
    if ($user) {
      await gamification.load($user.id);
    }
    loading = false;
  });

  $: progress = $gamification.userProgress;
  $: badges = progress
    ? gamification.getBadgesWithProgress($gamification.earnedBadges, progress)
    : [];
  $: xpProgress = progress ? xpToNextLevel(progress.xp) : { current: 0, needed: 100, progress: 0 };

  // Stats for the header
  $: stats = [
    {
      label: 'Tasks Completed',
      value: progress?.tasks_completed || 0,
      icon: Target,
      color: 'text-blue-600 bg-blue-100'
    },
    {
      label: 'Current Streak',
      value: `${progress?.current_streak || 0} days`,
      icon: Flame,
      color: 'text-orange-600 bg-orange-100'
    },
    {
      label: 'First-Pass Approvals',
      value: progress?.first_pass_approvals || 0,
      icon: Star,
      color: 'text-amber-600 bg-amber-100'
    },
    {
      label: 'Total Earnings',
      value: `$${(progress?.total_earnings || 0).toLocaleString()}`,
      icon: Zap,
      color: 'text-green-600 bg-green-100'
    }
  ];
</script>

<svelte:head>
  <title>Achievements - Orbit</title>
</svelte:head>

<div class="max-w-6xl mx-auto space-y-8">
  {#if loading}
    <div class="flex items-center justify-center py-20">
      <div class="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
    </div>
  {:else}
    <!-- Header with Level & XP -->
    <div class="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 rounded-2xl p-8 text-white">
      <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
        <div class="flex items-center gap-6">
          <!-- Level badge -->
          <div class="relative">
            <div class="w-24 h-24 rounded-full bg-white/20 backdrop-blur flex items-center justify-center border-4 border-white/30">
              <div class="text-center">
                <span class="text-3xl font-bold">{progress?.level || 1}</span>
                <p class="text-xs uppercase tracking-wider opacity-80">Level</p>
              </div>
            </div>
            <div class="absolute -bottom-1 -right-1 w-8 h-8 bg-amber-400 rounded-full flex items-center justify-center border-2 border-white">
              <Trophy size={16} class="text-amber-800" />
            </div>
          </div>

          <div>
            <h1 class="text-2xl font-bold mb-1">{$user?.full_name || 'Your'} Achievements</h1>
            <p class="text-indigo-200">
              {$gamification.earnedBadges.length} badges earned out of {BADGE_DEFINITIONS.length}
            </p>
          </div>
        </div>

        <!-- XP Progress -->
        <div class="flex-1 max-w-md">
          <div class="flex items-center justify-between text-sm mb-2">
            <span class="font-medium">{progress?.xp || 0} XP Total</span>
            <span class="text-indigo-200">
              {xpProgress.current} / {xpProgress.needed} to Level {(progress?.level || 1) + 1}
            </span>
          </div>
          <div class="w-full bg-white/20 rounded-full h-4">
            <div
              class="bg-gradient-to-r from-amber-400 to-orange-500 h-4 rounded-full transition-all duration-500 flex items-center justify-end pr-2"
              style="width: {Math.max(xpProgress.progress, 5)}%"
            >
              {#if xpProgress.progress > 20}
                <span class="text-xs font-medium text-white">{Math.round(xpProgress.progress)}%</span>
              {/if}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Stats Grid -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {#each stats as stat}
        <div class="bg-white rounded-xl border border-slate-200 p-4">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg flex items-center justify-center {stat.color}">
              <svelte:component this={stat.icon} size={20} />
            </div>
            <div>
              <p class="text-xl font-bold text-slate-900">{stat.value}</p>
              <p class="text-sm text-slate-500">{stat.label}</p>
            </div>
          </div>
        </div>
      {/each}
    </div>

    <!-- Achievements Grid -->
    <div class="bg-white rounded-xl border border-slate-200 p-6">
      <AchievementsGrid {badges} showAllInitial={true} showProgress={true} />
    </div>

    <!-- Recent Activity -->
    {#if $gamification.earnedBadges.length > 0}
      <div class="bg-white rounded-xl border border-slate-200 p-6">
        <h2 class="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Calendar class="text-slate-400" size={20} />
          Recently Earned
        </h2>

        <div class="space-y-3">
          {#each $gamification.earnedBadges.slice(0, 5) as userBadge}
            {@const badge = BADGE_DEFINITIONS.find(b => b.id === userBadge.badge_id)}
            {#if badge}
              <div class="flex items-center gap-4 p-3 bg-slate-50 rounded-lg">
                <div class="w-12 h-12 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                  <Trophy class="text-white" size={20} />
                </div>
                <div class="flex-1">
                  <p class="font-medium text-slate-900">{badge.name}</p>
                  <p class="text-sm text-slate-500">{badge.description}</p>
                </div>
                <div class="text-right">
                  <p class="text-sm font-medium text-amber-600">+{badge.xp_reward} XP</p>
                  <p class="text-xs text-slate-400">
                    {new Date(userBadge.earned_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            {/if}
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</div>

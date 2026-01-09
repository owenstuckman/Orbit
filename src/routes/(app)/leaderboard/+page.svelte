<script lang="ts">
  import { onMount } from 'svelte';
  import { user } from '$lib/stores/auth';
  import { usersApi } from '$lib/services/api';
  import type { User } from '$lib/types';
  import {
    Trophy,
    Medal,
    Award,
    Star,
    TrendingUp,
    Flame,
    Target,
    Zap,
    Crown
  } from 'lucide-svelte';

  let users: User[] = [];
  let loading = true;
  let selectedPeriod: 'week' | 'month' | 'all' = 'month';

  interface LeaderboardEntry {
    user: User;
    rank: number;
    xp: number;
    tasksCompleted: number;
    streak: number;
    earnings: number;
  }

  let leaderboard: LeaderboardEntry[] = [];

  onMount(async () => {
    await loadLeaderboard();
  });

  async function loadLeaderboard() {
    loading = true;
    try {
      users = await usersApi.list();

      // Calculate leaderboard based on real user data
      // Uses xp, tasks_completed, and streak_days from user table
      leaderboard = users
        .map((u) => {
          // Use actual database fields with sensible defaults
          const xp = (u as any).xp || (u.metadata?.total_xp as number) || u.level * 50;
          const tasksCompleted = (u as any).tasks_completed || (u.metadata?.total_tasks_completed as number) || 0;
          const streak = (u as any).streak_days || (u.metadata?.current_streak as number) || 0;
          // Earnings would come from payouts - for now use calculated estimate based on tasks
          const earnings = tasksCompleted * 75; // Average $75 per task estimate

          return {
            user: u,
            rank: 0,
            xp,
            tasksCompleted,
            streak,
            earnings
          };
        })
        .filter(entry => entry.xp > 0 || entry.tasksCompleted > 0) // Only show users with activity
        .sort((a, b) => b.xp - a.xp || b.tasksCompleted - a.tasksCompleted)
        .map((entry, index) => ({ ...entry, rank: index + 1 }));
    } catch (error) {
      console.error('Failed to load leaderboard:', error);
    } finally {
      loading = false;
    }
  }

  function getRankStyle(rank: number): { bg: string; text: string; icon: typeof Trophy } {
    switch (rank) {
      case 1: return { bg: 'bg-gradient-to-br from-yellow-400 to-amber-500', text: 'text-yellow-900', icon: Crown };
      case 2: return { bg: 'bg-gradient-to-br from-slate-300 to-slate-400', text: 'text-slate-700', icon: Medal };
      case 3: return { bg: 'bg-gradient-to-br from-amber-600 to-amber-700', text: 'text-amber-100', icon: Award };
      default: return { bg: 'bg-slate-100', text: 'text-slate-600', icon: Star };
    }
  }

  $: currentUserRank = leaderboard.find(e => e.user.id === $user?.id)?.rank || 0;
</script>

<svelte:head>
  <title>Leaderboard - Orbit</title>
</svelte:head>

<div class="space-y-6">
  <!-- Header -->
  <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
    <div>
      <h1 class="text-2xl font-bold text-slate-900 flex items-center gap-2">
        <Trophy class="text-amber-500" size={28} />
        Leaderboard
      </h1>
      <p class="mt-1 text-slate-600">See how you stack up against your teammates</p>
    </div>

    <div class="flex bg-slate-100 rounded-lg p-1">
      <button
        class="px-4 py-2 text-sm font-medium rounded-md transition-colors
          {selectedPeriod === 'week' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}"
        on:click={() => selectedPeriod = 'week'}
      >
        Week
      </button>
      <button
        class="px-4 py-2 text-sm font-medium rounded-md transition-colors
          {selectedPeriod === 'month' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}"
        on:click={() => selectedPeriod = 'month'}
      >
        Month
      </button>
      <button
        class="px-4 py-2 text-sm font-medium rounded-md transition-colors
          {selectedPeriod === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}"
        on:click={() => selectedPeriod = 'all'}
      >
        All Time
      </button>
    </div>
  </div>

  {#if loading}
    <div class="flex items-center justify-center py-20">
      <div class="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
    </div>
  {:else}
    <!-- Your Rank Card -->
    {#if currentUserRank > 0}
      <div class="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl p-6 text-white">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-indigo-200 text-sm">Your Current Rank</p>
            <p class="text-4xl font-bold mt-1">#{currentUserRank}</p>
          </div>
          <div class="text-right">
            <div class="flex items-center gap-2">
              <Zap class="text-yellow-300" size={20} />
              <span class="text-2xl font-bold">
                {leaderboard.find(e => e.user.id === $user?.id)?.xp || 0} XP
              </span>
            </div>
            <p class="text-indigo-200 text-sm mt-1">
              {currentUserRank <= 3 ? 'Top performer!' : `${currentUserRank - 3} spots from top 3`}
            </p>
          </div>
        </div>
      </div>
    {/if}

    <!-- Top 3 Podium -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      {#each leaderboard.slice(0, 3) as entry, i}
        {@const style = getRankStyle(entry.rank)}
        <div class="bg-white rounded-xl border border-slate-200 p-6 {i === 0 ? 'md:order-2 md:-mt-4' : i === 1 ? 'md:order-1' : 'md:order-3'}">
          <div class="text-center">
            <div class="w-16 h-16 mx-auto {style.bg} rounded-full flex items-center justify-center mb-4">
              <svelte:component this={style.icon} class={style.text} size={32} />
            </div>
            <div class="w-14 h-14 mx-auto rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center -mt-10 border-4 border-white">
              <span class="text-lg font-bold text-white">
                {entry.user.full_name?.charAt(0) || entry.user.email.charAt(0).toUpperCase()}
              </span>
            </div>
            <h3 class="mt-3 font-semibold text-slate-900">{entry.user.full_name || 'Anonymous'}</h3>
            <p class="text-sm text-slate-500 capitalize">{entry.user.role}</p>

            <div class="mt-4 flex items-center justify-center gap-1">
              <Zap class="text-amber-500" size={16} />
              <span class="text-xl font-bold text-slate-900">{entry.xp.toLocaleString()}</span>
              <span class="text-sm text-slate-500">XP</span>
            </div>

            <div class="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div class="bg-slate-50 rounded-lg p-2">
                <p class="text-slate-500">Tasks</p>
                <p class="font-semibold text-slate-900">{entry.tasksCompleted}</p>
              </div>
              <div class="bg-slate-50 rounded-lg p-2">
                <p class="text-slate-500">Streak</p>
                <p class="font-semibold text-slate-900 flex items-center justify-center gap-1">
                  <Flame class="text-orange-500" size={12} />
                  {entry.streak}
                </p>
              </div>
            </div>
          </div>
        </div>
      {/each}
    </div>

    <!-- Full Leaderboard -->
    <div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div class="px-6 py-4 border-b border-slate-200">
        <h2 class="text-lg font-semibold text-slate-900">Full Rankings</h2>
      </div>

      <div class="divide-y divide-slate-100">
        {#each leaderboard as entry}
          <div class="px-6 py-4 flex items-center gap-4 hover:bg-slate-50 transition-colors {entry.user.id === $user?.id ? 'bg-indigo-50' : ''}">
            <div class="w-10 text-center">
              {#if entry.rank <= 3}
                {@const style = getRankStyle(entry.rank)}
                <div class="w-8 h-8 mx-auto {style.bg} rounded-full flex items-center justify-center">
                  <svelte:component this={style.icon} class={style.text} size={16} />
                </div>
              {:else}
                <span class="text-lg font-bold text-slate-400">#{entry.rank}</span>
              {/if}
            </div>

            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center">
              <span class="text-sm font-medium text-white">
                {entry.user.full_name?.charAt(0) || entry.user.email.charAt(0).toUpperCase()}
              </span>
            </div>

            <div class="flex-1 min-w-0">
              <p class="font-medium text-slate-900 truncate">
                {entry.user.full_name || 'Anonymous'}
                {#if entry.user.id === $user?.id}
                  <span class="ml-2 text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">You</span>
                {/if}
              </p>
              <p class="text-sm text-slate-500 capitalize">{entry.user.role} · Level {entry.user.level}</p>
            </div>

            <div class="flex items-center gap-6 text-sm">
              <div class="text-center">
                <p class="text-slate-500">XP</p>
                <p class="font-semibold text-slate-900">{entry.xp.toLocaleString()}</p>
              </div>
              <div class="text-center">
                <p class="text-slate-500">Tasks</p>
                <p class="font-semibold text-slate-900">{entry.tasksCompleted}</p>
              </div>
              <div class="text-center">
                <p class="text-slate-500">Streak</p>
                <p class="font-semibold text-slate-900 flex items-center justify-center gap-1">
                  <Flame class="text-orange-500" size={12} />
                  {entry.streak}
                </p>
              </div>
              <div class="text-center">
                <p class="text-slate-500">Earnings</p>
                <p class="font-semibold text-green-600">${entry.earnings.toLocaleString()}</p>
              </div>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

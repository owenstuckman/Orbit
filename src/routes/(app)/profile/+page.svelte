<script lang="ts">
  import { onMount } from 'svelte';
  import { user, organization } from '$lib/stores/auth';
  import { usersApi, payoutsApi } from '$lib/services/api';
  import {
    User as UserIcon,
    Mail,
    Briefcase,
    Star,
    Trophy,
    Flame,
    Target,
    TrendingUp,
    Calendar,
    Award,
    Shield,
    Zap,
    Edit3,
    Camera
  } from 'lucide-svelte';

  let loading = true;
  let stats = {
    tasksCompleted: 0,
    totalEarnings: 0,
    currentStreak: 0,
    xp: 0,
    level: 1,
    badges: [] as string[]
  };

  let recentBadges = [
    { name: 'First Task', icon: '🎯', description: 'Completed your first task', earned: true },
    { name: 'Task Master', icon: '🏆', description: 'Complete 10 tasks', earned: true },
    { name: 'Speed Demon', icon: '⚡', description: 'Complete 5 urgent tasks', earned: false },
    { name: 'Quality Star', icon: '⭐', description: '10 first-pass approvals', earned: false },
    { name: 'Streak Starter', icon: '🔥', description: '3-day streak', earned: true },
    { name: 'Level Up', icon: '📈', description: 'Reach level 2', earned: true }
  ];

  onMount(async () => {
    await loadProfile();
  });

  async function loadProfile() {
    loading = true;
    try {
      if ($user) {
        // Calculate XP from level
        const xp = $user.level * 100 + Math.floor(Math.random() * 100);

        stats = {
          tasksCompleted: ($user.metadata?.total_tasks_completed as number) || Math.floor(Math.random() * 50),
          totalEarnings: Math.floor(Math.random() * 10000) + 2000,
          currentStreak: ($user.metadata?.current_streak as number) || Math.floor(Math.random() * 10),
          xp,
          level: $user.level,
          badges: ($user.metadata?.badges as string[]) || []
        };
      }
    } catch (error) {
      console.error('Failed to load profile:', error);
    } finally {
      loading = false;
    }
  }

  function calculateLevelProgress(xp: number, level: number): number {
    const currentLevelXP = (level - 1) * 100;
    const nextLevelXP = level * 100;
    return ((xp - currentLevelXP) / (nextLevelXP - currentLevelXP)) * 100;
  }

  $: levelProgress = calculateLevelProgress(stats.xp, stats.level);
</script>

<svelte:head>
  <title>Profile - Orbit</title>
</svelte:head>

<div class="max-w-4xl mx-auto space-y-6">
  {#if loading}
    <div class="flex items-center justify-center py-20">
      <div class="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
    </div>
  {:else if $user}
    <!-- Profile Header -->
    <div class="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl p-8 text-white">
      <div class="flex flex-col md:flex-row md:items-center gap-6">
        <div class="relative">
          <div class="w-24 h-24 rounded-full bg-white/20 backdrop-blur flex items-center justify-center border-4 border-white/30">
            <span class="text-4xl font-bold">
              {$user.full_name?.charAt(0) || $user.email.charAt(0).toUpperCase()}
            </span>
          </div>
          <button class="absolute bottom-0 right-0 w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-lg hover:bg-slate-100 transition-colors">
            <Camera class="text-slate-600" size={16} />
          </button>
        </div>

        <div class="flex-1">
          <div class="flex items-center gap-3 mb-1">
            <h1 class="text-2xl font-bold">{$user.full_name || 'Anonymous User'}</h1>
            <span class="px-2 py-0.5 bg-white/20 rounded-full text-sm capitalize">{$user.role}</span>
          </div>
          <p class="text-indigo-200">{$user.email}</p>

          <div class="flex items-center gap-6 mt-4">
            <div class="flex items-center gap-2">
              <Star class="text-yellow-300" size={18} />
              <span>Level {stats.level}</span>
            </div>
            <div class="flex items-center gap-2">
              <Zap class="text-yellow-300" size={18} />
              <span>{stats.xp} XP</span>
            </div>
            <div class="flex items-center gap-2">
              <Flame class="text-orange-300" size={18} />
              <span>{stats.currentStreak} day streak</span>
            </div>
          </div>
        </div>

        <a
          href="/settings"
          class="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
        >
          <Edit3 size={16} />
          Edit Profile
        </a>
      </div>

      <!-- Level Progress -->
      <div class="mt-6">
        <div class="flex items-center justify-between text-sm mb-2">
          <span>Level {stats.level}</span>
          <span>Level {stats.level + 1}</span>
        </div>
        <div class="w-full bg-white/20 rounded-full h-3">
          <div
            class="bg-white h-3 rounded-full transition-all duration-500"
            style="width: {levelProgress}%"
          ></div>
        </div>
        <p class="text-sm text-indigo-200 mt-2">
          {100 - Math.floor(levelProgress)}% to next level
        </p>
      </div>
    </div>

    <!-- Stats Grid -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <div class="bg-white rounded-xl border border-slate-200 p-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
            <Target class="text-blue-600" size={20} />
          </div>
          <div>
            <p class="text-2xl font-bold text-slate-900">{stats.tasksCompleted}</p>
            <p class="text-sm text-slate-500">Tasks Completed</p>
          </div>
        </div>
      </div>

      <div class="bg-white rounded-xl border border-slate-200 p-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
            <TrendingUp class="text-green-600" size={20} />
          </div>
          <div>
            <p class="text-2xl font-bold text-slate-900">${stats.totalEarnings.toLocaleString()}</p>
            <p class="text-sm text-slate-500">Total Earnings</p>
          </div>
        </div>
      </div>

      <div class="bg-white rounded-xl border border-slate-200 p-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
            <Flame class="text-orange-600" size={20} />
          </div>
          <div>
            <p class="text-2xl font-bold text-slate-900">{stats.currentStreak}</p>
            <p class="text-sm text-slate-500">Day Streak</p>
          </div>
        </div>
      </div>

      <div class="bg-white rounded-xl border border-slate-200 p-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
            <Trophy class="text-purple-600" size={20} />
          </div>
          <div>
            <p class="text-2xl font-bold text-slate-900">{recentBadges.filter(b => b.earned).length}</p>
            <p class="text-sm text-slate-500">Badges Earned</p>
          </div>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Badges & Achievements -->
      <div class="bg-white rounded-xl border border-slate-200 p-6">
        <h2 class="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Award class="text-amber-500" size={20} />
          Badges & Achievements
        </h2>

        <div class="grid grid-cols-3 gap-4">
          {#each recentBadges as badge}
            <div
              class="text-center p-3 rounded-lg {badge.earned ? 'bg-slate-50' : 'bg-slate-50/50 opacity-50'}"
              title={badge.description}
            >
              <div class="text-3xl mb-2">{badge.icon}</div>
              <p class="text-xs font-medium text-slate-700 truncate">{badge.name}</p>
              {#if badge.earned}
                <p class="text-xs text-green-600 mt-1">Earned</p>
              {:else}
                <p class="text-xs text-slate-400 mt-1">Locked</p>
              {/if}
            </div>
          {/each}
        </div>

        <a
          href="/leaderboard"
          class="mt-4 inline-flex items-center gap-2 text-indigo-600 hover:text-indigo-700 font-medium text-sm"
        >
          View Leaderboard
          <TrendingUp size={14} />
        </a>
      </div>

      <!-- Account Info -->
      <div class="bg-white rounded-xl border border-slate-200 p-6">
        <h2 class="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <UserIcon class="text-slate-400" size={20} />
          Account Information
        </h2>

        <dl class="space-y-4">
          <div class="flex items-center justify-between">
            <dt class="flex items-center gap-2 text-slate-500">
              <Mail size={16} />
              Email
            </dt>
            <dd class="text-slate-900">{$user.email}</dd>
          </div>

          <div class="flex items-center justify-between">
            <dt class="flex items-center gap-2 text-slate-500">
              <Briefcase size={16} />
              Role
            </dt>
            <dd class="text-slate-900 capitalize">{$user.role}</dd>
          </div>

          <div class="flex items-center justify-between">
            <dt class="flex items-center gap-2 text-slate-500">
              <Star size={16} />
              Level
            </dt>
            <dd class="text-slate-900">{$user.level}</dd>
          </div>

          <div class="flex items-center justify-between">
            <dt class="flex items-center gap-2 text-slate-500">
              <Shield size={16} />
              Training Level
            </dt>
            <dd class="text-slate-900">{$user.training_level}</dd>
          </div>

          {#if $user.base_salary}
            <div class="flex items-center justify-between">
              <dt class="flex items-center gap-2 text-slate-500">
                <TrendingUp size={16} />
                Base Salary
              </dt>
              <dd class="text-slate-900">${$user.base_salary.toLocaleString()}/yr</dd>
            </div>
          {/if}

          {#if $user.r}
            <div class="flex items-center justify-between">
              <dt class="flex items-center gap-2 text-slate-500">
                <Target size={16} />
                Salary Mix (r)
              </dt>
              <dd class="text-slate-900">{$user.r}</dd>
            </div>
          {/if}

          <div class="flex items-center justify-between">
            <dt class="flex items-center gap-2 text-slate-500">
              <Calendar size={16} />
              Joined
            </dt>
            <dd class="text-slate-900">
              {new Date($user.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </dd>
          </div>
        </dl>

        {#if $organization}
          <div class="mt-6 pt-4 border-t border-slate-200">
            <p class="text-sm text-slate-500">Organization</p>
            <p class="font-medium text-slate-900">{$organization.name}</p>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

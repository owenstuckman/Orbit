<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { user, organization } from '$lib/stores/auth';
  import { usersApi, payoutsApi, tasksApi } from '$lib/services/api';
  import { toasts } from '$lib/stores/notifications';
  import { storage } from '$lib/services/supabase';
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
    Camera,
    CheckCircle,
    Clock,
    DollarSign,
    Building,
    Hash,
    Loader2
  } from 'lucide-svelte';

  let loading = true;
  let uploadingAvatar = false;
  let avatarInput: HTMLInputElement;

  // Stats loaded from API
  let stats = {
    tasksCompleted: 0,
    tasksInProgress: 0,
    totalEarnings: 0,
    pendingEarnings: 0,
    currentStreak: 0,
    qcPassRate: 0,
    xp: 0,
    level: 1
  };

  // Badges from user metadata
  let badges: { name: string; icon: string; description: string; earned: boolean }[] = [];

  // Activity summary
  let recentActivity: { type: string; description: string; date: string }[] = [];

  const defaultBadges = [
    { name: 'First Task', icon: '🎯', description: 'Completed your first task', key: 'first_task' },
    { name: 'Task Master', icon: '🏆', description: 'Complete 10 tasks', key: 'task_master_10' },
    { name: 'Speed Demon', icon: '⚡', description: 'Complete 5 urgent tasks', key: 'speed_demon' },
    { name: 'Quality Star', icon: '⭐', description: '10 first-pass approvals', key: 'quality_star' },
    { name: 'Streak Starter', icon: '🔥', description: '3-day streak', key: 'streak_3' },
    { name: 'Level Up', icon: '📈', description: 'Reach level 2', key: 'level_2' },
    { name: 'High Roller', icon: '💰', description: 'Earn $1,000+', key: 'earnings_1000' },
    { name: 'Team Player', icon: '🤝', description: 'Help on 5 projects', key: 'projects_5' },
    { name: 'Perfectionist', icon: '💎', description: '100% QC pass rate (10+ tasks)', key: 'perfect_qc' }
  ];

  onMount(async () => {
    await loadProfile();
  });

  async function loadProfile() {
    loading = true;
    try {
      if (!$user) return;

      // Load tasks for this user
      const userTasks = await tasksApi.list({ eq: { assignee_id: $user.id } });

      const completedTasks = userTasks.filter(t =>
        ['completed', 'under_review', 'approved', 'paid'].includes(t.status)
      );
      const inProgressTasks = userTasks.filter(t =>
        ['assigned', 'in_progress'].includes(t.status)
      );
      const approvedTasks = userTasks.filter(t =>
        ['approved', 'paid'].includes(t.status)
      );

      // Calculate QC pass rate
      const tasksWithReviews = userTasks.filter(t => t.qc_reviews && t.qc_reviews.length > 0);
      const passedFirstTime = tasksWithReviews.filter(t => {
        const firstReview = t.qc_reviews?.find(r => r.pass_number === 1);
        return firstReview?.passed === true;
      });
      const qcPassRate = tasksWithReviews.length > 0
        ? (passedFirstTime.length / tasksWithReviews.length) * 100
        : 0;

      // Load payout summary
      const payoutSummary = await payoutsApi.getSummary($user.id);

      // Calculate XP (simplified: level * 100 base + tasks * 10)
      const xp = ($user.level - 1) * 100 + completedTasks.length * 10;

      stats = {
        tasksCompleted: completedTasks.length,
        tasksInProgress: inProgressTasks.length,
        totalEarnings: payoutSummary.total,
        pendingEarnings: payoutSummary.pending,
        currentStreak: ($user.metadata?.current_streak as number) || 0,
        qcPassRate: Math.round(qcPassRate),
        xp,
        level: $user.level
      };

      // Map user badges to display format
      const userBadges = ($user.metadata?.badges as string[]) || [];
      badges = defaultBadges.map(badge => ({
        ...badge,
        earned: userBadges.includes(badge.key) || checkBadgeEarned(badge.key, stats, $user.level)
      }));

      // Build recent activity
      recentActivity = buildRecentActivity(userTasks);

    } catch (error) {
      console.error('Failed to load profile:', error);
      toasts.error('Failed to load profile data');
    } finally {
      loading = false;
    }
  }

  function checkBadgeEarned(key: string, userStats: { tasksCompleted: number; currentStreak: number; totalEarnings: number; qcPassRate: number }, level: number): boolean {
    switch (key) {
      case 'first_task': return userStats.tasksCompleted >= 1;
      case 'task_master_10': return userStats.tasksCompleted >= 10;
      case 'streak_3': return userStats.currentStreak >= 3;
      case 'level_2': return level >= 2;
      case 'earnings_1000': return userStats.totalEarnings >= 1000;
      case 'quality_star': return userStats.qcPassRate >= 90 && userStats.tasksCompleted >= 10;
      case 'perfect_qc': return userStats.qcPassRate === 100 && userStats.tasksCompleted >= 10;
      default: return false;
    }
  }

  function buildRecentActivity(tasks: any[]): typeof recentActivity {
    const activities: typeof recentActivity = [];

    // Get recently completed tasks
    const sortedTasks = [...tasks]
      .filter(t => t.completed_at)
      .sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime())
      .slice(0, 5);

    sortedTasks.forEach(task => {
      activities.push({
        type: 'task',
        description: `Completed "${task.title}"`,
        date: task.completed_at
      });
    });

    return activities;
  }

  function calculateLevelProgress(xp: number, level: number): number {
    const currentLevelXP = (level - 1) * 100;
    const nextLevelXP = level * 100;
    const progress = ((xp - currentLevelXP) / (nextLevelXP - currentLevelXP)) * 100;
    return Math.min(100, Math.max(0, progress));
  }

  function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  }

  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  function formatRelativeDate(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return formatDate(dateString);
  }

  async function handleAvatarUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !$user) return;

    // Validate file
    if (!file.type.startsWith('image/')) {
      toasts.error('Please select an image file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toasts.error('Image must be less than 5MB');
      return;
    }

    uploadingAvatar = true;
    try {
      const ext = file.name.split('.').pop();
      const path = `${$user.id}/avatar.${ext}`;

      const { error } = await storage.uploadFile('avatars', path, file, {
        upsert: true,
        contentType: file.type
      });

      if (error) throw error;

      // Update user metadata with avatar path
      await usersApi.update($user.id, {
        metadata: {
          ...$user.metadata,
          avatar_path: path
        }
      });

      toasts.success('Avatar updated');
      await user.load(); // Reload user to get updated metadata
    } catch (error) {
      console.error('Avatar upload failed:', error);
      toasts.error('Failed to upload avatar');
    } finally {
      uploadingAvatar = false;
      input.value = '';
    }
  }

  $: levelProgress = calculateLevelProgress(stats.xp, stats.level);
  $: earnedBadgesCount = badges.filter(b => b.earned).length;
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
          <div class="w-24 h-24 rounded-full bg-white/20 backdrop-blur flex items-center justify-center border-4 border-white/30 overflow-hidden">
            {#if $user.metadata?.avatar_path}
              <img
                src={storage.getPublicUrl('avatars', String($user.metadata.avatar_path))}
                alt="Avatar"
                class="w-full h-full object-cover"
              />
            {:else}
              <span class="text-4xl font-bold">
                {$user.full_name?.charAt(0) || $user.email.charAt(0).toUpperCase()}
              </span>
            {/if}
          </div>
          <input
            type="file"
            accept="image/*"
            bind:this={avatarInput}
            on:change={handleAvatarUpload}
            class="hidden"
          />
          <button
            on:click={() => avatarInput?.click()}
            disabled={uploadingAvatar}
            class="absolute bottom-0 right-0 w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-lg hover:bg-slate-100 transition-colors disabled:opacity-50"
          >
            {#if uploadingAvatar}
              <Loader2 class="text-slate-600 animate-spin" size={16} />
            {:else}
              <Camera class="text-slate-600" size={16} />
            {/if}
          </button>
        </div>

        <div class="flex-1">
          <div class="flex items-center gap-3 mb-1">
            <h1 class="text-2xl font-bold">{$user.full_name || 'Anonymous User'}</h1>
            <span class="px-2 py-0.5 bg-white/20 rounded-full text-sm capitalize">{$user.role}</span>
          </div>
          <p class="text-indigo-200">{$user.email}</p>

          <div class="flex flex-wrap items-center gap-4 md:gap-6 mt-4">
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
            <div class="flex items-center gap-2">
              <CheckCircle class="text-green-300" size={18} />
              <span>{stats.qcPassRate}% QC pass</span>
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
          {Math.round(100 - levelProgress)}% to next level ({100 - (stats.xp % 100)} XP needed)
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
          <div class="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
            <Clock class="text-amber-600" size={20} />
          </div>
          <div>
            <p class="text-2xl font-bold text-slate-900">{stats.tasksInProgress}</p>
            <p class="text-sm text-slate-500">In Progress</p>
          </div>
        </div>
      </div>

      <div class="bg-white rounded-xl border border-slate-200 p-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
            <DollarSign class="text-green-600" size={20} />
          </div>
          <div>
            <p class="text-2xl font-bold text-slate-900">{formatCurrency(stats.totalEarnings)}</p>
            <p class="text-sm text-slate-500">Total Earned</p>
          </div>
        </div>
      </div>

      <div class="bg-white rounded-xl border border-slate-200 p-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
            <Trophy class="text-purple-600" size={20} />
          </div>
          <div>
            <p class="text-2xl font-bold text-slate-900">{earnedBadgesCount}</p>
            <p class="text-sm text-slate-500">Badges Earned</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Pending Earnings Banner -->
    {#if stats.pendingEarnings > 0}
      <div class="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
            <Clock class="text-amber-600" size={20} />
          </div>
          <div>
            <p class="font-medium text-amber-900">Pending Payouts</p>
            <p class="text-sm text-amber-700">{formatCurrency(stats.pendingEarnings)} awaiting approval</p>
          </div>
        </div>
        <a
          href="/payouts"
          class="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors text-sm font-medium"
        >
          View Payouts
        </a>
      </div>
    {/if}

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Badges & Achievements -->
      <div class="bg-white rounded-xl border border-slate-200 p-6">
        <h2 class="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Award class="text-amber-500" size={20} />
          Badges & Achievements
        </h2>

        <div class="grid grid-cols-3 gap-3">
          {#each badges as badge}
            <div
              class="text-center p-3 rounded-lg transition-all {badge.earned ? 'bg-slate-50 hover:bg-slate-100' : 'bg-slate-50/50 opacity-40'}"
              title={badge.description}
            >
              <div class="text-2xl mb-1">{badge.icon}</div>
              <p class="text-xs font-medium text-slate-700 truncate">{badge.name}</p>
              {#if badge.earned}
                <p class="text-xs text-green-600 mt-0.5">Earned</p>
              {:else}
                <p class="text-xs text-slate-400 mt-0.5">Locked</p>
              {/if}
            </div>
          {/each}
        </div>

        <div class="mt-4 pt-4 border-t border-slate-200 flex items-center justify-between">
          <span class="text-sm text-slate-600">{earnedBadgesCount} of {badges.length} badges earned</span>
          <a
            href="/achievements"
            class="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-700 font-medium text-sm"
          >
            View All
            <TrendingUp size={14} />
          </a>
        </div>
      </div>

      <!-- Account Info -->
      <div class="bg-white rounded-xl border border-slate-200 p-6">
        <h2 class="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <UserIcon class="text-slate-400" size={20} />
          Account Information
        </h2>

        <dl class="space-y-3">
          <div class="flex items-center justify-between py-2 border-b border-slate-100">
            <dt class="flex items-center gap-2 text-slate-500 text-sm">
              <Mail size={14} />
              Email
            </dt>
            <dd class="text-slate-900 text-sm font-medium">{$user.email}</dd>
          </div>

          <div class="flex items-center justify-between py-2 border-b border-slate-100">
            <dt class="flex items-center gap-2 text-slate-500 text-sm">
              <Briefcase size={14} />
              Role
            </dt>
            <dd class="text-slate-900 text-sm font-medium capitalize">{$user.role}</dd>
          </div>

          <div class="flex items-center justify-between py-2 border-b border-slate-100">
            <dt class="flex items-center gap-2 text-slate-500 text-sm">
              <Star size={14} />
              Level
            </dt>
            <dd class="text-slate-900 text-sm font-medium">{$user.level}</dd>
          </div>

          <div class="flex items-center justify-between py-2 border-b border-slate-100">
            <dt class="flex items-center gap-2 text-slate-500 text-sm">
              <Shield size={14} />
              Training Level
            </dt>
            <dd class="text-slate-900 text-sm font-medium">{$user.training_level}</dd>
          </div>

          {#if $user.base_salary}
            <div class="flex items-center justify-between py-2 border-b border-slate-100">
              <dt class="flex items-center gap-2 text-slate-500 text-sm">
                <DollarSign size={14} />
                Base Salary
              </dt>
              <dd class="text-slate-900 text-sm font-medium">{formatCurrency($user.base_salary)}/yr</dd>
            </div>
          {/if}

          {#if $user.r !== null && $user.r !== undefined}
            <div class="flex items-center justify-between py-2 border-b border-slate-100">
              <dt class="flex items-center gap-2 text-slate-500 text-sm">
                <Target size={14} />
                Salary Mix (r)
              </dt>
              <dd class="text-slate-900 text-sm font-medium">{($user.r * 100).toFixed(0)}%</dd>
            </div>
          {/if}

          <div class="flex items-center justify-between py-2 border-b border-slate-100">
            <dt class="flex items-center gap-2 text-slate-500 text-sm">
              <Hash size={14} />
              User ID
            </dt>
            <dd class="text-slate-500 text-xs font-mono">{$user.id.slice(0, 8)}...</dd>
          </div>

          <div class="flex items-center justify-between py-2">
            <dt class="flex items-center gap-2 text-slate-500 text-sm">
              <Calendar size={14} />
              Member Since
            </dt>
            <dd class="text-slate-900 text-sm font-medium">{formatDate($user.created_at)}</dd>
          </div>
        </dl>

        {#if $organization}
          <div class="mt-4 pt-4 border-t border-slate-200">
            <div class="flex items-center gap-2 text-slate-500 text-sm mb-1">
              <Building size={14} />
              Organization
            </div>
            <p class="font-medium text-slate-900">{$organization.name}</p>
          </div>
        {/if}
      </div>
    </div>

    <!-- Recent Activity -->
    {#if recentActivity.length > 0}
      <div class="bg-white rounded-xl border border-slate-200 p-6">
        <h2 class="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Clock class="text-slate-400" size={20} />
          Recent Activity
        </h2>

        <div class="space-y-3">
          {#each recentActivity as activity}
            <div class="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
              <div class="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle class="text-green-600" size={16} />
              </div>
              <div class="flex-1">
                <p class="text-sm text-slate-900">{activity.description}</p>
                <p class="text-xs text-slate-500">{formatRelativeDate(activity.date)}</p>
              </div>
            </div>
          {/each}
        </div>

        <a
          href="/tasks"
          class="mt-4 inline-flex items-center gap-2 text-indigo-600 hover:text-indigo-700 font-medium text-sm"
        >
          View All Tasks
          <TrendingUp size={14} />
        </a>
      </div>
    {/if}

    <!-- Quick Actions -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <a
        href="/tasks"
        class="flex items-center gap-3 p-4 bg-white rounded-xl border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all"
      >
        <div class="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
          <Target class="text-indigo-600" size={20} />
        </div>
        <div>
          <p class="font-medium text-slate-900">Find Tasks</p>
          <p class="text-sm text-slate-500">Browse available work</p>
        </div>
      </a>

      <a
        href="/settings"
        class="flex items-center gap-3 p-4 bg-white rounded-xl border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all"
      >
        <div class="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
          <Edit3 class="text-slate-600" size={20} />
        </div>
        <div>
          <p class="font-medium text-slate-900">Edit Settings</p>
          <p class="text-sm text-slate-500">Update your preferences</p>
        </div>
      </a>

      <a
        href="/leaderboard"
        class="flex items-center gap-3 p-4 bg-white rounded-xl border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all"
      >
        <div class="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
          <Trophy class="text-amber-600" size={20} />
        </div>
        <div>
          <p class="font-medium text-slate-900">Leaderboard</p>
          <p class="text-sm text-slate-500">See top performers</p>
        </div>
      </a>
    </div>
  {/if}
</div>

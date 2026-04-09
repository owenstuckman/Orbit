<script lang="ts">
  import { onMount } from 'svelte';
  import { user, capabilities, organization, currentOrgRole } from '$lib/stores/auth';
  import { tasks } from '$lib/stores/tasks';
  import { projects } from '$lib/stores/projects';
  import { payoutsApi, qcApi, usersApi } from '$lib/services/api';
  import { formatCurrency, calculateSalaryBreakdown } from '$lib/utils/payout';
  import { featureFlags } from '$lib/stores/featureFlags';
  import { notifications, unreadCount } from '$lib/stores/notifications';
  import {
    TrendingUp,
    CheckCircle,
    Clock,
    DollarSign,
    Target,
    AlertTriangle,
    ArrowUpRight,
    Users,
    FolderKanban,
    Shield,
    Zap,
    Star,
    Award,
    BarChart3,
    FileText,
    ExternalLink,
    Bell,
    Flame,
    ChevronRight
  } from 'lucide-svelte';
  import type { Task, User as UserType } from '$lib/types';

  // Common data
  let stats = {
    tasksCompleted: 0,
    tasksInProgress: 0,
    tasksOpen: 0,
    totalEarnings: 0,
    pendingPayouts: 0,
    qcPassRate: 0,
    currentStreak: 0
  };
  let recentTasks: Task[] = [];
  let salaryBreakdown: any = null;
  let loading = true;

  // PM data
  let pmStats = {
    projectsManaged: 0,
    budgetUtilization: 0,
    overdraftRisk: 0,
    totalBudget: 0,
    totalSpent: 0,
    tasksUnderReview: 0
  };

  // QC data
  let qcStats = {
    reviewsCompleted: 0,
    pendingReviews: 0,
    avgConfidence: 0,
    qcEarnings: 0
  };
  let pendingQCTasks: Task[] = [];

  // Sales data
  let salesStats = {
    projectsSold: 0,
    totalSalesValue: 0,
    pendingProjects: 0,
    commissionEarned: 0,
    activeProjects: 0
  };

  // Admin data
  let adminStats = {
    totalUsers: 0,
    totalTasks: 0,
    activeProjects: 0,
    totalValue: 0,
    totalSpent: 0,
    pendingQC: 0,
    openTasks: 0,
    completedTasks: 0
  };
  let orgMembers: UserType[] = [];

  onMount(async () => {
    if (!$user) return;

    try {
      const payoutSummary = await payoutsApi.getSummary($user.id, 'month');
      stats.totalEarnings = payoutSummary.total;
      stats.pendingPayouts = payoutSummary.pending;
      stats.currentStreak = $user.metadata?.current_streak || 0;
      stats.tasksCompleted = $user.metadata?.total_tasks_completed || 0;

      if ($user.base_salary && $user.r != null) {
        const monthlyTaskValue = payoutSummary.byType.task || 0;
        salaryBreakdown = calculateSalaryBreakdown(
          $user.base_salary / 12,
          $user.r,
          monthlyTaskValue
        );
      }

      const role = $currentOrgRole;

      if (role === 'employee' || role === 'contractor') {
        await tasks.loadByAssignee($user.id);
        const items = $tasks.items;
        stats.tasksCompleted = items.filter(t => t.status === 'approved' || t.status === 'paid').length;
        stats.tasksInProgress = items.filter(t => t.status === 'in_progress' || t.status === 'assigned').length;
        stats.tasksOpen = items.filter(t => t.status === 'under_review').length;
        recentTasks = items.slice(0, 6);
      }

      if (role === 'pm') {
        await Promise.all([projects.loadByPM($user.id), tasks.load()]);
        const activeProjects = $projects.items.filter(p => p.status === 'active');
        pmStats.projectsManaged = activeProjects.length;
        pmStats.totalBudget = $projects.items.reduce((s, p) => s + p.total_value, 0);
        pmStats.totalSpent = $projects.items.reduce((s, p) => s + (p.spent || 0), 0);
        pmStats.budgetUtilization = pmStats.totalBudget > 0
          ? (pmStats.totalSpent / pmStats.totalBudget) * 100 : 0;
        pmStats.overdraftRisk = $projects.items.filter(p => p.total_value > 0 && (p.spent || 0) / p.total_value > 0.9).length;
        pmStats.tasksUnderReview = $tasks.items.filter(t => t.status === 'under_review').length;
      }

      if (role === 'qc') {
        pendingQCTasks = await qcApi.listPending();
        qcStats.pendingReviews = pendingQCTasks.length;
        qcStats.reviewsCompleted = Number($user.metadata?.reviews_completed) || 0;
        qcStats.avgConfidence = (Number($user.metadata?.avg_confidence) || 0) * 100;
        qcStats.qcEarnings = payoutSummary.byType.qc || stats.totalEarnings;
      }

      if (role === 'sales') {
        await projects.loadBySales($user.id);
        salesStats.projectsSold = $projects.items.filter(p => p.status !== 'draft').length;
        salesStats.totalSalesValue = $projects.items.reduce((s, p) => s + p.total_value, 0);
        salesStats.pendingProjects = $projects.items.filter(p => p.status === 'pending_pm').length;
        salesStats.activeProjects = $projects.items.filter(p => p.status === 'active').length;
        salesStats.commissionEarned = payoutSummary.byType.sales_commission || 0;
      }

      if (role === 'admin') {
        const [, , members] = await Promise.all([
          tasks.load(),
          projects.load(),
          usersApi.list({ eq: { org_id: $user.org_id } }).catch(() => [] as typeof orgMembers)
        ]);
        const allTasks = $tasks.items;
        const allProjects = $projects.items;
        orgMembers = members;
        adminStats.totalUsers = members.length;
        adminStats.totalTasks = allTasks.length;
        adminStats.activeProjects = allProjects.filter(p => p.status === 'active').length;
        adminStats.totalValue = allProjects.reduce((s, p) => s + p.total_value, 0);
        adminStats.totalSpent = allProjects.reduce((s, p) => s + (p.spent || 0), 0);
        adminStats.pendingQC = allTasks.filter(t => t.status === 'under_review').length;
        adminStats.openTasks = allTasks.filter(t => t.status === 'open').length;
        adminStats.completedTasks = allTasks.filter(t => t.status === 'approved' || t.status === 'paid').length;
      }

    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      loading = false;
    }
  });

  function getStatusColor(status: string): string {
    const colors: Record<string, string> = {
      approved: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
      paid: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
      in_progress: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
      assigned: 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300',
      under_review: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
      rejected: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
      open: 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300',
      completed: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
    };
    return colors[status] || colors.open;
  }

  function getRoleBadge(role: string): string {
    const badges: Record<string, string> = {
      admin: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
      pm: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
      qc: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
      sales: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
      employee: 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300',
      contractor: 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300',
    };
    return badges[role] || badges.employee;
  }
</script>

<div class="space-y-6">
  <!-- Header -->
  <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
    <div>
      <h1 class="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
        Welcome back, {$user?.full_name?.split(' ')[0] || 'there'}
      </h1>
      <p class="mt-1 text-sm sm:text-base text-slate-500 dark:text-slate-400">
        {#if $currentOrgRole === 'admin'}
          Organization overview for <span class="font-medium text-slate-700 dark:text-slate-300">{$organization?.name}</span>
        {:else if $currentOrgRole === 'pm'}
          Your projects and team at a glance
        {:else if $currentOrgRole === 'qc'}
          Quality control dashboard
        {:else if $currentOrgRole === 'sales'}
          Sales pipeline overview
        {:else}
          Here's your work summary
        {/if}
      </p>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      {#if $user?.level}
        <div class="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/20 rounded-full">
          <Star size={14} class="text-indigo-500" />
          <span class="text-sm font-semibold text-indigo-700 dark:text-indigo-300">Level {$user.level}</span>
        </div>
      {/if}
      {#if $user?.training_level}
        <div class="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 dark:bg-amber-900/20 rounded-full">
          <Zap size={14} class="text-amber-500" />
          <span class="text-sm font-semibold text-amber-700 dark:text-amber-300">Training Lv.{$user.training_level}</span>
        </div>
      {/if}
      {#if stats.currentStreak > 0}
        <div class="flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 dark:bg-orange-900/20 rounded-full">
          <Flame size={14} class="text-orange-500" />
          <span class="text-sm font-semibold text-orange-700 dark:text-orange-300">{stats.currentStreak}d streak</span>
        </div>
      {/if}
    </div>
  </div>

  {#if loading}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {#each Array(4) as _}
        <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 animate-pulse">
          <div class="h-3 bg-slate-200 dark:bg-slate-700 rounded w-20 mb-3"></div>
          <div class="h-7 bg-slate-200 dark:bg-slate-700 rounded w-28"></div>
        </div>
      {/each}
    </div>
  {:else}

    <!-- ==================== EMPLOYEE / CONTRACTOR ==================== -->
    {#if $currentOrgRole === 'employee' || $currentOrgRole === 'contractor'}
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-9 h-9 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
              <CheckCircle class="text-green-600 dark:text-green-400" size={18} />
            </div>
            <p class="text-sm text-slate-500 dark:text-slate-400">Completed</p>
          </div>
          <p class="text-2xl font-bold text-slate-900 dark:text-white">{stats.tasksCompleted}</p>
        </div>

        <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-9 h-9 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
              <Clock class="text-blue-600 dark:text-blue-400" size={18} />
            </div>
            <p class="text-sm text-slate-500 dark:text-slate-400">In Progress</p>
          </div>
          <p class="text-2xl font-bold text-slate-900 dark:text-white">{stats.tasksInProgress}</p>
        </div>

        <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-9 h-9 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center">
              <DollarSign class="text-indigo-600 dark:text-indigo-400" size={18} />
            </div>
            <p class="text-sm text-slate-500 dark:text-slate-400">Earnings</p>
          </div>
          <p class="text-2xl font-bold text-slate-900 dark:text-white">{formatCurrency(stats.totalEarnings)}</p>
          {#if stats.pendingPayouts > 0}
            <p class="text-xs text-amber-600 dark:text-amber-400 mt-1">{formatCurrency(stats.pendingPayouts)} pending</p>
          {/if}
        </div>

        <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-9 h-9 bg-amber-100 dark:bg-amber-900/30 rounded-lg flex items-center justify-center">
              <Shield class="text-amber-600 dark:text-amber-400" size={18} />
            </div>
            <p class="text-sm text-slate-500 dark:text-slate-400">Under Review</p>
          </div>
          <p class="text-2xl font-bold text-slate-900 dark:text-white">{stats.tasksOpen}</p>
        </div>
      </div>

      <!-- Salary Breakdown -->
      {#if salaryBreakdown}
        <div class="bg-gradient-to-r from-indigo-600 to-violet-600 rounded-xl p-5 text-white">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-semibold">Monthly Compensation</h3>
            <a href="/settings" class="text-xs text-white/70 hover:text-white">Adjust mix &rarr;</a>
          </div>
          <div class="grid grid-cols-3 gap-4">
            <div>
              <p class="text-indigo-200 text-xs">Base (r={(($user?.r || 0.7) * 100).toFixed(0)}%)</p>
              <p class="text-xl font-bold mt-0.5">{formatCurrency(salaryBreakdown.base)}</p>
            </div>
            <div>
              <p class="text-indigo-200 text-xs">Task Earnings</p>
              <p class="text-xl font-bold mt-0.5">{formatCurrency(salaryBreakdown.tasks)}</p>
            </div>
            <div>
              <p class="text-indigo-200 text-xs">Total</p>
              <p class="text-xl font-bold mt-0.5">{formatCurrency(salaryBreakdown.total)}</p>
            </div>
          </div>
        </div>
      {/if}

      <!-- Recent Tasks -->
      {#if recentTasks.length > 0}
        <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
          <div class="px-5 py-3.5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <h3 class="font-semibold text-slate-900 dark:text-white text-sm">Your Tasks</h3>
            <a href="/tasks" class="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 font-medium">View all &rarr;</a>
          </div>
          <div class="divide-y divide-slate-100 dark:divide-slate-700">
            {#each recentTasks as task}
              <a href="/tasks/{task.id}" class="flex items-center justify-between px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors group">
                <div class="min-w-0 flex-1">
                  <p class="font-medium text-sm text-slate-900 dark:text-white truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400">{task.title}</p>
                  <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {task.project?.name || 'No project'} &middot; {formatCurrency(task.dollar_value)}
                    {#if task.story_points} &middot; {task.story_points} SP{/if}
                  </p>
                </div>
                <span class="ml-3 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium {getStatusColor(task.status)}">
                  {task.status.replace('_', ' ')}
                </span>
              </a>
            {/each}
          </div>
        </div>
      {:else}
        <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-10 text-center">
          <Target class="mx-auto text-slate-300 dark:text-slate-600 mb-3" size={40} />
          <p class="text-slate-600 dark:text-slate-400 font-medium">No tasks yet</p>
          <a href="/tasks" class="inline-flex items-center gap-1 mt-3 text-sm text-indigo-600 dark:text-indigo-400 font-medium hover:text-indigo-700">
            Browse available tasks <ChevronRight size={14} />
          </a>
        </div>
      {/if}
    {/if}

    <!-- ==================== PM DASHBOARD ==================== -->
    {#if $currentOrgRole === 'pm'}
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-9 h-9 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
              <FolderKanban class="text-blue-600 dark:text-blue-400" size={18} />
            </div>
            <p class="text-sm text-slate-500 dark:text-slate-400">Active Projects</p>
          </div>
          <p class="text-2xl font-bold text-slate-900 dark:text-white">{pmStats.projectsManaged}</p>
        </div>

        <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-9 h-9 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
              <DollarSign class="text-green-600 dark:text-green-400" size={18} />
            </div>
            <p class="text-sm text-slate-500 dark:text-slate-400">Budget</p>
          </div>
          <p class="text-2xl font-bold text-slate-900 dark:text-white">{formatCurrency(pmStats.totalBudget)}</p>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">{formatCurrency(pmStats.totalSpent)} spent ({pmStats.budgetUtilization.toFixed(0)}%)</p>
        </div>

        <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-9 h-9 bg-amber-100 dark:bg-amber-900/30 rounded-lg flex items-center justify-center">
              <Shield class="text-amber-600 dark:text-amber-400" size={18} />
            </div>
            <p class="text-sm text-slate-500 dark:text-slate-400">Under Review</p>
          </div>
          <p class="text-2xl font-bold text-slate-900 dark:text-white">{pmStats.tasksUnderReview}</p>
        </div>

        <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-9 h-9 {pmStats.overdraftRisk > 0 ? 'bg-red-100 dark:bg-red-900/30' : 'bg-green-100 dark:bg-green-900/30'} rounded-lg flex items-center justify-center">
              <AlertTriangle class="{pmStats.overdraftRisk > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}" size={18} />
            </div>
            <p class="text-sm text-slate-500 dark:text-slate-400">Overdraft Risk</p>
          </div>
          <p class="text-2xl font-bold text-slate-900 dark:text-white">{pmStats.overdraftRisk}</p>
          <p class="text-xs text-slate-500 mt-1">{pmStats.overdraftRisk > 0 ? 'projects > 90% budget' : 'all projects on track'}</p>
        </div>
      </div>

      <!-- Profit Share Banner -->
      <div class="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-xl p-5 text-white">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-emerald-100 text-xs font-medium uppercase tracking-wider">Estimated Profit Share</p>
            <p class="text-3xl font-bold mt-1">{formatCurrency(stats.totalEarnings)}</p>
            <p class="text-emerald-200 text-sm mt-1">payout = (budget - spent) &times; {$organization?.pm_x || 0.5}</p>
          </div>
          <a href="/payouts" class="px-4 py-2 bg-white/15 hover:bg-white/25 rounded-lg text-sm font-medium transition-colors">
            View Payouts
          </a>
        </div>
      </div>

      <!-- Projects -->
      <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
        <div class="px-5 py-3.5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <h3 class="font-semibold text-slate-900 dark:text-white text-sm">Your Projects</h3>
          <a href="/projects" class="text-xs text-indigo-600 dark:text-indigo-400 font-medium">View all &rarr;</a>
        </div>
        <div class="divide-y divide-slate-100 dark:divide-slate-700">
          {#each $projects.items.slice(0, 6) as project}
            {@const pct = project.total_value > 0 ? (project.spent || 0) / project.total_value : 0}
            <a href="/projects/{project.id}" class="block px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
              <div class="flex items-center justify-between mb-2">
                <p class="font-medium text-sm text-slate-900 dark:text-white">{project.name}</p>
                <div class="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                  <span class="inline-flex items-center px-2 py-0.5 rounded-full font-medium {getStatusColor(project.status)}">
                    {project.status.replace('_', ' ')}
                  </span>
                  <span>{formatCurrency(project.spent || 0)} / {formatCurrency(project.total_value)}</span>
                </div>
              </div>
              <div class="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-1.5">
                <div
                  class="h-1.5 rounded-full transition-all {pct > 0.9 ? 'bg-red-500' : pct > 0.7 ? 'bg-amber-500' : 'bg-emerald-500'}"
                  style="width: {Math.min(pct * 100, 100)}%"
                ></div>
              </div>
            </a>
          {:else}
            <div class="px-5 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
              No projects yet. <a href="/projects" class="text-indigo-600 dark:text-indigo-400 font-medium">Browse available &rarr;</a>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- ==================== QC DASHBOARD ==================== -->
    {#if $currentOrgRole === 'qc'}
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-9 h-9 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center">
              <Clock class="text-orange-600 dark:text-orange-400" size={18} />
            </div>
            <p class="text-sm text-slate-500 dark:text-slate-400">Pending Review</p>
          </div>
          <p class="text-2xl font-bold text-slate-900 dark:text-white">{qcStats.pendingReviews}</p>
        </div>

        <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-9 h-9 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
              <CheckCircle class="text-green-600 dark:text-green-400" size={18} />
            </div>
            <p class="text-sm text-slate-500 dark:text-slate-400">Reviews Done</p>
          </div>
          <p class="text-2xl font-bold text-slate-900 dark:text-white">{qcStats.reviewsCompleted}</p>
        </div>

        <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-9 h-9 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
              <Target class="text-blue-600 dark:text-blue-400" size={18} />
            </div>
            <p class="text-sm text-slate-500 dark:text-slate-400">Avg Confidence</p>
          </div>
          <p class="text-2xl font-bold text-slate-900 dark:text-white">{qcStats.avgConfidence.toFixed(0)}%</p>
        </div>

        <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-9 h-9 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center">
              <DollarSign class="text-indigo-600 dark:text-indigo-400" size={18} />
            </div>
            <p class="text-sm text-slate-500 dark:text-slate-400">QC Earnings</p>
          </div>
          <p class="text-2xl font-bold text-slate-900 dark:text-white">{formatCurrency(qcStats.qcEarnings)}</p>
        </div>
      </div>

      <!-- Review Queue CTA -->
      <div class="bg-gradient-to-r from-orange-500 to-rose-500 rounded-xl p-5 text-white flex items-center justify-between">
        <div>
          <h3 class="text-lg font-bold">Review Queue</h3>
          <p class="text-orange-100 text-sm mt-0.5">{qcStats.pendingReviews} task{qcStats.pendingReviews !== 1 ? 's' : ''} awaiting quality review</p>
        </div>
        <a href="/qc" class="px-5 py-2.5 bg-white text-orange-600 font-semibold rounded-lg hover:bg-orange-50 transition-colors text-sm">
          Start Reviewing
        </a>
      </div>

      <!-- Pending Tasks Preview -->
      {#if pendingQCTasks.length > 0}
        <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
          <div class="px-5 py-3.5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <h3 class="font-semibold text-slate-900 dark:text-white text-sm">Next Up for Review</h3>
            <a href="/qc" class="text-xs text-indigo-600 dark:text-indigo-400 font-medium">View queue &rarr;</a>
          </div>
          <div class="divide-y divide-slate-100 dark:divide-slate-700">
            {#each pendingQCTasks.slice(0, 5) as task}
              {@const aiReview = task.qc_reviews?.find(r => r.review_type === 'ai')}
              <div class="px-5 py-3 flex items-center justify-between">
                <div class="min-w-0 flex-1">
                  <p class="font-medium text-sm text-slate-900 dark:text-white truncate">{task.title}</p>
                  <p class="text-xs text-slate-500 mt-0.5">{formatCurrency(task.dollar_value)}
                    {#if task.story_points} &middot; {task.story_points} SP{/if}
                  </p>
                </div>
                {#if aiReview?.confidence}
                  <span class="ml-3 text-xs font-medium px-2 py-0.5 rounded-full
                    {aiReview.confidence >= 0.75 ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' :
                     aiReview.confidence >= 0.5 ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' :
                     'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'}">
                    AI: {(aiReview.confidence * 100).toFixed(0)}%
                  </span>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/if}
    {/if}

    <!-- ==================== SALES DASHBOARD ==================== -->
    {#if $currentOrgRole === 'sales'}
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-9 h-9 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
              <FolderKanban class="text-green-600 dark:text-green-400" size={18} />
            </div>
            <p class="text-sm text-slate-500 dark:text-slate-400">Projects Sold</p>
          </div>
          <p class="text-2xl font-bold text-slate-900 dark:text-white">{salesStats.projectsSold}</p>
          <p class="text-xs text-slate-500 mt-1">{salesStats.activeProjects} active</p>
        </div>

        <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-9 h-9 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
              <TrendingUp class="text-blue-600 dark:text-blue-400" size={18} />
            </div>
            <p class="text-sm text-slate-500 dark:text-slate-400">Total Sales</p>
          </div>
          <p class="text-2xl font-bold text-slate-900 dark:text-white">{formatCurrency(salesStats.totalSalesValue)}</p>
        </div>

        <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-9 h-9 bg-amber-100 dark:bg-amber-900/30 rounded-lg flex items-center justify-center">
              <Clock class="text-amber-600 dark:text-amber-400" size={18} />
            </div>
            <p class="text-sm text-slate-500 dark:text-slate-400">Awaiting PM</p>
          </div>
          <p class="text-2xl font-bold text-slate-900 dark:text-white">{salesStats.pendingProjects}</p>
          <p class="text-xs text-slate-500 mt-1">commission decays over time</p>
        </div>

        <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-9 h-9 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center">
              <DollarSign class="text-indigo-600 dark:text-indigo-400" size={18} />
            </div>
            <p class="text-sm text-slate-500 dark:text-slate-400">Commission</p>
          </div>
          <p class="text-2xl font-bold text-slate-900 dark:text-white">{formatCurrency(salesStats.commissionEarned)}</p>
        </div>
      </div>

      <!-- Sales Projects -->
      <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
        <div class="px-5 py-3.5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <h3 class="font-semibold text-slate-900 dark:text-white text-sm">Your Projects</h3>
          <a href="/projects" class="text-xs text-indigo-600 dark:text-indigo-400 font-medium">View all &rarr;</a>
        </div>
        <div class="divide-y divide-slate-100 dark:divide-slate-700">
          {#each $projects.items.slice(0, 6) as project}
            <a href="/projects/{project.id}" class="flex items-center justify-between px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
              <div class="min-w-0 flex-1">
                <p class="font-medium text-sm text-slate-900 dark:text-white truncate">{project.name}</p>
                <p class="text-xs text-slate-500 mt-0.5">{formatCurrency(project.total_value)}
                  {#if project.pm_id} &middot; PM assigned{:else} &middot; <span class="text-amber-600 dark:text-amber-400">awaiting PM</span>{/if}
                </p>
              </div>
              <span class="ml-3 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium {getStatusColor(project.status)}">
                {project.status.replace('_', ' ')}
              </span>
            </a>
          {:else}
            <div class="px-5 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
              No projects yet. <a href="/projects" class="text-indigo-600 dark:text-indigo-400 font-medium">Create one &rarr;</a>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- ==================== ADMIN DASHBOARD ==================== -->
    {#if $currentOrgRole === 'admin'}
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-9 h-9 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
              <Users class="text-purple-600 dark:text-purple-400" size={18} />
            </div>
            <p class="text-sm text-slate-500 dark:text-slate-400">Team Members</p>
          </div>
          <p class="text-2xl font-bold text-slate-900 dark:text-white">{adminStats.totalUsers}</p>
        </div>

        <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-9 h-9 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
              <FolderKanban class="text-blue-600 dark:text-blue-400" size={18} />
            </div>
            <p class="text-sm text-slate-500 dark:text-slate-400">Active Projects</p>
          </div>
          <p class="text-2xl font-bold text-slate-900 dark:text-white">{adminStats.activeProjects}</p>
        </div>

        <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-9 h-9 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
              <DollarSign class="text-green-600 dark:text-green-400" size={18} />
            </div>
            <p class="text-sm text-slate-500 dark:text-slate-400">Total Budget</p>
          </div>
          <p class="text-2xl font-bold text-slate-900 dark:text-white">{formatCurrency(adminStats.totalValue)}</p>
          <p class="text-xs text-slate-500 mt-1">{formatCurrency(adminStats.totalSpent)} spent</p>
        </div>

        <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-9 h-9 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center">
              <BarChart3 class="text-indigo-600 dark:text-indigo-400" size={18} />
            </div>
            <p class="text-sm text-slate-500 dark:text-slate-400">Total Tasks</p>
          </div>
          <p class="text-2xl font-bold text-slate-900 dark:text-white">{adminStats.totalTasks}</p>
        </div>
      </div>

      <!-- Task Pipeline -->
      <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
        <h3 class="font-semibold text-slate-900 dark:text-white text-sm mb-4">Task Pipeline</h3>
        <div class="grid grid-cols-4 gap-3">
          <div class="text-center p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
            <p class="text-2xl font-bold text-slate-900 dark:text-white">{adminStats.openTasks}</p>
            <p class="text-xs text-slate-500 mt-1">Open</p>
          </div>
          <div class="text-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <p class="text-2xl font-bold text-blue-700 dark:text-blue-300">{$tasks.items.filter(t => t.status === 'in_progress' || t.status === 'assigned').length}</p>
            <p class="text-xs text-slate-500 mt-1">In Progress</p>
          </div>
          <div class="text-center p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
            <p class="text-2xl font-bold text-amber-700 dark:text-amber-300">{adminStats.pendingQC}</p>
            <p class="text-xs text-slate-500 mt-1">Under Review</p>
          </div>
          <div class="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
            <p class="text-2xl font-bold text-green-700 dark:text-green-300">{adminStats.completedTasks}</p>
            <p class="text-xs text-slate-500 mt-1">Completed</p>
          </div>
        </div>
      </div>

      <!-- Two-column: Projects + Team -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <!-- Projects -->
        <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
          <div class="px-5 py-3.5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <h3 class="font-semibold text-slate-900 dark:text-white text-sm">Projects</h3>
            <a href="/projects" class="text-xs text-indigo-600 dark:text-indigo-400 font-medium">View all &rarr;</a>
          </div>
          <div class="divide-y divide-slate-100 dark:divide-slate-700">
            {#each $projects.items.slice(0, 5) as project}
              {@const pct = project.total_value > 0 ? (project.spent || 0) / project.total_value : 0}
              <a href="/projects/{project.id}" class="block px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                <div class="flex items-center justify-between mb-1.5">
                  <p class="font-medium text-sm text-slate-900 dark:text-white truncate">{project.name}</p>
                  <span class="text-xs text-slate-500">{formatCurrency(project.spent || 0)}/{formatCurrency(project.total_value)}</span>
                </div>
                <div class="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-1.5">
                  <div class="h-1.5 rounded-full {pct > 0.9 ? 'bg-red-500' : pct > 0.7 ? 'bg-amber-500' : 'bg-emerald-500'}"
                    style="width: {Math.min(pct * 100, 100)}%"></div>
                </div>
              </a>
            {:else}
              <div class="px-5 py-8 text-center text-sm text-slate-500">No projects</div>
            {/each}
          </div>
        </div>

        <!-- Team Members -->
        <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
          <div class="px-5 py-3.5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <h3 class="font-semibold text-slate-900 dark:text-white text-sm">Team</h3>
            <a href="/settings" class="text-xs text-indigo-600 dark:text-indigo-400 font-medium">Manage &rarr;</a>
          </div>
          <div class="divide-y divide-slate-100 dark:divide-slate-700">
            {#each orgMembers.slice(0, 6) as member}
              <div class="px-5 py-3 flex items-center justify-between">
                <div class="flex items-center gap-3 min-w-0">
                  <div class="w-8 h-8 bg-slate-200 dark:bg-slate-600 rounded-full flex items-center justify-center text-xs font-bold text-slate-600 dark:text-slate-300">
                    {(member.full_name || member.email || '?').charAt(0).toUpperCase()}
                  </div>
                  <div class="min-w-0">
                    <p class="text-sm font-medium text-slate-900 dark:text-white truncate">{member.full_name || member.email}</p>
                    <p class="text-xs text-slate-500 truncate">Lv.{member.level || 1} &middot; {member.metadata?.total_tasks_completed || 0} tasks</p>
                  </div>
                </div>
                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium {getRoleBadge(member.role)}">
                  {member.role}
                </span>
              </div>
            {:else}
              <div class="px-5 py-8 text-center text-sm text-slate-500">No team members</div>
            {/each}
          </div>
        </div>
      </div>

      <!-- Quick Actions -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <a href="/projects" class="flex items-center gap-3 p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600 transition-colors group">
          <FolderKanban size={18} class="text-slate-400 group-hover:text-indigo-500" />
          <span class="text-sm font-medium text-slate-700 dark:text-slate-300">Projects</span>
        </a>
        <a href="/tasks" class="flex items-center gap-3 p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600 transition-colors group">
          <CheckCircle size={18} class="text-slate-400 group-hover:text-indigo-500" />
          <span class="text-sm font-medium text-slate-700 dark:text-slate-300">Tasks</span>
        </a>
        {#if $featureFlags.analytics}
          <a href="/analytics" class="flex items-center gap-3 p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600 transition-colors group">
            <BarChart3 size={18} class="text-slate-400 group-hover:text-indigo-500" />
            <span class="text-sm font-medium text-slate-700 dark:text-slate-300">Analytics</span>
          </a>
        {/if}
        <a href="/settings" class="flex items-center gap-3 p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600 transition-colors group">
          <Award size={18} class="text-slate-400 group-hover:text-indigo-500" />
          <span class="text-sm font-medium text-slate-700 dark:text-slate-300">Settings</span>
        </a>
      </div>
    {/if}
  {/if}
</div>

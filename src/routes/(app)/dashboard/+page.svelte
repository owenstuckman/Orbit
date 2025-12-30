<script lang="ts">
  import { onMount } from 'svelte';
  import { user, capabilities, organization } from '$lib/stores/auth';
  import { tasks } from '$lib/stores/tasks';
  import { projects } from '$lib/stores/projects';
  import { payoutsApi } from '$lib/services/api';
  import { formatCurrency, calculateSalaryBreakdown, projectAnnualSalary } from '$lib/utils/payout';
  import { 
    TrendingUp, 
    CheckCircle, 
    Clock, 
    DollarSign,
    Target,
    AlertTriangle,
    ArrowUpRight,
    ArrowDownRight,
    Users,
    FolderKanban,
    Shield
  } from 'lucide-svelte';

  // Dashboard data
  let stats = {
    tasksCompleted: 0,
    tasksInProgress: 0,
    totalEarnings: 0,
    pendingPayouts: 0,
    qcPassRate: 0,
    currentStreak: 0
  };
  let recentTasks: any[] = [];
  let salaryBreakdown: any = null;
  let loading = true;

  // PM-specific stats
  let pmStats = {
    projectsManaged: 0,
    budgetUtilization: 0,
    teamSize: 0,
    overdraftRisk: 0
  };

  // QC-specific stats
  let qcStats = {
    reviewsCompleted: 0,
    avgConfidence: 0,
    issuesFound: 0
  };

  // Sales-specific stats
  let salesStats = {
    projectsSold: 0,
    totalSalesValue: 0,
    pendingProjects: 0,
    commissionEarned: 0
  };

  onMount(async () => {
    if (!$user) return;

    try {
      // Load common data
      const payoutSummary = await payoutsApi.getSummary($user.id, 'month');
      stats.totalEarnings = payoutSummary.total;
      stats.pendingPayouts = payoutSummary.pending;
      stats.currentStreak = $user.metadata?.current_streak || 0;
      stats.qcPassRate = ($user.metadata?.qc_pass_rate || 0) * 100;

      // Calculate salary breakdown
      if ($user.base_salary && $user.r != null) {
        const monthlyTaskValue = payoutSummary.byType.task || 0;
        salaryBreakdown = calculateSalaryBreakdown(
          $user.base_salary / 12, // Monthly base
          $user.r,
          monthlyTaskValue
        );
      }

      // Role-specific data loading
      switch ($user.role) {
        case 'employee':
        case 'contractor':
          await tasks.loadByAssignee($user.id);
          stats.tasksCompleted = $tasks.items.filter(t => t.status === 'approved' || t.status === 'paid').length;
          stats.tasksInProgress = $tasks.items.filter(t => t.status === 'in_progress' || t.status === 'assigned').length;
          recentTasks = $tasks.items.slice(0, 5);
          break;

        case 'pm':
          await projects.loadByPM($user.id);
          pmStats.projectsManaged = $projects.items.filter(p => p.status === 'active').length;
          pmStats.budgetUtilization = $projects.items.length > 0
            ? $projects.items.reduce((sum, p) => sum + (p.spent / p.total_value), 0) / $projects.items.length * 100
            : 0;
          pmStats.overdraftRisk = $projects.items.filter(p => (p.spent / p.total_value) > 0.9).length;
          break;

        case 'qc':
          // Load QC queue - would need API method
          qcStats.reviewsCompleted = Number($user.metadata?.reviews_completed) || 0;
          qcStats.avgConfidence = (Number($user.metadata?.avg_confidence) || 0) * 100;
          qcStats.issuesFound = Number($user.metadata?.issues_found) || 0;
          break;

        case 'sales':
          await projects.loadBySales($user.id);
          salesStats.projectsSold = $projects.items.filter(p => p.status !== 'draft').length;
          salesStats.totalSalesValue = $projects.items.reduce((sum, p) => sum + p.total_value, 0);
          salesStats.pendingProjects = $projects.items.filter(p => p.status === 'pending_pm').length;
          salesStats.commissionEarned = payoutSummary.byType.sales_commission || 0;
          break;

        case 'admin':
          // Load everything
          await tasks.load();
          await projects.load();
          break;
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      loading = false;
    }
  });

  // Format percentage change
  function formatChange(value: number): string {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}%`;
  }
</script>

<div class="space-y-8">
  <!-- Header -->
  <div>
    <h1 class="text-2xl font-bold text-slate-900">
      Welcome back, {$user?.full_name?.split(' ')[0] || 'there'}
    </h1>
    <p class="mt-1 text-slate-600">
      Here's what's happening with your work today.
    </p>
  </div>

  {#if loading}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {#each Array(4) as _}
        <div class="bg-white rounded-xl border border-slate-200 p-6 animate-pulse">
          <div class="h-4 bg-slate-200 rounded w-24 mb-4"></div>
          <div class="h-8 bg-slate-200 rounded w-32"></div>
        </div>
      {/each}
    </div>
  {:else}
    <!-- Employee/Contractor Dashboard -->
    {#if $user?.role === 'employee' || $user?.role === 'contractor'}
      <!-- Stats Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div class="bg-white rounded-xl border border-slate-200 p-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-slate-600">Tasks Completed</p>
              <p class="text-3xl font-bold text-slate-900 mt-1">{stats.tasksCompleted}</p>
            </div>
            <div class="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
              <CheckCircle class="text-green-600" size={24} />
            </div>
          </div>
          <div class="mt-4 flex items-center text-sm">
            <ArrowUpRight class="text-green-500" size={16} />
            <span class="text-green-600 font-medium ml-1">12%</span>
            <span class="text-slate-500 ml-2">vs last month</span>
          </div>
        </div>

        <div class="bg-white rounded-xl border border-slate-200 p-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-slate-600">In Progress</p>
              <p class="text-3xl font-bold text-slate-900 mt-1">{stats.tasksInProgress}</p>
            </div>
            <div class="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <Clock class="text-blue-600" size={24} />
            </div>
          </div>
          <div class="mt-4 flex items-center text-sm">
            <span class="text-slate-500">Active tasks</span>
          </div>
        </div>

        <div class="bg-white rounded-xl border border-slate-200 p-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-slate-600">Monthly Earnings</p>
              <p class="text-3xl font-bold text-slate-900 mt-1">{formatCurrency(stats.totalEarnings)}</p>
            </div>
            <div class="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center">
              <DollarSign class="text-indigo-600" size={24} />
            </div>
          </div>
          <div class="mt-4 flex items-center text-sm">
            <span class="text-amber-600 font-medium">{formatCurrency(stats.pendingPayouts)}</span>
            <span class="text-slate-500 ml-2">pending</span>
          </div>
        </div>

        <div class="bg-white rounded-xl border border-slate-200 p-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-slate-600">QC Pass Rate</p>
              <p class="text-3xl font-bold text-slate-900 mt-1">{stats.qcPassRate.toFixed(0)}%</p>
            </div>
            <div class="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
              <Target class="text-purple-600" size={24} />
            </div>
          </div>
          <div class="mt-4 flex items-center text-sm">
            <span class="text-slate-500">🔥 {stats.currentStreak} day streak</span>
          </div>
        </div>
      </div>

      <!-- Salary Breakdown Card -->
      {#if salaryBreakdown}
        <div class="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl p-6 text-white">
          <h3 class="text-lg font-semibold mb-4">This Month's Salary Breakdown</h3>
          <div class="grid grid-cols-3 gap-6">
            <div>
              <p class="text-indigo-200 text-sm">Base Salary (r={($user?.r || 0.7).toFixed(0)}%)</p>
              <p class="text-2xl font-bold">{formatCurrency(salaryBreakdown.base)}</p>
            </div>
            <div>
              <p class="text-indigo-200 text-sm">Task Earnings</p>
              <p class="text-2xl font-bold">{formatCurrency(salaryBreakdown.tasks)}</p>
            </div>
            <div>
              <p class="text-indigo-200 text-sm">Total This Month</p>
              <p class="text-2xl font-bold">{formatCurrency(salaryBreakdown.total)}</p>
            </div>
          </div>
          <div class="mt-4 pt-4 border-t border-white/20">
            <a href="/settings" class="text-sm text-white/80 hover:text-white">
              Adjust your salary/task mix →
            </a>
          </div>
        </div>
      {/if}

      <!-- Recent Tasks -->
      <div class="bg-white rounded-xl border border-slate-200">
        <div class="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 class="font-semibold text-slate-900">Recent Tasks</h3>
          <a href="/tasks" class="text-sm text-indigo-600 hover:text-indigo-700 font-medium">
            View all →
          </a>
        </div>
        <div class="divide-y divide-slate-100">
          {#each recentTasks as task}
            <a href="/tasks/{task.id}" class="block px-6 py-4 hover:bg-slate-50 transition-colors">
              <div class="flex items-center justify-between">
                <div>
                  <p class="font-medium text-slate-900">{task.title}</p>
                  <p class="text-sm text-slate-500 mt-1">
                    {task.project?.name || 'No project'} · {formatCurrency(task.dollar_value)}
                  </p>
                </div>
                <span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium
                  {task.status === 'approved' ? 'bg-green-100 text-green-800' : ''}
                  {task.status === 'in_progress' ? 'bg-blue-100 text-blue-800' : ''}
                  {task.status === 'under_review' ? 'bg-amber-100 text-amber-800' : ''}
                  {task.status === 'rejected' ? 'bg-red-100 text-red-800' : ''}
                  {task.status === 'open' ? 'bg-slate-100 text-slate-800' : ''}
                ">
                  {task.status.replace('_', ' ')}
                </span>
              </div>
            </a>
          {:else}
            <div class="px-6 py-12 text-center">
              <p class="text-slate-500">No tasks yet. Check available tasks to get started!</p>
              <a href="/tasks" class="inline-flex items-center mt-4 text-indigo-600 hover:text-indigo-700 font-medium">
                Browse available tasks →
              </a>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- PM Dashboard -->
    {#if $user?.role === 'pm'}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div class="bg-white rounded-xl border border-slate-200 p-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-slate-600">Active Projects</p>
              <p class="text-3xl font-bold text-slate-900 mt-1">{pmStats.projectsManaged}</p>
            </div>
            <div class="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <FolderKanban class="text-blue-600" size={24} />
            </div>
          </div>
        </div>

        <div class="bg-white rounded-xl border border-slate-200 p-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-slate-600">Avg Budget Used</p>
              <p class="text-3xl font-bold text-slate-900 mt-1">{pmStats.budgetUtilization.toFixed(0)}%</p>
            </div>
            <div class="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
              <TrendingUp class="text-green-600" size={24} />
            </div>
          </div>
        </div>

        <div class="bg-white rounded-xl border border-slate-200 p-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-slate-600">Potential Profit</p>
              <p class="text-3xl font-bold text-slate-900 mt-1">{formatCurrency(stats.totalEarnings)}</p>
            </div>
            <div class="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center">
              <DollarSign class="text-indigo-600" size={24} />
            </div>
          </div>
        </div>

        <div class="bg-white rounded-xl border border-slate-200 p-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-slate-600">Overdraft Risk</p>
              <p class="text-3xl font-bold text-slate-900 mt-1">{pmStats.overdraftRisk}</p>
            </div>
            <div class="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center">
              <AlertTriangle class="text-red-600" size={24} />
            </div>
          </div>
          <p class="text-sm text-slate-500 mt-2">projects near budget limit</p>
        </div>
      </div>

      <!-- Projects List -->
      <div class="bg-white rounded-xl border border-slate-200">
        <div class="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 class="font-semibold text-slate-900">Your Projects</h3>
          <a href="/projects" class="text-sm text-indigo-600 hover:text-indigo-700 font-medium">
            View all →
          </a>
        </div>
        <div class="divide-y divide-slate-100">
          {#each $projects.items.slice(0, 5) as project}
            <a href="/projects/{project.id}" class="block px-6 py-4 hover:bg-slate-50 transition-colors">
              <div class="flex items-center justify-between mb-2">
                <p class="font-medium text-slate-900">{project.name}</p>
                <span class="text-sm text-slate-600">
                  {formatCurrency(project.spent)} / {formatCurrency(project.total_value)}
                </span>
              </div>
              <div class="w-full bg-slate-200 rounded-full h-2">
                <div 
                  class="h-2 rounded-full transition-all
                    {(project.spent / project.total_value) > 0.9 ? 'bg-red-500' : ''}
                    {(project.spent / project.total_value) > 0.7 && (project.spent / project.total_value) <= 0.9 ? 'bg-amber-500' : ''}
                    {(project.spent / project.total_value) <= 0.7 ? 'bg-green-500' : ''}
                  "
                  style="width: {Math.min((project.spent / project.total_value) * 100, 100)}%"
                ></div>
              </div>
            </a>
          {:else}
            <div class="px-6 py-12 text-center">
              <p class="text-slate-500">No projects assigned yet.</p>
              <a href="/projects" class="inline-flex items-center mt-4 text-indigo-600 hover:text-indigo-700 font-medium">
                Browse available projects →
              </a>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- QC Dashboard -->
    {#if $user?.role === 'qc'}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div class="bg-white rounded-xl border border-slate-200 p-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-slate-600">Reviews Completed</p>
              <p class="text-3xl font-bold text-slate-900 mt-1">{qcStats.reviewsCompleted}</p>
            </div>
            <div class="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
              <CheckCircle class="text-green-600" size={24} />
            </div>
          </div>
        </div>

        <div class="bg-white rounded-xl border border-slate-200 p-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-slate-600">Avg Confidence</p>
              <p class="text-3xl font-bold text-slate-900 mt-1">{qcStats.avgConfidence.toFixed(0)}%</p>
            </div>
            <div class="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <Target class="text-blue-600" size={24} />
            </div>
          </div>
        </div>

        <div class="bg-white rounded-xl border border-slate-200 p-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-slate-600">Issues Found</p>
              <p class="text-3xl font-bold text-slate-900 mt-1">{qcStats.issuesFound}</p>
            </div>
            <div class="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
              <Shield class="text-orange-600" size={24} />
            </div>
          </div>
        </div>

        <div class="bg-white rounded-xl border border-slate-200 p-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-slate-600">QC Earnings</p>
              <p class="text-3xl font-bold text-slate-900 mt-1">{formatCurrency(stats.totalEarnings)}</p>
            </div>
            <div class="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center">
              <DollarSign class="text-indigo-600" size={24} />
            </div>
          </div>
        </div>
      </div>

      <!-- QC Queue Link -->
      <div class="bg-gradient-to-br from-orange-500 to-red-600 rounded-xl p-6 text-white">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-xl font-bold">Review Queue</h3>
            <p class="text-orange-100 mt-1">Tasks waiting for quality review</p>
          </div>
          <a 
            href="/qc" 
            class="px-6 py-3 bg-white text-orange-600 font-semibold rounded-lg hover:bg-orange-50 transition-colors"
          >
            Start Reviewing
          </a>
        </div>
      </div>
    {/if}

    <!-- Sales Dashboard -->
    {#if $user?.role === 'sales'}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div class="bg-white rounded-xl border border-slate-200 p-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-slate-600">Projects Sold</p>
              <p class="text-3xl font-bold text-slate-900 mt-1">{salesStats.projectsSold}</p>
            </div>
            <div class="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
              <FolderKanban class="text-green-600" size={24} />
            </div>
          </div>
        </div>

        <div class="bg-white rounded-xl border border-slate-200 p-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-slate-600">Total Sales Value</p>
              <p class="text-3xl font-bold text-slate-900 mt-1">{formatCurrency(salesStats.totalSalesValue)}</p>
            </div>
            <div class="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <TrendingUp class="text-blue-600" size={24} />
            </div>
          </div>
        </div>

        <div class="bg-white rounded-xl border border-slate-200 p-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-slate-600">Pending Pickup</p>
              <p class="text-3xl font-bold text-slate-900 mt-1">{salesStats.pendingProjects}</p>
            </div>
            <div class="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center">
              <Clock class="text-amber-600" size={24} />
            </div>
          </div>
          <p class="text-sm text-slate-500 mt-2">awaiting PM assignment</p>
        </div>

        <div class="bg-white rounded-xl border border-slate-200 p-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-slate-600">Commission Earned</p>
              <p class="text-3xl font-bold text-slate-900 mt-1">{formatCurrency(salesStats.commissionEarned)}</p>
            </div>
            <div class="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center">
              <DollarSign class="text-indigo-600" size={24} />
            </div>
          </div>
        </div>
      </div>
    {/if}

    <!-- Admin Dashboard -->
    {#if $user?.role === 'admin'}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div class="bg-white rounded-xl border border-slate-200 p-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-slate-600">Total Tasks</p>
              <p class="text-3xl font-bold text-slate-900 mt-1">{$tasks.items.length}</p>
            </div>
            <div class="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <CheckCircle class="text-blue-600" size={24} />
            </div>
          </div>
        </div>

        <div class="bg-white rounded-xl border border-slate-200 p-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-slate-600">Active Projects</p>
              <p class="text-3xl font-bold text-slate-900 mt-1">
                {$projects.items.filter(p => p.status === 'active').length}
              </p>
            </div>
            <div class="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
              <FolderKanban class="text-green-600" size={24} />
            </div>
          </div>
        </div>

        <div class="bg-white rounded-xl border border-slate-200 p-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-slate-600">Total Value</p>
              <p class="text-3xl font-bold text-slate-900 mt-1">
                {formatCurrency($projects.items.reduce((sum, p) => sum + p.total_value, 0))}
              </p>
            </div>
            <div class="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center">
              <DollarSign class="text-indigo-600" size={24} />
            </div>
          </div>
        </div>

        <div class="bg-white rounded-xl border border-slate-200 p-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-slate-600">QC Pending</p>
              <p class="text-3xl font-bold text-slate-900 mt-1">
                {$tasks.items.filter(t => t.status === 'under_review').length}
              </p>
            </div>
            <div class="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
              <Shield class="text-orange-600" size={24} />
            </div>
          </div>
        </div>
      </div>
    {/if}
  {/if}
</div>

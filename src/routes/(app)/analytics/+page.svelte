<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { user, organization, currentOrgRole } from '$lib/stores/auth';
  import { analyticsApi } from '$lib/services/analytics';
  import { toasts } from '$lib/stores/notifications';
  import { exportToCSV } from '$lib/services/export';
  import type { AnalyticsData, TaskMetrics, PayoutMetrics, UserMetrics, TrendData } from '$lib/types';
  import {
    BarChart3,
    TrendingUp,
    TrendingDown,
    DollarSign,
    Users,
    Target,
    Clock,
    CheckCircle,
    Calendar,
    Download,
    Filter,
    Award
  } from 'lucide-svelte';

  type Period = 'week' | 'month' | 'quarter' | 'year';

  let loading = true;
  let selectedPeriod: Period = 'month';

  // Analytics data
  let taskMetrics: TaskMetrics = {
    total: 0,
    completed: 0,
    inProgress: 0,
    pending: 0,
    completionRate: 0,
    avgCompletionTime: 0,
    byStatus: {} as Record<string, number>
  };

  let payoutMetrics: PayoutMetrics = {
    totalPaid: 0,
    pendingPayouts: 0,
    avgPayout: 0,
    byType: {}
  };

  let userMetrics: UserMetrics = {
    totalActive: 0,
    topPerformers: [],
    avgTasksPerUser: 0,
    avgEarningsPerUser: 0
  };

  let trends: TrendData[] = [];

  onMount(async () => {
    // Route guard: Only Admin and PM can access analytics (using org-specific role)
    if ($currentOrgRole !== 'admin' && $currentOrgRole !== 'pm') {
      toasts.error('You do not have permission to access analytics');
      goto('/dashboard');
      return;
    }

    await loadAnalytics();
  });

  async function loadAnalytics() {
    if (!$organization?.id) return;

    loading = true;
    try {
      const data = await analyticsApi.getFullAnalytics($organization.id, selectedPeriod);
      taskMetrics = data.taskMetrics;
      payoutMetrics = data.payoutMetrics;
      userMetrics = data.userMetrics;
      trends = data.trends;
    } catch (error) {
      console.error('Failed to load analytics:', error);
    } finally {
      loading = false;
    }
  }

  function getStatusColor(status: string): string {
    const colors: Record<string, string> = {
      open: 'bg-blue-500',
      assigned: 'bg-yellow-500',
      in_progress: 'bg-purple-500',
      completed: 'bg-indigo-500',
      under_review: 'bg-orange-500',
      approved: 'bg-green-500',
      rejected: 'bg-red-500',
      paid: 'bg-emerald-500'
    };
    return colors[status] || 'bg-slate-500';
  }

  function getPayoutTypeColor(type: string): string {
    const colors: Record<string, string> = {
      task: 'text-indigo-600',
      qc: 'text-purple-600',
      pm_bonus: 'text-green-600',
      sales_commission: 'text-amber-600'
    };
    return colors[type] || 'text-slate-600';
  }

  function exportReport() {
    const reportData = [
      {
        metric: 'Total Tasks',
        value: taskMetrics.total,
        period: selectedPeriod
      },
      {
        metric: 'Completed Tasks',
        value: taskMetrics.completed,
        period: selectedPeriod
      },
      {
        metric: 'Completion Rate',
        value: `${taskMetrics.completionRate.toFixed(1)}%`,
        period: selectedPeriod
      },
      {
        metric: 'Avg Completion Time (hrs)',
        value: taskMetrics.avgCompletionTime.toFixed(1),
        period: selectedPeriod
      },
      {
        metric: 'Total Paid',
        value: `$${payoutMetrics.totalPaid.toLocaleString()}`,
        period: selectedPeriod
      },
      {
        metric: 'Pending Payouts',
        value: `$${payoutMetrics.pendingPayouts.toLocaleString()}`,
        period: selectedPeriod
      },
      {
        metric: 'Active Users',
        value: userMetrics.totalActive,
        period: selectedPeriod
      }
    ];

    exportToCSV(reportData, {
      filename: `analytics-report-${selectedPeriod}-${new Date().toISOString().split('T')[0]}`,
      headers: ['Metric', 'Value', 'Period']
    });
  }

  async function handlePeriodChange(period: Period) {
    selectedPeriod = period;
    await loadAnalytics();
  }

  // Calculate trend percentages (comparing last two data points)
  $: taskTrend = trends.length >= 2
    ? ((trends[trends.length - 1].tasks - trends[trends.length - 2].tasks) / Math.max(trends[trends.length - 2].tasks, 1)) * 100
    : 0;
  $: payoutTrend = trends.length >= 2
    ? ((trends[trends.length - 1].payouts - trends[trends.length - 2].payouts) / Math.max(trends[trends.length - 2].payouts, 1)) * 100
    : 0;
</script>

<svelte:head>
  <title>Analytics - Orbit</title>
</svelte:head>

<div class="space-y-6">
  <!-- Header -->
  <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
    <div>
      <h1 class="text-2xl font-bold text-slate-900 flex items-center gap-2">
        <BarChart3 class="text-indigo-500" size={28} />
        Analytics
      </h1>
      <p class="mt-1 text-slate-600">Insights into performance and productivity</p>
    </div>

    <div class="flex items-center gap-3">
      <div class="flex bg-slate-100 rounded-lg p-1">
        <button
          class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors
            {selectedPeriod === 'week' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}"
          on:click={() => handlePeriodChange('week')}
        >
          Week
        </button>
        <button
          class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors
            {selectedPeriod === 'month' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}"
          on:click={() => handlePeriodChange('month')}
        >
          Month
        </button>
        <button
          class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors
            {selectedPeriod === 'quarter' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}"
          on:click={() => handlePeriodChange('quarter')}
        >
          Quarter
        </button>
        <button
          class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors
            {selectedPeriod === 'year' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}"
          on:click={() => handlePeriodChange('year')}
        >
          Year
        </button>
      </div>

      <button
        on:click={exportReport}
        class="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
      >
        <Download size={18} />
        Export
      </button>
    </div>
  </div>

  {#if loading}
    <div class="flex items-center justify-center py-20">
      <div class="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
    </div>
  {:else}
    <!-- Key Metrics -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <div class="bg-white rounded-xl border border-slate-200 p-4">
        <div class="flex items-center justify-between">
          <div class="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
            <Target class="text-blue-600" size={20} />
          </div>
          {#if taskTrend !== 0}
            <div class="flex items-center gap-1 {taskTrend >= 0 ? 'text-green-600' : 'text-red-600'} text-sm">
              {#if taskTrend >= 0}
                <TrendingUp size={14} />
              {:else}
                <TrendingDown size={14} />
              {/if}
              {Math.abs(taskTrend).toFixed(0)}%
            </div>
          {/if}
        </div>
        <p class="mt-3 text-2xl font-bold text-slate-900">{taskMetrics.total}</p>
        <p class="text-sm text-slate-500">Total Tasks</p>
      </div>

      <div class="bg-white rounded-xl border border-slate-200 p-4">
        <div class="flex items-center justify-between">
          <div class="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
            <CheckCircle class="text-green-600" size={20} />
          </div>
        </div>
        <p class="mt-3 text-2xl font-bold text-slate-900">{taskMetrics.completionRate.toFixed(1)}%</p>
        <p class="text-sm text-slate-500">Completion Rate</p>
      </div>

      <div class="bg-white rounded-xl border border-slate-200 p-4">
        <div class="flex items-center justify-between">
          <div class="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
            <DollarSign class="text-purple-600" size={20} />
          </div>
          {#if payoutTrend !== 0}
            <div class="flex items-center gap-1 {payoutTrend >= 0 ? 'text-green-600' : 'text-red-600'} text-sm">
              {#if payoutTrend >= 0}
                <TrendingUp size={14} />
              {:else}
                <TrendingDown size={14} />
              {/if}
              {Math.abs(payoutTrend).toFixed(0)}%
            </div>
          {/if}
        </div>
        <p class="mt-3 text-2xl font-bold text-slate-900">${payoutMetrics.totalPaid.toLocaleString()}</p>
        <p class="text-sm text-slate-500">Total Paid</p>
      </div>

      <div class="bg-white rounded-xl border border-slate-200 p-4">
        <div class="flex items-center justify-between">
          <div class="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
            <Clock class="text-amber-600" size={20} />
          </div>
        </div>
        <p class="mt-3 text-2xl font-bold text-slate-900">{taskMetrics.avgCompletionTime.toFixed(1)}h</p>
        <p class="text-sm text-slate-500">Avg Completion Time</p>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Tasks by Status -->
      <div class="bg-white rounded-xl border border-slate-200 p-6">
        <h2 class="text-lg font-semibold text-slate-900 mb-4">Tasks by Status</h2>

        {#if Object.keys(taskMetrics.byStatus).length === 0}
          <p class="text-slate-500 text-center py-8">No task data for this period</p>
        {:else}
          <div class="space-y-3">
            {#each Object.entries(taskMetrics.byStatus) as [status, count]}
              {@const total = Object.values(taskMetrics.byStatus).reduce((a, b) => a + b, 0)}
              {@const percent = total > 0 ? (count / total) * 100 : 0}
              <div>
                <div class="flex items-center justify-between text-sm mb-1">
                  <span class="text-slate-600 capitalize">{status.replace('_', ' ')}</span>
                  <span class="font-medium text-slate-900">{count} ({percent.toFixed(1)}%)</span>
                </div>
                <div class="w-full bg-slate-100 rounded-full h-2">
                  <div
                    class="{getStatusColor(status)} h-2 rounded-full transition-all duration-500"
                    style="width: {percent}%"
                  ></div>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Payouts by Type -->
      <div class="bg-white rounded-xl border border-slate-200 p-6">
        <h2 class="text-lg font-semibold text-slate-900 mb-4">Payouts by Type</h2>

        {#if Object.keys(payoutMetrics.byType).length === 0}
          <p class="text-slate-500 text-center py-8">No payout data for this period</p>
        {:else}
          <div class="space-y-4">
            {#each Object.entries(payoutMetrics.byType) as [type, amount]}
              {@const total = Object.values(payoutMetrics.byType).reduce((a, b) => a + b, 0)}
              {@const percent = total > 0 ? (amount / total) * 100 : 0}
              <div class="flex items-center gap-4">
                <div class="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <DollarSign class="{getPayoutTypeColor(type)}" size={20} />
                </div>
                <div class="flex-1">
                  <div class="flex items-center justify-between mb-1">
                    <span class="font-medium text-slate-900 capitalize">{type.replace('_', ' ')}</span>
                    <span class="text-green-600 font-semibold">${amount.toLocaleString()}</span>
                  </div>
                  <div class="w-full bg-slate-100 rounded-full h-1.5">
                    <div
                      class="bg-green-500 h-1.5 rounded-full"
                      style="width: {percent}%"
                    ></div>
                  </div>
                </div>
              </div>
            {/each}
          </div>

          <div class="mt-6 pt-4 border-t border-slate-200">
            <div class="flex items-center justify-between">
              <span class="font-medium text-slate-900">Total</span>
              <span class="text-xl font-bold text-green-600">
                ${Object.values(payoutMetrics.byType).reduce((a, b) => a + b, 0).toLocaleString()}
              </span>
            </div>
          </div>
        {/if}
      </div>
    </div>

    <!-- Trend Chart -->
    {#if trends.length > 0}
      <div class="bg-white rounded-xl border border-slate-200 p-6">
        <h2 class="text-lg font-semibold text-slate-900 mb-4">
          {selectedPeriod === 'week' ? 'Daily' : selectedPeriod === 'month' ? 'Weekly' : 'Monthly'} Trend
        </h2>

        <div class="h-64 flex items-end gap-4">
          {#each trends as point}
            {@const maxTasks = Math.max(...trends.map(t => t.tasks), 1)}
            {@const maxPayouts = Math.max(...trends.map(t => t.payouts), 1)}
            <div class="flex-1 flex flex-col items-center gap-2">
              <div class="w-full flex gap-1 items-end h-48">
                <div
                  class="flex-1 bg-indigo-500 rounded-t-lg transition-all duration-500"
                  style="height: {(point.tasks / maxTasks) * 100}%"
                  title="{point.tasks} tasks"
                ></div>
                <div
                  class="flex-1 bg-green-500 rounded-t-lg transition-all duration-500"
                  style="height: {(point.payouts / maxPayouts) * 100}%"
                  title="${point.payouts.toLocaleString()}"
                ></div>
              </div>
              <span class="text-xs text-slate-600">{point.date.slice(5)}</span>
            </div>
          {/each}
        </div>

        <div class="flex items-center justify-center gap-6 mt-4 pt-4 border-t border-slate-100">
          <div class="flex items-center gap-2">
            <div class="w-3 h-3 bg-indigo-500 rounded"></div>
            <span class="text-sm text-slate-600">Tasks</span>
          </div>
          <div class="flex items-center gap-2">
            <div class="w-3 h-3 bg-green-500 rounded"></div>
            <span class="text-sm text-slate-600">Payouts ($)</span>
          </div>
        </div>
      </div>
    {/if}

    <!-- Additional Stats -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div class="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl p-6 text-white">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-medium opacity-90">Active Users</h3>
          <Users size={20} class="opacity-75" />
        </div>
        <p class="text-3xl font-bold mt-2">{userMetrics.totalActive}</p>
        <p class="text-sm opacity-75 mt-1">Contributing this {selectedPeriod}</p>
      </div>

      <div class="bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl p-6 text-white">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-medium opacity-90">Average Payout</h3>
          <DollarSign size={20} class="opacity-75" />
        </div>
        <p class="text-3xl font-bold mt-2">${payoutMetrics.avgPayout.toFixed(0)}</p>
        <p class="text-sm opacity-75 mt-1">Per payout</p>
      </div>

      <div class="bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl p-6 text-white">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-medium opacity-90">Pending Payouts</h3>
          <Clock size={20} class="opacity-75" />
        </div>
        <p class="text-3xl font-bold mt-2">${payoutMetrics.pendingPayouts.toLocaleString()}</p>
        <p class="text-sm opacity-75 mt-1">Awaiting payment</p>
      </div>
    </div>

    <!-- Top Performers -->
    {#if userMetrics.topPerformers.length > 0}
      <div class="bg-white rounded-xl border border-slate-200 p-6">
        <h2 class="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Award class="text-amber-500" size={20} />
          Top Performers
        </h2>

        <div class="grid grid-cols-1 md:grid-cols-5 gap-4">
          {#each userMetrics.topPerformers.slice(0, 5) as performer, i}
            <div class="flex items-center gap-3 p-3 rounded-lg {i === 0 ? 'bg-amber-50 border border-amber-200' : 'bg-slate-50'}">
              <div class="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-medium">
                {performer.full_name?.charAt(0) || performer.email.charAt(0).toUpperCase()}
              </div>
              <div class="min-w-0 flex-1">
                <p class="font-medium text-slate-900 truncate text-sm">{performer.full_name || 'Anonymous'}</p>
                <p class="text-xs text-slate-500 capitalize">{performer.role}</p>
              </div>
              {#if i === 0}
                <Award class="text-amber-500 flex-shrink-0" size={16} />
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</div>

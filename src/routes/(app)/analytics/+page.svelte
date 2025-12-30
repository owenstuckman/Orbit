<script lang="ts">
  import { onMount } from 'svelte';
  import { user, capabilities } from '$lib/stores/auth';
  import { projectsApi, tasksApi, payoutsApi } from '$lib/services/api';
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
    Filter
  } from 'lucide-svelte';

  let loading = true;
  let selectedPeriod = 'month';

  // Analytics data
  let stats = {
    totalTasks: 0,
    completedTasks: 0,
    completionRate: 0,
    avgTaskTime: 0,
    totalPayouts: 0,
    avgPayout: 0,
    qcPassRate: 0,
    activeProjects: 0
  };

  let tasksByStatus: Record<string, number> = {};
  let payoutsByType: Record<string, number> = {};
  let monthlyTrend: { month: string; tasks: number; payouts: number }[] = [];

  onMount(async () => {
    await loadAnalytics();
  });

  async function loadAnalytics() {
    loading = true;
    try {
      // Generate mock analytics data
      stats = {
        totalTasks: 156,
        completedTasks: 124,
        completionRate: 79.5,
        avgTaskTime: 4.2,
        totalPayouts: 45680,
        avgPayout: 368,
        qcPassRate: 87.3,
        activeProjects: 12
      };

      tasksByStatus = {
        open: 18,
        assigned: 8,
        in_progress: 6,
        completed: 24,
        under_review: 12,
        approved: 76,
        paid: 12
      };

      payoutsByType = {
        task: 32450,
        qc: 8230,
        pm_bonus: 3500,
        sales_commission: 1500
      };

      monthlyTrend = [
        { month: 'Jul', tasks: 28, payouts: 8200 },
        { month: 'Aug', tasks: 32, payouts: 9400 },
        { month: 'Sep', tasks: 35, payouts: 10200 },
        { month: 'Oct', tasks: 42, payouts: 12500 },
        { month: 'Nov', tasks: 38, payouts: 11800 },
        { month: 'Dec', tasks: 45, payouts: 14200 }
      ];
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
      paid: 'bg-emerald-500'
    };
    return colors[status] || 'bg-slate-500';
  }

  function exportReport() {
    // Placeholder for export functionality
    console.log('Exporting report...');
  }
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
        {#each ['week', 'month', 'quarter', 'year'] as period}
          <button
            class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors
              {selectedPeriod === period ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}"
            on:click={() => selectedPeriod = period}
          >
            {period.charAt(0).toUpperCase() + period.slice(1)}
          </button>
        {/each}
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
          <div class="flex items-center gap-1 text-green-600 text-sm">
            <TrendingUp size={14} />
            12%
          </div>
        </div>
        <p class="mt-3 text-2xl font-bold text-slate-900">{stats.totalTasks}</p>
        <p class="text-sm text-slate-500">Total Tasks</p>
      </div>

      <div class="bg-white rounded-xl border border-slate-200 p-4">
        <div class="flex items-center justify-between">
          <div class="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
            <CheckCircle class="text-green-600" size={20} />
          </div>
          <div class="flex items-center gap-1 text-green-600 text-sm">
            <TrendingUp size={14} />
            8%
          </div>
        </div>
        <p class="mt-3 text-2xl font-bold text-slate-900">{stats.completionRate}%</p>
        <p class="text-sm text-slate-500">Completion Rate</p>
      </div>

      <div class="bg-white rounded-xl border border-slate-200 p-4">
        <div class="flex items-center justify-between">
          <div class="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
            <DollarSign class="text-purple-600" size={20} />
          </div>
          <div class="flex items-center gap-1 text-green-600 text-sm">
            <TrendingUp size={14} />
            15%
          </div>
        </div>
        <p class="mt-3 text-2xl font-bold text-slate-900">${stats.totalPayouts.toLocaleString()}</p>
        <p class="text-sm text-slate-500">Total Payouts</p>
      </div>

      <div class="bg-white rounded-xl border border-slate-200 p-4">
        <div class="flex items-center justify-between">
          <div class="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
            <Clock class="text-amber-600" size={20} />
          </div>
          <div class="flex items-center gap-1 text-red-600 text-sm">
            <TrendingDown size={14} />
            5%
          </div>
        </div>
        <p class="mt-3 text-2xl font-bold text-slate-900">{stats.avgTaskTime}h</p>
        <p class="text-sm text-slate-500">Avg Task Time</p>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Tasks by Status -->
      <div class="bg-white rounded-xl border border-slate-200 p-6">
        <h2 class="text-lg font-semibold text-slate-900 mb-4">Tasks by Status</h2>

        <div class="space-y-3">
          {#each Object.entries(tasksByStatus) as [status, count]}
            {@const total = Object.values(tasksByStatus).reduce((a, b) => a + b, 0)}
            {@const percent = (count / total) * 100}
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
      </div>

      <!-- Payouts by Type -->
      <div class="bg-white rounded-xl border border-slate-200 p-6">
        <h2 class="text-lg font-semibold text-slate-900 mb-4">Payouts by Type</h2>

        <div class="space-y-4">
          {#each Object.entries(payoutsByType) as [type, amount]}
            {@const total = Object.values(payoutsByType).reduce((a, b) => a + b, 0)}
            {@const percent = (amount / total) * 100}
            <div class="flex items-center gap-4">
              <div class="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <DollarSign class="text-slate-600" size={20} />
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
              ${Object.values(payoutsByType).reduce((a, b) => a + b, 0).toLocaleString()}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Monthly Trend -->
    <div class="bg-white rounded-xl border border-slate-200 p-6">
      <h2 class="text-lg font-semibold text-slate-900 mb-4">Monthly Trend</h2>

      <div class="h-64 flex items-end gap-4">
        {#each monthlyTrend as month}
          {@const maxTasks = Math.max(...monthlyTrend.map(m => m.tasks))}
          {@const maxPayouts = Math.max(...monthlyTrend.map(m => m.payouts))}
          <div class="flex-1 flex flex-col items-center gap-2">
            <div class="w-full flex gap-1 items-end h-48">
              <div
                class="flex-1 bg-indigo-500 rounded-t-lg transition-all duration-500"
                style="height: {(month.tasks / maxTasks) * 100}%"
                title="{month.tasks} tasks"
              ></div>
              <div
                class="flex-1 bg-green-500 rounded-t-lg transition-all duration-500"
                style="height: {(month.payouts / maxPayouts) * 100}%"
                title="${month.payouts.toLocaleString()}"
              ></div>
            </div>
            <span class="text-sm text-slate-600">{month.month}</span>
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

    <!-- Additional Stats -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div class="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl p-6 text-white">
        <h3 class="text-sm font-medium opacity-90">QC Pass Rate</h3>
        <p class="text-3xl font-bold mt-2">{stats.qcPassRate}%</p>
        <p class="text-sm opacity-75 mt-1">First-time approval</p>
      </div>

      <div class="bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl p-6 text-white">
        <h3 class="text-sm font-medium opacity-90">Average Payout</h3>
        <p class="text-3xl font-bold mt-2">${stats.avgPayout}</p>
        <p class="text-sm opacity-75 mt-1">Per task</p>
      </div>

      <div class="bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl p-6 text-white">
        <h3 class="text-sm font-medium opacity-90">Active Projects</h3>
        <p class="text-3xl font-bold mt-2">{stats.activeProjects}</p>
        <p class="text-sm opacity-75 mt-1">In progress</p>
      </div>
    </div>
  {/if}
</div>

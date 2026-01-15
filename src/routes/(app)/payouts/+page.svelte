<script lang="ts">
  import { onMount } from 'svelte';
  import { user } from '$lib/stores/auth';
  import { payoutsApi } from '$lib/services/api';
  import { formatCurrency } from '$lib/utils/payout';
  import type { Payout } from '$lib/types';
  import {
    DollarSign,
    TrendingUp,
    Clock,
    CheckCircle,
    Calendar,
    Filter,
    Download,
    ChevronDown
  } from 'lucide-svelte';

  let payouts: Payout[] = [];
  let loading = true;
  let summary = { total: 0, pending: 0, byType: {} as Record<string, number> };
  let selectedPeriod: 'week' | 'month' | 'year' = 'month';
  let filterType: string | null = null;
  const periodOptions: Array<'week' | 'month' | 'year'> = ['week', 'month', 'year'];

  $: filteredPayouts = filterType 
    ? payouts.filter(p => p.payout_type === filterType)
    : payouts;

  onMount(async () => {
    await loadData();
  });

  async function loadData() {
    if (!$user) return;
    
    loading = true;
    try {
      [payouts, summary] = await Promise.all([
        payoutsApi.listByUser($user.id, { limit: 50 }),
        payoutsApi.getSummary($user.id, selectedPeriod)
      ]);
    } catch (error) {
      console.error('Failed to load payouts:', error);
    } finally {
      loading = false;
    }
  }

  async function handlePeriodChange(period: 'week' | 'month' | 'year') {
    selectedPeriod = period;
    await loadData();
  }

  function getPayoutTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      task: 'Task Completion',
      qc: 'QC Review',
      pm_bonus: 'PM Bonus',
      sales_commission: 'Sales Commission'
    };
    return labels[type] || type;
  }

  function getPayoutTypeColor(type: string): string {
    const colors: Record<string, string> = {
      task: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300',
      qc: 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300',
      pm_bonus: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300',
      sales_commission: 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300'
    };
    return colors[type] || 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-300';
  }

  function getStatusBadge(status: string): { color: string; icon: typeof CheckCircle } {
    switch (status) {
      case 'paid':
        return { color: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300', icon: CheckCircle };
      case 'approved':
        return { color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300', icon: CheckCircle };
      default:
        return { color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300', icon: Clock };
    }
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }
</script>

<div class="space-y-8">
  <!-- Header -->
  <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
    <div>
      <h1 class="text-2xl font-bold text-slate-900 dark:text-white">Payouts</h1>
      <p class="mt-1 text-slate-600 dark:text-slate-300">Track your earnings and payment history</p>
    </div>

    <div class="flex items-center gap-3">
      <!-- Period selector -->
      <div class="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
        {#each periodOptions as period}
          <button
            class="px-4 py-2 text-sm font-medium rounded-md transition-colors
              {selectedPeriod === period ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}"
            on:click={() => handlePeriodChange(period)}
          >
            {period.charAt(0).toUpperCase() + period.slice(1)}
          </button>
        {/each}
      </div>

      <button class="flex items-center gap-2 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-900 dark:text-white transition-colors">
        <Download size={18} />
        Export
      </button>
    </div>
  </div>

  <!-- Summary Cards -->
  <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
    <div class="bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl p-6 text-white">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-green-100 text-sm font-medium">Total Earned</p>
          <p class="text-3xl font-bold mt-1">{formatCurrency(summary.total)}</p>
          <p class="text-green-200 text-sm mt-2">This {selectedPeriod}</p>
        </div>
        <div class="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center">
          <DollarSign size={28} />
        </div>
      </div>
    </div>

    <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-slate-600 dark:text-slate-400 text-sm font-medium">Pending</p>
          <p class="text-3xl font-bold text-slate-900 dark:text-white mt-1">{formatCurrency(summary.pending)}</p>
          <p class="text-slate-500 dark:text-slate-400 text-sm mt-2">Awaiting approval</p>
        </div>
        <div class="w-14 h-14 bg-amber-100 dark:bg-amber-900/30 rounded-xl flex items-center justify-center">
          <Clock class="text-amber-600 dark:text-amber-400" size={28} />
        </div>
      </div>
    </div>

    <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-slate-600 dark:text-slate-400 text-sm font-medium">Avg per Task</p>
          <p class="text-3xl font-bold text-slate-900 dark:text-white mt-1">
            {formatCurrency(payouts.length > 0 ? summary.total / payouts.length : 0)}
          </p>
          <p class="text-slate-500 dark:text-slate-400 text-sm mt-2">{payouts.length} payouts</p>
        </div>
        <div class="w-14 h-14 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center">
          <TrendingUp class="text-indigo-600 dark:text-indigo-400" size={28} />
        </div>
      </div>
    </div>
  </div>

  <!-- Earnings by Type -->
  {#if Object.keys(summary.byType).length > 0}
    <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
      <h3 class="font-semibold text-slate-900 dark:text-white mb-4">Earnings by Type</h3>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        {#each Object.entries(summary.byType) as [type, amount]}
          <button
            class="p-4 rounded-lg border-2 transition-colors text-left
              {filterType === type ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' : 'border-slate-100 dark:border-slate-700 hover:border-slate-200 dark:hover:border-slate-600'}"
            on:click={() => filterType = filterType === type ? null : type}
          >
            <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium {getPayoutTypeColor(type)}">
              {getPayoutTypeLabel(type)}
            </span>
            <p class="text-xl font-bold text-slate-900 dark:text-white mt-2">{formatCurrency(amount)}</p>
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Payout History -->
  <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
    <div class="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
      <h3 class="font-semibold text-slate-900 dark:text-white">Payment History</h3>
      {#if filterType}
        <button
          class="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
          on:click={() => filterType = null}
        >
          Clear filter
        </button>
      {/if}
    </div>

    {#if loading}
      <div class="p-12 flex justify-center">
        <div class="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    {:else if filteredPayouts.length === 0}
      <div class="p-12 text-center">
        <DollarSign class="mx-auto text-slate-300 dark:text-slate-600 mb-4" size={48} />
        <p class="text-slate-500 dark:text-slate-400">No payouts yet</p>
        <p class="text-sm text-slate-400 dark:text-slate-500 mt-1">Complete tasks to start earning!</p>
      </div>
    {:else}
      <div class="divide-y divide-slate-100 dark:divide-slate-700">
        {#each filteredPayouts as payout}
          {@const statusInfo = getStatusBadge(payout.status)}
          <div class="px-6 py-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
            <div class="flex items-center gap-4">
              <div class="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                <DollarSign class="text-slate-600 dark:text-slate-400" size={20} />
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <span class="font-medium text-slate-900 dark:text-white">
                    {payout.task?.title || getPayoutTypeLabel(payout.payout_type)}
                  </span>
                  <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium {getPayoutTypeColor(payout.payout_type)}">
                    {getPayoutTypeLabel(payout.payout_type)}
                  </span>
                </div>
                <div class="flex items-center gap-3 mt-1 text-sm text-slate-500 dark:text-slate-400">
                  <span class="flex items-center gap-1">
                    <Calendar size={14} />
                    {formatDate(payout.created_at)}
                  </span>
                  <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium {statusInfo.color}">
                    <svelte:component this={statusInfo.icon} size={12} />
                    {payout.status}
                  </span>
                </div>
              </div>
            </div>
            <div class="text-right">
              <p class="text-lg font-bold text-slate-900 dark:text-white">{formatCurrency(payout.net_amount)}</p>
              {#if payout.deductions > 0}
                <p class="text-xs text-slate-500 dark:text-slate-400">
                  {formatCurrency(payout.gross_amount)} - {formatCurrency(payout.deductions)} fees
                </p>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

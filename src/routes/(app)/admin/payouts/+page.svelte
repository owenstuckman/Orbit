<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { currentOrgRole } from '$lib/stores/auth';
  import { payoutsApi } from '$lib/services/api';
  import { formatCurrency } from '$lib/utils/payout';
  import LoadingSkeleton from '$lib/components/common/LoadingSkeleton.svelte';
  import EmptyState from '$lib/components/common/EmptyState.svelte';
  import type { Payout } from '$lib/types';
  import {
    DollarSign,
    CheckCircle,
    Clock,
    Check,
    ChevronLeft,
    Filter,
    RefreshCw
  } from 'lucide-svelte';

  let payouts: Payout[] = [];
  let loading = true;
  let filterStatus: 'all' | 'pending' | 'approved' | 'paid' = 'pending';
  let processingIds = new Set<string>();

  $: filtered = filterStatus === 'all' ? payouts : payouts.filter(p => p.status === filterStatus);
  $: pendingCount = payouts.filter(p => p.status === 'pending').length;
  $: approvedCount = payouts.filter(p => p.status === 'approved').length;
  $: pendingTotal = payouts.filter(p => p.status === 'pending').reduce((s, p) => s + p.net_amount, 0);
  $: approvedTotal = payouts.filter(p => p.status === 'approved').reduce((s, p) => s + p.net_amount, 0);

  onMount(async () => {
    if ($currentOrgRole !== 'admin') {
      goto('/dashboard');
      return;
    }
    await load();
  });

  async function load() {
    loading = true;
    payouts = await payoutsApi.listAll();
    loading = false;
  }

  async function approvePayout(payout: Payout) {
    processingIds = new Set([...processingIds, payout.id]);
    const updated = await payoutsApi.update(payout.id, { status: 'approved' });
    if (updated) {
      payouts = payouts.map(p => p.id === payout.id ? { ...p, status: 'approved' } : p);
    }
    processingIds = new Set([...processingIds].filter(id => id !== payout.id));
  }

  async function markPaid(payout: Payout) {
    processingIds = new Set([...processingIds, payout.id]);
    const updated = await payoutsApi.update(payout.id, {
      status: 'paid',
      paid_at: new Date().toISOString()
    });
    if (updated) {
      payouts = payouts.map(p => p.id === payout.id ? { ...p, status: 'paid', paid_at: updated.paid_at } : p);
    }
    processingIds = new Set([...processingIds].filter(id => id !== payout.id));
  }

  async function approveAll() {
    const pending = payouts.filter(p => p.status === 'pending');
    for (const p of pending) await approvePayout(p);
  }

  async function payAll() {
    const approvable = payouts.filter(p => p.status === 'pending' || p.status === 'approved');
    for (const p of approvable) await markPaid(p);
  }

  function formatDate(s: string) {
    return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function roleColor(role: string) {
    const map: Record<string, string> = {
      employee: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
      qc: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
      pm: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
      contractor: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
      admin: 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
    };
    return map[role] ?? map.admin;
  }

  function typeColor(type: string) {
    const map: Record<string, string> = {
      task: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
      qc: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
      pm_bonus: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
      sales_commission: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
    };
    return map[type] ?? 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300';
  }

  function typeLabel(type: string) {
    const map: Record<string, string> = {
      task: 'Task', qc: 'QC Review', pm_bonus: 'PM Bonus', sales_commission: 'Commission'
    };
    return map[type] ?? type;
  }
</script>

<svelte:head>
  <title>Payout Management - Orbit Admin</title>
</svelte:head>

<div class="space-y-6">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-3">
      <a href="/admin" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
        <ChevronLeft size={20} />
      </a>
      <div>
        <h1 class="text-2xl font-bold text-slate-900 dark:text-white">Payout Management</h1>
        <p class="mt-0.5 text-slate-500 dark:text-slate-400 text-sm">Review and approve earned payouts</p>
      </div>
    </div>

    <div class="flex items-center gap-2">
      <button
        on:click={load}
        class="p-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
        title="Refresh"
      >
        <RefreshCw size={18} />
      </button>

      {#if pendingCount > 0}
        <button
          on:click={approveAll}
          class="flex items-center gap-2 px-4 py-2 border border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 text-sm font-medium transition-colors"
        >
          <CheckCircle size={16} />
          Approve all pending ({pendingCount})
        </button>
      {/if}

      {#if pendingCount + approvedCount > 0}
        <button
          on:click={payAll}
          class="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Check size={16} />
          Mark all paid ({pendingCount + approvedCount})
        </button>
      {/if}
    </div>
  </div>

  <!-- Summary Cards -->
  <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
    <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 flex items-center gap-4">
      <div class="w-11 h-11 bg-amber-100 dark:bg-amber-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
        <Clock class="text-amber-600 dark:text-amber-400" size={22} />
      </div>
      <div>
        <p class="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">Pending</p>
        <p class="text-xl font-bold text-slate-900 dark:text-white">{formatCurrency(pendingTotal)}</p>
        <p class="text-xs text-slate-400 mt-0.5">{pendingCount} payout{pendingCount !== 1 ? 's' : ''}</p>
      </div>
    </div>

    <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 flex items-center gap-4">
      <div class="w-11 h-11 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
        <CheckCircle class="text-blue-600 dark:text-blue-400" size={22} />
      </div>
      <div>
        <p class="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">Approved</p>
        <p class="text-xl font-bold text-slate-900 dark:text-white">{formatCurrency(approvedTotal)}</p>
        <p class="text-xs text-slate-400 mt-0.5">{approvedCount} payout{approvedCount !== 1 ? 's' : ''}</p>
      </div>
    </div>

    <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 flex items-center gap-4">
      <div class="w-11 h-11 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
        <DollarSign class="text-green-600 dark:text-green-400" size={22} />
      </div>
      <div>
        <p class="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Paid (All Time)</p>
        <p class="text-xl font-bold text-slate-900 dark:text-white">
          {formatCurrency(payouts.filter(p => p.status === 'paid').reduce((s, p) => s + p.net_amount, 0))}
        </p>
        <p class="text-xs text-slate-400 mt-0.5">{payouts.filter(p => p.status === 'paid').length} completed</p>
      </div>
    </div>
  </div>

  <!-- Filter Tabs + Table -->
  <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
    <!-- Filter tabs -->
    <div class="px-6 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center gap-1">
      <Filter size={14} class="text-slate-400 mr-1" />
      {#each (['all', 'pending', 'approved', 'paid'] as const) as s}
        <button
          on:click={() => filterStatus = s}
          class="px-3 py-1.5 rounded-md text-sm font-medium transition-colors
            {filterStatus === s
              ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
              : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}"
        >
          {s.charAt(0).toUpperCase() + s.slice(1)}
          {#if s !== 'all'}
            <span class="ml-1 text-xs opacity-60">{payouts.filter(p => p.status === s).length}</span>
          {/if}
        </button>
      {/each}
    </div>

    {#if loading}
      <div class="p-6"><LoadingSkeleton type="table" rows={5} /></div>
    {:else if filtered.length === 0}
      <EmptyState icon={DollarSign} title="No payouts" description="Nothing here yet." />
    {:else}
      <!-- Table -->
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
              <th class="px-6 py-3 font-medium">Recipient</th>
              <th class="px-4 py-3 font-medium">Task</th>
              <th class="px-4 py-3 font-medium">Type</th>
              <th class="px-4 py-3 font-medium">Amount</th>
              <th class="px-4 py-3 font-medium">Date</th>
              <th class="px-4 py-3 font-medium">Status</th>
              <th class="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-700">
            {#each filtered as payout}
              {@const busy = processingIds.has(payout.id)}
              <tr class="hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors">
                <!-- Recipient -->
                <td class="px-6 py-4">
                  <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-700 dark:text-indigo-300 font-semibold text-xs flex-shrink-0">
                      {(payout.user?.full_name ?? payout.user?.email ?? '?')[0].toUpperCase()}
                    </div>
                    <div>
                      <p class="font-medium text-slate-900 dark:text-white leading-tight">
                        {payout.user?.full_name ?? payout.user?.email ?? '—'}
                      </p>
                      {#if payout.user?.role}
                        <span class="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium {roleColor(payout.user.role)}">
                          {payout.user.role}
                        </span>
                      {/if}
                    </div>
                  </div>
                </td>

                <!-- Task -->
                <td class="px-4 py-4 max-w-[180px]">
                  <p class="text-slate-700 dark:text-slate-300 truncate" title={payout.task?.title ?? ''}>
                    {payout.task?.title ?? <span class="text-slate-400">—</span>}
                  </p>
                </td>

                <!-- Type -->
                <td class="px-4 py-4">
                  <span class="px-2 py-0.5 rounded text-xs font-medium {typeColor(payout.payout_type)}">
                    {typeLabel(payout.payout_type)}
                  </span>
                </td>

                <!-- Amount -->
                <td class="px-4 py-4">
                  <p class="font-semibold text-slate-900 dark:text-white">{formatCurrency(payout.net_amount)}</p>
                  {#if payout.deductions > 0}
                    <p class="text-xs text-slate-400">gross {formatCurrency(payout.gross_amount)}</p>
                  {/if}
                </td>

                <!-- Date -->
                <td class="px-4 py-4 text-slate-500 dark:text-slate-400">
                  {formatDate(payout.created_at)}
                </td>

                <!-- Status -->
                <td class="px-4 py-4">
                  {#if payout.status === 'paid'}
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                      <Check size={11} /> Paid
                    </span>
                  {:else if payout.status === 'approved'}
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                      <CheckCircle size={11} /> Approved
                    </span>
                  {:else}
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                      <Clock size={11} /> Pending
                    </span>
                  {/if}
                </td>

                <!-- Actions -->
                <td class="px-4 py-4">
                  <div class="flex items-center gap-2">
                    {#if payout.status === 'pending'}
                      <button
                        on:click={() => approvePayout(payout)}
                        disabled={busy}
                        class="px-3 py-1 text-xs font-medium text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-700 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        Approve
                      </button>
                      <button
                        on:click={() => markPaid(payout)}
                        disabled={busy}
                        class="px-3 py-1 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        Mark Paid
                      </button>
                    {:else if payout.status === 'approved'}
                      <button
                        on:click={() => markPaid(payout)}
                        disabled={busy}
                        class="px-3 py-1 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        Mark Paid
                      </button>
                    {:else}
                      <span class="text-xs text-slate-400">
                        {payout.paid_at ? formatDate(payout.paid_at) : '—'}
                      </span>
                    {/if}
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
</div>

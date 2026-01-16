<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { user, currentOrgRole } from '$lib/stores/auth';
  import type { AuditLog } from '$lib/types';
  import {
    Activity,
    Search,
    Filter,
    ChevronDown,
    User as UserIcon,
    FileText,
    CheckCircle,
    Edit3,
    Trash2,
    Plus,
    Eye
  } from 'lucide-svelte';

  let logs: AuditLog[] = [];
  let loading = true;
  let searchQuery = '';
  let actionFilter = '';
  let entityFilter = '';

  const actions = ['create', 'update', 'delete', 'approve', 'reject', 'sign', 'submit'];
  const entities = ['task', 'project', 'user', 'contract', 'payout', 'qc_review'];

  onMount(async () => {
    if ($currentOrgRole !== 'admin') {
      goto('/dashboard');
      return;
    }

    await loadLogs();
  });

  async function loadLogs() {
    loading = true;
    try {
      // In a real implementation, this would call an audit API
      // For now, using mock data
      logs = generateMockLogs();
    } catch (error) {
      console.error('Failed to load audit logs:', error);
    } finally {
      loading = false;
    }
  }

  function generateMockLogs(): AuditLog[] {
    const mockLogs: AuditLog[] = [];
    const actions = ['create', 'update', 'delete', 'approve', 'submit'];
    const entities = ['task', 'project', 'contract', 'payout'];

    for (let i = 0; i < 20; i++) {
      mockLogs.push({
        id: `log-${i}`,
        org_id: 'org-1',
        user_id: `user-${i % 5}`,
        action: actions[i % actions.length],
        entity_type: entities[i % entities.length],
        entity_id: `entity-${i}`,
        old_data: i % 2 === 0 ? { status: 'pending' } : null,
        new_data: { status: 'completed' },
        created_at: new Date(Date.now() - i * 3600000).toISOString()
      });
    }

    return mockLogs;
  }

  $: filteredLogs = logs.filter(log => {
    const matchesSearch = searchQuery === '' ||
      log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.entity_type.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesAction = actionFilter === '' || log.action === actionFilter;
    const matchesEntity = entityFilter === '' || log.entity_type === entityFilter;
    return matchesSearch && matchesAction && matchesEntity;
  });

  function getActionIcon(action: string) {
    switch (action) {
      case 'create': return Plus;
      case 'update': return Edit3;
      case 'delete': return Trash2;
      case 'approve': return CheckCircle;
      default: return Activity;
    }
  }

  function getActionColor(action: string): string {
    switch (action) {
      case 'create': return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300';
      case 'update': return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300';
      case 'delete': return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300';
      case 'approve': return 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300';
      case 'reject': return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300';
      default: return 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300';
    }
  }

  function formatDate(date: string): string {
    return new Date(date).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
</script>

<svelte:head>
  <title>Audit Log - Orbit Admin</title>
</svelte:head>

<div class="space-y-6">
  <!-- Header -->
  <div>
    <h1 class="text-2xl font-bold text-slate-900 dark:text-white">Audit Log</h1>
    <p class="mt-1 text-slate-600 dark:text-slate-300">View all system activity and changes</p>
  </div>

  <!-- Filters -->
  <div class="flex flex-col sm:flex-row gap-4">
    <div class="relative flex-1">
      <Search class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={18} />
      <input
        type="text"
        bind:value={searchQuery}
        placeholder="Search logs..."
        class="w-full pl-10 pr-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
      />
    </div>

    <div class="relative">
      <select
        bind:value={actionFilter}
        class="appearance-none pl-4 pr-10 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
      >
        <option value="">All Actions</option>
        {#each actions as action}
          <option value={action}>{action.charAt(0).toUpperCase() + action.slice(1)}</option>
        {/each}
      </select>
      <ChevronDown class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none" size={16} />
    </div>

    <div class="relative">
      <select
        bind:value={entityFilter}
        class="appearance-none pl-4 pr-10 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
      >
        <option value="">All Entities</option>
        {#each entities as entity}
          <option value={entity}>{entity.charAt(0).toUpperCase() + entity.slice(1).replace('_', ' ')}</option>
        {/each}
      </select>
      <ChevronDown class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none" size={16} />
    </div>
  </div>

  <!-- Logs -->
  <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
    {#if loading}
      <div class="flex items-center justify-center py-20">
        <div class="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    {:else if filteredLogs.length === 0}
      <div class="text-center py-12">
        <Activity class="mx-auto text-slate-300 dark:text-slate-600 mb-3" size={48} />
        <p class="text-slate-500 dark:text-slate-400">No audit logs found</p>
      </div>
    {:else}
      <div class="divide-y divide-slate-100 dark:divide-slate-700">
        {#each filteredLogs as log}
          <div class="p-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
            <div class="flex items-start gap-4">
              <div class="w-10 h-10 rounded-lg {getActionColor(log.action)} flex items-center justify-center flex-shrink-0">
                <svelte:component this={getActionIcon(log.action)} size={18} />
              </div>

              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                  <span class="font-medium text-slate-900 dark:text-white capitalize">{log.action}</span>
                  <span class="text-slate-400 dark:text-slate-500">on</span>
                  <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 capitalize">
                    {log.entity_type.replace('_', ' ')}
                  </span>
                </div>

                <div class="flex items-center gap-4 text-sm text-slate-500 dark:text-slate-400">
                  <span class="flex items-center gap-1">
                    <UserIcon size={14} />
                    User {log.user_id?.slice(-4) || 'System'}
                  </span>
                  <span>{formatDate(log.created_at)}</span>
                </div>

                {#if log.old_data || log.new_data}
                  <div class="mt-2 p-2 bg-slate-50 dark:bg-slate-900/50 rounded text-xs font-mono text-slate-600 dark:text-slate-400">
                    {#if log.old_data}
                      <div class="text-red-600 dark:text-red-400">- {JSON.stringify(log.old_data)}</div>
                    {/if}
                    {#if log.new_data}
                      <div class="text-green-600 dark:text-green-400">+ {JSON.stringify(log.new_data)}</div>
                    {/if}
                  </div>
                {/if}
              </div>

              <button
                class="p-2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                title="View details"
              >
                <Eye size={16} />
              </button>
            </div>
          </div>
        {/each}
      </div>

      <!-- Pagination placeholder -->
      <div class="p-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
        <p class="text-sm text-slate-500 dark:text-slate-400">
          Showing {filteredLogs.length} of {logs.length} logs
        </p>
        <div class="flex gap-2">
          <button class="px-3 py-1 text-sm border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50" disabled>
            Previous
          </button>
          <button class="px-3 py-1 text-sm border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50" disabled>
            Next
          </button>
        </div>
      </div>
    {/if}
  </div>
</div>

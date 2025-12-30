<script lang="ts">
  import { onMount } from 'svelte';
  import { user, capabilities } from '$lib/stores/auth';
  import { contractsApi } from '$lib/services/api';
  import type { Contract } from '$lib/types';
  import { 
    FileText, 
    Search, 
    Filter,
    Clock,
    CheckCircle,
    AlertCircle,
    PenTool,
    ExternalLink,
    Plus
  } from 'lucide-svelte';

  let contracts: Contract[] = [];
  let loading = true;
  let error = '';
  let searchQuery = '';
  let statusFilter: string = 'all';

  $: filteredContracts = contracts.filter(contract => {
    const matchesSearch = !searchQuery || 
      contract.terms.party_a_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contract.terms.party_b_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contract.template_type.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || contract.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  onMount(async () => {
    await loadContracts();
  });

  async function loadContracts() {
    loading = true;
    error = '';
    try {
      // Get contracts where user is party_a or party_b
      const userContracts = await contractsApi.list({
        order: { column: 'created_at', ascending: false }
      });
      
      // Filter based on capabilities
      if ($capabilities.canViewContracts === 'own') {
        contracts = userContracts.filter(c => 
          c.party_a_id === $user?.id || c.party_b_id === $user?.id
        );
      } else if ($capabilities.canViewContracts === 'team') {
        contracts = userContracts;
      } else {
        contracts = userContracts;
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load contracts';
    } finally {
      loading = false;
    }
  }

  function getStatusBadge(status: string) {
    const badges: Record<string, { bg: string; text: string; icon: any }> = {
      draft: { bg: 'bg-slate-100', text: 'text-slate-800', icon: FileText },
      pending_signature: { bg: 'bg-yellow-100', text: 'text-yellow-800', icon: PenTool },
      active: { bg: 'bg-green-100', text: 'text-green-800', icon: CheckCircle },
      completed: { bg: 'bg-blue-100', text: 'text-blue-800', icon: CheckCircle },
      disputed: { bg: 'bg-red-100', text: 'text-red-800', icon: AlertCircle }
    };
    return badges[status] || { bg: 'bg-gray-100', text: 'text-gray-800', icon: FileText };
  }

  function formatDate(date: string | null) {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  function getContractTitle(contract: Contract) {
    if (contract.template_type === 'task') {
      return `Task Contract - ${contract.task?.title || 'Unknown'}`;
    } else if (contract.template_type === 'project') {
      return `Project Contract - ${contract.project?.name || 'Unknown'}`;
    }
    return `${contract.template_type} Contract`;
  }

  $: stats = {
    total: contracts.length,
    pending: contracts.filter(c => c.status === 'pending_signature').length,
    active: contracts.filter(c => c.status === 'active').length,
    needsSignature: contracts.filter(c => 
      c.status === 'pending_signature' && 
      ((c.party_a_id === $user?.id && !c.party_a_signed_at) ||
       (c.party_b_id === $user?.id && !c.party_b_signed_at))
    ).length
  };
</script>

<svelte:head>
  <title>Contracts - Orbit</title>
</svelte:head>

<div class="max-w-6xl mx-auto">
  <!-- Header -->
  <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
    <div>
      <h1 class="text-2xl font-bold text-slate-900">Contracts</h1>
      <p class="text-slate-600 mt-1">Manage your contracts and agreements</p>
    </div>
  </div>

  <!-- Stats -->
  <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
    <div class="bg-white rounded-xl border border-slate-200 p-4">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
          <FileText class="text-slate-600" size={20} />
        </div>
        <div>
          <p class="text-xs text-slate-500 uppercase tracking-wider">Total</p>
          <p class="text-xl font-bold text-slate-900">{stats.total}</p>
        </div>
      </div>
    </div>

    <div class="bg-white rounded-xl border border-slate-200 p-4">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
          <Clock class="text-yellow-600" size={20} />
        </div>
        <div>
          <p class="text-xs text-slate-500 uppercase tracking-wider">Pending</p>
          <p class="text-xl font-bold text-slate-900">{stats.pending}</p>
        </div>
      </div>
    </div>

    <div class="bg-white rounded-xl border border-slate-200 p-4">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
          <CheckCircle class="text-green-600" size={20} />
        </div>
        <div>
          <p class="text-xs text-slate-500 uppercase tracking-wider">Active</p>
          <p class="text-xl font-bold text-slate-900">{stats.active}</p>
        </div>
      </div>
    </div>

    <div class="bg-white rounded-xl border border-slate-200 p-4">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
          <PenTool class="text-amber-600" size={20} />
        </div>
        <div>
          <p class="text-xs text-slate-500 uppercase tracking-wider">Needs Signature</p>
          <p class="text-xl font-bold text-slate-900">{stats.needsSignature}</p>
        </div>
      </div>
    </div>
  </div>

  <!-- Filters -->
  <div class="bg-white rounded-xl border border-slate-200 p-4 mb-6">
    <div class="flex flex-col sm:flex-row gap-4">
      <div class="flex-1 relative">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
        <input
          type="text"
          bind:value={searchQuery}
          placeholder="Search contracts..."
          class="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        />
      </div>

      <div class="flex items-center gap-2">
        <Filter size={18} class="text-slate-400" />
        <select
          bind:value={statusFilter}
          class="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        >
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="pending_signature">Pending Signature</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="disputed">Disputed</option>
        </select>
      </div>
    </div>
  </div>

  <!-- Contracts list -->
  {#if loading}
    <div class="flex items-center justify-center py-20">
      <div class="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
    </div>
  {:else if error}
    <div class="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
      <AlertCircle class="mx-auto text-red-500 mb-2" size={32} />
      <p class="text-red-800">{error}</p>
      <button 
        class="mt-4 text-red-600 hover:text-red-800 underline"
        on:click={loadContracts}
      >
        Try again
      </button>
    </div>
  {:else if filteredContracts.length === 0}
    <div class="bg-white rounded-xl border border-slate-200 p-12 text-center">
      <FileText class="mx-auto text-slate-300 mb-4" size={64} />
      <h3 class="text-lg font-medium text-slate-900 mb-2">No contracts found</h3>
      <p class="text-slate-500">
        {#if searchQuery || statusFilter !== 'all'}
          Try adjusting your filters
        {:else}
          You don't have any contracts yet
        {/if}
      </p>
    </div>
  {:else}
    <div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="bg-slate-50 border-b border-slate-200">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Contract</th>
              <th class="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Parties</th>
              <th class="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Status</th>
              <th class="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Created</th>
              <th class="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Signatures</th>
              <th class="px-6 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            {#each filteredContracts as contract}
              {@const badge = getStatusBadge(contract.status)}
              <tr class="hover:bg-slate-50 transition-colors">
                <td class="px-6 py-4">
                  <div>
                    <p class="font-medium text-slate-900">{getContractTitle(contract)}</p>
                    <p class="text-sm text-slate-500 capitalize">{contract.template_type} contract</p>
                  </div>
                </td>
                <td class="px-6 py-4">
                  <div class="text-sm">
                    <p class="text-slate-900">{contract.terms.party_a_name || contract.party_a?.full_name || 'Unknown'}</p>
                    <p class="text-slate-500">& {contract.terms.party_b_name || contract.party_b?.full_name || contract.party_b_email || 'Pending'}</p>
                  </div>
                </td>
                <td class="px-6 py-4">
                  <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium {badge.bg} {badge.text}">
                    <svelte:component this={badge.icon} size={12} />
                    {contract.status.replace('_', ' ')}
                  </span>
                </td>
                <td class="px-6 py-4 text-sm text-slate-600">
                  {formatDate(contract.created_at)}
                </td>
                <td class="px-6 py-4">
                  <div class="flex items-center gap-2">
                    <div class="flex items-center gap-1">
                      {#if contract.party_a_signed_at}
                        <CheckCircle class="text-green-500" size={16} />
                      {:else}
                        <Clock class="text-slate-400" size={16} />
                      {/if}
                      <span class="text-xs text-slate-500">A</span>
                    </div>
                    <div class="flex items-center gap-1">
                      {#if contract.party_b_signed_at}
                        <CheckCircle class="text-green-500" size={16} />
                      {:else}
                        <Clock class="text-slate-400" size={16} />
                      {/if}
                      <span class="text-xs text-slate-500">B</span>
                    </div>
                  </div>
                </td>
                <td class="px-6 py-4 text-right">
                  <a
                    href="/contracts/{contract.id}"
                    class="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-medium text-sm"
                  >
                    View
                    <ExternalLink size={14} />
                  </a>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
</div>

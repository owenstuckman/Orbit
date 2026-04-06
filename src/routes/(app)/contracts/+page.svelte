<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { user, capabilities, currentOrgRole } from '$lib/stores/auth';
  import { contractsApi, contractTemplatesApi } from '$lib/services/api';
  import { toasts } from '$lib/stores/notifications';
  import type { Contract, ContractTemplate } from '$lib/types';
  import {
    FileText,
    Search,
    Filter,
    Clock,
    CheckCircle,
    AlertCircle,
    PenTool,
    ExternalLink,
    Plus,
    Download,
    Eye,
    X
  } from 'lucide-svelte';
  import { storage } from '$lib/services/supabase';

  let contracts: Contract[] = [];
  let loading = true;
  let error = '';
  let searchQuery = '';
  let statusFilter: string = 'all';

  // PDF viewer
  let pdfBlobUrl: string | null = null;
  let showPdfViewer = false;
  let loadingPdfId: string | null = null;
  let pdfViewerContract: Contract | null = null;

  // Create contract modal
  let showCreateModal = false;
  let availableTemplates: ContractTemplate[] = [];
  let selectedTemplate: ContractTemplate | null = null;
  let variableValues: Record<string, string> = {};
  let partyBEmail = '';
  let creating = false;

  $: isAdminOrPmOrSales = ['admin', 'pm', 'sales'].includes($currentOrgRole);

  // Helper to get party names from terms (handles both party_b_name and contractor_name)
  function getPartyBName(contract: Contract): string | null {
    return contract.terms?.party_b_name || contract.terms?.contractor_name || contract.party_b?.full_name || contract.party_b_email || null;
  }

  function getPartyAName(contract: Contract): string | null {
    return contract.terms?.party_a_name || contract.party_a?.full_name || null;
  }

  $: filteredContracts = contracts.filter(contract => {
    const searchLower = searchQuery.toLowerCase();
    const partyAName = getPartyAName(contract)?.toLowerCase() || '';
    const partyBName = getPartyBName(contract)?.toLowerCase() || '';
    const taskTitle = (contract.terms?.task_title as string)?.toLowerCase() || '';

    const matchesSearch = !searchQuery ||
      partyAName.includes(searchLower) ||
      partyBName.includes(searchLower) ||
      taskTitle.includes(searchLower) ||
      contract.template_type.toLowerCase().includes(searchLower);

    const matchesStatus = statusFilter === 'all' || contract.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  onMount(async () => {
    // Route guard: Only PM, Sales, and Admin can access contracts (using org-specific role)
    if (!['pm', 'sales', 'admin'].includes($currentOrgRole)) {
      toasts.error('You do not have permission to access contracts');
      goto('/dashboard');
      return;
    }

    await loadContracts();
  });

  async function loadContracts() {
    loading = true;
    error = '';
    try {
      const orgId = $user?.org_id;
      if (!orgId) { contracts = []; return; }

      // List contract folders under the org's storage path
      const { data: folders, error: listError } = await storage.listFiles('contracts', orgId);
      if (listError) throw new Error(listError.message);
      if (!folders || folders.length === 0) { contracts = []; return; }

      // For each folder (contract_id), find the PDF file and merge with DB record
      const entries = await Promise.all(
        folders
          .filter(f => f.name && f.name !== '.emptyFolderPlaceholder')
          .map(async (folder) => {
            const contractId = folder.name;
            const { data: files } = await storage.listFiles('contracts', `${orgId}/${contractId}`);
            const pdfFile = files?.find(f => f.name.endsWith('.pdf'));
            const pdfPath = pdfFile ? `${orgId}/${contractId}/${pdfFile.name}` : null;

            // Try to get full DB record (may be null if RLS blocks)
            const dbRecord = await contractsApi.getById(contractId);
            if (dbRecord) {
              return { ...dbRecord, pdf_path: dbRecord.pdf_path ?? pdfPath };
            }

            // Storage-only fallback: show what we can from the path
            return {
              id: contractId,
              org_id: orgId,
              template_type: 'task_assignment',
              status: 'pending_signature',
              pdf_path: pdfPath,
              created_at: pdfFile?.created_at ?? new Date().toISOString(),
              terms: {},
              party_a: null,
              party_b: null,
              party_a_id: null,
              party_b_id: null,
              party_b_email: null,
              task: null,
              project: null,
              party_a_signed_at: null,
              party_b_signed_at: null,
            } as unknown as Contract;
          })
      );

      contracts = entries.filter(Boolean) as Contract[];
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load contracts';
    } finally {
      loading = false;
    }
  }

  function getStatusBadge(status: string) {
    const badges: Record<string, { bg: string; text: string; icon: any }> = {
      draft: { bg: 'bg-slate-100 dark:bg-slate-700', text: 'text-slate-800 dark:text-slate-200', icon: FileText },
      pending_signature: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-800 dark:text-yellow-400', icon: PenTool },
      active: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-800 dark:text-green-400', icon: CheckCircle },
      completed: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-800 dark:text-blue-400', icon: CheckCircle },
      disputed: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-800 dark:text-red-400', icon: AlertCircle }
    };
    return badges[status] || { bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-800 dark:text-gray-200', icon: FileText };
  }

  async function fetchPdfBlob(contract: Contract): Promise<Blob | null> {
    if (!contract.pdf_path) return null;
    const { data, error: downloadError } = await storage.downloadFile('contracts', contract.pdf_path);
    if (downloadError || !data) {
      console.error('PDF fetch failed:', downloadError);
      return null;
    }
    return data;
  }

  async function viewPdf(contract: Contract) {
    if (!contract.pdf_path) {
      toasts.error('No PDF available for this contract');
      return;
    }
    loadingPdfId = contract.id;
    try {
      const blob = await fetchPdfBlob(contract);
      if (!blob) { toasts.error('Failed to load PDF'); return; }
      if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
      pdfBlobUrl = URL.createObjectURL(blob);
      pdfViewerContract = contract;
      showPdfViewer = true;
    } catch (err) {
      toasts.error('Failed to load PDF');
    } finally {
      loadingPdfId = null;
    }
  }

  function closePdfViewer() {
    showPdfViewer = false;
    pdfViewerContract = null;
    if (pdfBlobUrl) {
      URL.revokeObjectURL(pdfBlobUrl);
      pdfBlobUrl = null;
    }
  }

  async function downloadPdf(contract: Contract) {
    if (!contract.pdf_path) {
      toasts.error('No PDF available for this contract');
      return;
    }

    try {
      const blob = await fetchPdfBlob(contract);
      if (!blob) { toasts.error('Failed to download PDF'); return; }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `contract-${contract.id.slice(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
      toasts.error('Failed to download PDF');
    }
  }

  async function openCreateModal() {
    if (!$user?.org_id) return;
    availableTemplates = await contractTemplatesApi.list($user.org_id);
    selectedTemplate = availableTemplates[0] ?? null;
    variableValues = {};
    partyBEmail = '';
    showCreateModal = true;
  }

  function selectTemplate(t: ContractTemplate) {
    selectedTemplate = t;
    variableValues = {};
  }

  async function submitCreateContract() {
    if (!selectedTemplate || !$user) return;
    if (!partyBEmail.trim()) { toasts.error('Counterparty email is required.'); return; }

    // Validate required variables
    const missing = selectedTemplate.variables
      .filter(v => v.required && !variableValues[v.key]?.trim())
      .map(v => v.label || v.key);
    if (missing.length) {
      toasts.error(`Fill in required fields: ${missing.join(', ')}`);
      return;
    }

    creating = true;
    const contract = await contractsApi.create(
      selectedTemplate.template_type,
      $user.id,
      {
        variable_values: variableValues,
        party_a_name: $user.full_name || $user.email,
        contractor_email: partyBEmail.trim()
      },
      {
        partyBEmail: partyBEmail.trim(),
        templateId: selectedTemplate.id
      }
    );
    creating = false;

    if (!contract) {
      toasts.error('Failed to create contract.');
      return;
    }

    toasts.success('Contract created.');
    showCreateModal = false;
    await loadContracts();
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
    if (contract.template_type === 'task' || contract.template_type === 'task_assignment') {
      return `Task Contract - ${contract.task?.title || contract.terms?.task_title || 'Unknown'}`;
    } else if (contract.template_type === 'project' || contract.template_type === 'project_pm') {
      return `Project Contract - ${contract.project?.name || 'Unknown'}`;
    } else if (contract.template_type === 'contractor') {
      return `Contractor Agreement - ${getPartyBName(contract) || 'Unknown'}`;
    }
    return `${contract.template_type.replace('_', ' ')} Contract`;
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
      <h1 class="text-2xl font-bold text-slate-900 dark:text-white">Contracts</h1>
      <p class="text-slate-600 dark:text-slate-400 mt-1">Manage your contracts and agreements</p>
    </div>
    {#if isAdminOrPmOrSales}
      <button
        on:click={openCreateModal}
        class="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors"
      >
        <Plus size={16} />
        New Contract
      </button>
    {/if}
  </div>

  <!-- Stats -->
  <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
    <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 bg-slate-100 dark:bg-slate-700 rounded-lg flex items-center justify-center">
          <FileText class="text-slate-600 dark:text-slate-400" size={20} />
        </div>
        <div>
          <p class="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total</p>
          <p class="text-xl font-bold text-slate-900 dark:text-white">{stats.total}</p>
        </div>
      </div>
    </div>

    <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg flex items-center justify-center">
          <Clock class="text-yellow-600 dark:text-yellow-400" size={20} />
        </div>
        <div>
          <p class="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">Pending</p>
          <p class="text-xl font-bold text-slate-900 dark:text-white">{stats.pending}</p>
        </div>
      </div>
    </div>

    <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
          <CheckCircle class="text-green-600 dark:text-green-400" size={20} />
        </div>
        <div>
          <p class="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">Active</p>
          <p class="text-xl font-bold text-slate-900 dark:text-white">{stats.active}</p>
        </div>
      </div>
    </div>

    <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-lg flex items-center justify-center">
          <PenTool class="text-amber-600 dark:text-amber-400" size={20} />
        </div>
        <div>
          <p class="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">Needs Signature</p>
          <p class="text-xl font-bold text-slate-900 dark:text-white">{stats.needsSignature}</p>
        </div>
      </div>
    </div>
  </div>

  <!-- Filters -->
  <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 mb-6">
    <div class="flex flex-col sm:flex-row gap-4">
      <div class="flex-1 relative">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
        <input
          type="text"
          bind:value={searchQuery}
          placeholder="Search contracts..."
          class="w-full pl-10 pr-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        />
      </div>

      <div class="flex items-center gap-2">
        <Filter size={18} class="text-slate-400" />
        <select
          bind:value={statusFilter}
          class="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
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
    <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6 text-center">
      <AlertCircle class="mx-auto text-red-500 dark:text-red-400 mb-2" size={32} />
      <p class="text-red-800 dark:text-red-300">{error}</p>
      <button
        class="mt-4 text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 underline"
        on:click={loadContracts}
      >
        Try again
      </button>
    </div>
  {:else if filteredContracts.length === 0}
    <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
      <FileText class="mx-auto text-slate-300 dark:text-slate-600 mb-4" size={64} />
      <h3 class="text-lg font-medium text-slate-900 dark:text-white mb-2">No contracts found</h3>
      <p class="text-slate-500 dark:text-slate-400">
        {#if searchQuery || statusFilter !== 'all'}
          Try adjusting your filters
        {:else}
          You don't have any contracts yet
        {/if}
      </p>
    </div>
  {:else}
    <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">Contract</th>
              <th class="px-6 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">Parties</th>
              <th class="px-6 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">Status</th>
              <th class="px-6 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">Created</th>
              <th class="px-6 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">Signatures</th>
              <th class="px-6 py-3 text-right text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-700">
            {#each filteredContracts as contract}
              {@const badge = getStatusBadge(contract.status)}
              <tr class="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                <td class="px-6 py-4">
                  <div>
                    <p class="font-medium text-slate-900 dark:text-white">{getContractTitle(contract)}</p>
                    <p class="text-sm text-slate-500 dark:text-slate-400 capitalize">{contract.template_type} contract</p>
                  </div>
                </td>
                <td class="px-6 py-4">
                  <div class="text-sm">
                    <p class="text-slate-900 dark:text-white">{getPartyAName(contract) || 'Unknown'}</p>
                    <p class="text-slate-500 dark:text-slate-400">& {getPartyBName(contract) || 'Pending'}</p>
                  </div>
                </td>
                <td class="px-6 py-4">
                  <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium {badge.bg} {badge.text}">
                    <svelte:component this={badge.icon} size={12} />
                    {contract.status.replace('_', ' ')}
                  </span>
                </td>
                <td class="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
                  {formatDate(contract.created_at)}
                </td>
                <td class="px-6 py-4">
                  <div class="flex items-center gap-2">
                    <div class="flex items-center gap-1">
                      {#if contract.party_a_signed_at}
                        <CheckCircle class="text-green-500 dark:text-green-400" size={16} />
                      {:else}
                        <Clock class="text-slate-400 dark:text-slate-500" size={16} />
                      {/if}
                      <span class="text-xs text-slate-500 dark:text-slate-400">A</span>
                    </div>
                    <div class="flex items-center gap-1">
                      {#if contract.party_b_signed_at}
                        <CheckCircle class="text-green-500 dark:text-green-400" size={16} />
                      {:else}
                        <Clock class="text-slate-400 dark:text-slate-500" size={16} />
                      {/if}
                      <span class="text-xs text-slate-500 dark:text-slate-400">B</span>
                    </div>
                  </div>
                </td>
                <td class="px-6 py-4 text-right">
                  <div class="flex items-center justify-end gap-2">
                    {#if contract.pdf_path}
                      <button
                        on:click={() => viewPdf(contract)}
                        disabled={loadingPdfId === contract.id}
                        class="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-colors disabled:opacity-50"
                        title="View PDF"
                      >
                        {#if loadingPdfId === contract.id}
                          <div class="w-4 h-4 border-2 border-indigo-400/30 border-t-indigo-500 rounded-full animate-spin"></div>
                        {:else}
                          <Eye size={16} />
                        {/if}
                      </button>
                      <button
                        on:click={() => downloadPdf(contract)}
                        class="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                        title="Download PDF"
                      >
                        <Download size={16} />
                      </button>
                    {:else}
                      <span class="text-xs text-slate-400 dark:text-slate-500 px-1">No PDF</span>
                    {/if}
                    <a
                      href="/contracts/{contract.id}"
                      class="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-medium text-sm"
                    >
                      Details
                      <ExternalLink size={14} />
                    </a>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
</div>

<!-- Create Contract Modal -->
{#if showCreateModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
    <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
      <div class="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700">
        <h2 class="text-lg font-semibold text-slate-900 dark:text-white">New Contract</h2>
        <button on:click={() => showCreateModal = false} class="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
          <X size={18} />
        </button>
      </div>

      <div class="flex-1 overflow-y-auto p-5 space-y-5">
        <!-- Template picker -->
        <div>
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Template</label>
          {#if availableTemplates.length === 0}
            <p class="text-sm text-slate-500 dark:text-slate-400">
              No templates found.
              {#if $currentOrgRole === 'admin'}
                <a href="/admin/contract-templates" class="text-indigo-600 dark:text-indigo-400 underline">Create one first.</a>
              {/if}
            </p>
          {:else}
            <div class="grid gap-2">
              {#each availableTemplates as t (t.id)}
                <button
                  on:click={() => selectTemplate(t)}
                  class="text-left px-4 py-3 rounded-lg border-2 transition-colors {selectedTemplate?.id === t.id ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500'}"
                >
                  <div class="flex items-center gap-2">
                    <span class="font-medium text-slate-900 dark:text-white text-sm">{t.name}</span>
                    {#if t.is_default}
                      <span class="px-1.5 py-0.5 text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded">Default</span>
                    {/if}
                  </div>
                  {#if t.description}
                    <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t.description}</p>
                  {/if}
                </button>
              {/each}
            </div>
          {/if}
        </div>

        {#if selectedTemplate}
          <!-- Counterparty email -->
          <div>
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Counterparty Email <span class="text-red-500">*</span>
            </label>
            <input
              bind:value={partyBEmail}
              type="email"
              placeholder="contractor@example.com"
              class="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <!-- Variable inputs -->
          {#if selectedTemplate.variables.length > 0}
            <div class="space-y-3">
              <p class="text-sm font-medium text-slate-700 dark:text-slate-300">Fill in Variables</p>
              {#each selectedTemplate.variables as v (v.key)}
                <div>
                  <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    {v.label || v.key}{v.required ? ' *' : ''}
                  </label>
                  <input
                    bind:value={variableValues[v.key]}
                    type="text"
                    placeholder={v.default ?? ''}
                    class="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              {/each}
            </div>
          {/if}
        {/if}
      </div>

      <div class="flex items-center justify-end gap-3 p-5 border-t border-slate-200 dark:border-slate-700">
        <button
          on:click={() => showCreateModal = false}
          class="px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
        >
          Cancel
        </button>
        <button
          on:click={submitCreateContract}
          disabled={creating || !selectedTemplate}
          class="inline-flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-lg font-medium text-sm transition-colors"
        >
          {creating ? 'Creating…' : 'Create Contract'}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Full-screen PDF Viewer -->
{#if showPdfViewer && pdfBlobUrl}
  <div class="fixed inset-0 z-[100] flex flex-col bg-black/90">
    <!-- Toolbar -->
    <div class="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-700 flex-shrink-0">
      <div class="flex items-center gap-3">
        <FileText size={18} class="text-slate-400" />
        <span class="text-white font-medium text-sm">
          {pdfViewerContract ? getContractTitle(pdfViewerContract) : 'Contract PDF'}
        </span>
      </div>
      <div class="flex items-center gap-2">
        {#if pdfViewerContract}
          <button
            on:click={() => { if (pdfViewerContract) downloadPdf(pdfViewerContract); }}
            class="flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm transition-colors"
          >
            <Download size={14} />
            Download
          </button>
          <a
            href="/contracts/{pdfViewerContract.id}"
            class="flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm transition-colors"
            on:click={closePdfViewer}
          >
            <ExternalLink size={14} />
            Details
          </a>
        {/if}
        <button
          on:click={closePdfViewer}
          class="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
          title="Close"
        >
          <X size={18} />
        </button>
      </div>
    </div>

    <!-- PDF iframe -->
    <iframe
      src={pdfBlobUrl}
      class="flex-1 w-full border-0"
      title="Contract PDF"
    />
  </div>
{/if}

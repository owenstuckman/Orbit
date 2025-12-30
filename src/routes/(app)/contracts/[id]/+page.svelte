<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { user } from '$lib/stores/auth';
  import { contractsApi } from '$lib/services/api';
  import { storage } from '$lib/services/supabase';
  import type { Contract } from '$lib/types';
  import { 
    ArrowLeft, 
    FileText, 
    CheckCircle, 
    Clock, 
    AlertCircle,
    PenTool,
    Download,
    User,
    Calendar,
    DollarSign,
    XCircle
  } from 'lucide-svelte';

  let contract: Contract | null = null;
  let loading = true;
  let error = '';
  let signing = false;
  let signError = '';

  $: contractId = $page.params.id;
  $: isPartyA = contract?.party_a_id === $user?.id;
  $: isPartyB = contract?.party_b_id === $user?.id;
  $: canSign = (isPartyA && !contract?.party_a_signed_at) || (isPartyB && !contract?.party_b_signed_at);
  $: mySignature = isPartyA ? contract?.party_a_signed_at : (isPartyB ? contract?.party_b_signed_at : null);

  onMount(async () => {
    await loadContract();
  });

  async function loadContract() {
    if (!contractId) {
      error = 'Contract ID is missing';
      return;
    }
    loading = true;
    error = '';
    try {
      contract = await contractsApi.getById(contractId);
      if (!contract) {
        error = 'Contract not found';
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load contract';
    } finally {
      loading = false;
    }
  }

  async function signContract() {
    if (!contract || !$user) return;
    
    signing = true;
    signError = '';
    
    try {
      const partyType = isPartyA ? 'a' : 'b';
      const updated = await contractsApi.sign(contract.id, partyType);
      if (updated) {
        contract = { ...contract, ...updated };
      }
    } catch (err) {
      signError = err instanceof Error ? err.message : 'Failed to sign contract';
    } finally {
      signing = false;
    }
  }

  async function downloadPdf() {
    if (!contract?.pdf_path) return;
    
    try {
      const { data, error: downloadError } = await storage.downloadFile('contracts', contract.pdf_path);
      if (downloadError) throw downloadError;
      if (!data) throw new Error('No data received');
      
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `contract-${contract.id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
    }
  }

  function getStatusBadge(status: string) {
    const badges: Record<string, { bg: string; text: string; label: string }> = {
      draft: { bg: 'bg-slate-100', text: 'text-slate-800', label: 'Draft' },
      pending_signature: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Pending Signature' },
      active: { bg: 'bg-green-100', text: 'text-green-800', label: 'Active' },
      completed: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Completed' },
      disputed: { bg: 'bg-red-100', text: 'text-red-800', label: 'Disputed' }
    };
    return badges[status] || { bg: 'bg-gray-100', text: 'text-gray-800', label: status };
  }

  function formatDate(date: string | null) {
    if (!date) return 'Not signed';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function formatCurrency(amount: number | undefined) {
    if (!amount) return '—';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  }
</script>

<svelte:head>
  <title>Contract - Orbit</title>
</svelte:head>

<div class="max-w-4xl mx-auto">
  <!-- Back button -->
  <a 
    href="/contracts" 
    class="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-6 transition-colors"
  >
    <ArrowLeft size={18} />
    Back to contracts
  </a>

  {#if loading}
    <div class="flex items-center justify-center py-20">
      <div class="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
    </div>
  {:else if error}
    <div class="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
      <XCircle class="mx-auto text-red-500 mb-2" size={32} />
      <p class="text-red-800">{error}</p>
      <button 
        class="mt-4 text-red-600 hover:text-red-800 underline"
        on:click={loadContract}
      >
        Try again
      </button>
    </div>
  {:else if contract}
    <!-- Header -->
    <div class="bg-white rounded-xl border border-slate-200 p-6 mb-6">
      <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <div class="flex items-center gap-3 mb-2">
            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium {getStatusBadge(contract.status).bg} {getStatusBadge(contract.status).text}">
              {getStatusBadge(contract.status).label}
            </span>
            <span class="text-sm text-slate-500 capitalize">{contract.template_type} contract</span>
          </div>
          <h1 class="text-2xl font-bold text-slate-900">Contract Agreement</h1>
          <p class="text-slate-600 mt-1">ID: {contract.id.slice(0, 8)}...</p>
        </div>

        <div class="flex flex-wrap gap-3">
          {#if contract.pdf_path}
            <button
              on:click={downloadPdf}
              class="px-4 py-2 border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-2"
            >
              <Download size={18} />
              Download PDF
            </button>
          {/if}

          {#if canSign && contract.status === 'pending_signature'}
            <button
              on:click={signContract}
              disabled={signing}
              class="px-6 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {#if signing}
                <div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              {:else}
                <PenTool size={18} />
              {/if}
              Sign Contract
            </button>
          {/if}
        </div>
      </div>

      {#if signError}
        <div class="mt-4 bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2 text-sm text-red-700">
          <AlertCircle size={16} />
          {signError}
        </div>
      {/if}
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Contract details -->
      <div class="lg:col-span-2 space-y-6">
        <!-- Parties -->
        <div class="bg-white rounded-xl border border-slate-200 p-6">
          <h2 class="text-lg font-semibold text-slate-900 mb-4">Contract Parties</h2>
          
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <!-- Party A -->
            <div class="p-4 bg-slate-50 rounded-lg">
              <div class="flex items-center justify-between mb-3">
                <span class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Party A</span>
                {#if contract.party_a_signed_at}
                  <span class="inline-flex items-center gap-1 text-xs text-green-600">
                    <CheckCircle size={12} />
                    Signed
                  </span>
                {:else}
                  <span class="inline-flex items-center gap-1 text-xs text-slate-500">
                    <Clock size={12} />
                    Pending
                  </span>
                {/if}
              </div>
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
                  <span class="text-sm font-semibold text-indigo-700">
                    {(contract.party_a?.full_name || contract.terms.party_a_name || 'A').charAt(0)}
                  </span>
                </div>
                <div>
                  <p class="font-medium text-slate-900">
                    {contract.party_a?.full_name || contract.terms.party_a_name || 'Unknown'}
                  </p>
                  {#if contract.party_a?.email}
                    <p class="text-sm text-slate-500">{contract.party_a.email}</p>
                  {/if}
                </div>
              </div>
              {#if contract.party_a_signed_at}
                <p class="text-xs text-slate-500 mt-3">
                  Signed on {formatDate(contract.party_a_signed_at)}
                </p>
              {/if}
            </div>

            <!-- Party B -->
            <div class="p-4 bg-slate-50 rounded-lg">
              <div class="flex items-center justify-between mb-3">
                <span class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Party B</span>
                {#if contract.party_b_signed_at}
                  <span class="inline-flex items-center gap-1 text-xs text-green-600">
                    <CheckCircle size={12} />
                    Signed
                  </span>
                {:else}
                  <span class="inline-flex items-center gap-1 text-xs text-slate-500">
                    <Clock size={12} />
                    Pending
                  </span>
                {/if}
              </div>
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                  <span class="text-sm font-semibold text-purple-700">
                    {(contract.party_b?.full_name || contract.terms.party_b_name || contract.party_b_email || 'B').charAt(0)}
                  </span>
                </div>
                <div>
                  <p class="font-medium text-slate-900">
                    {contract.party_b?.full_name || contract.terms.party_b_name || contract.party_b_email || 'Pending assignment'}
                  </p>
                  {#if contract.party_b?.email || contract.party_b_email}
                    <p class="text-sm text-slate-500">{contract.party_b?.email || contract.party_b_email}</p>
                  {/if}
                </div>
              </div>
              {#if contract.party_b_signed_at}
                <p class="text-xs text-slate-500 mt-3">
                  Signed on {formatDate(contract.party_b_signed_at)}
                </p>
              {/if}
            </div>
          </div>
        </div>

        <!-- Terms -->
        <div class="bg-white rounded-xl border border-slate-200 p-6">
          <h2 class="text-lg font-semibold text-slate-900 mb-4">Contract Terms</h2>
          
          {#if contract.terms.sections && contract.terms.sections.length > 0}
            <div class="space-y-4">
              {#each contract.terms.sections as section, i}
                <div class="prose prose-slate max-w-none">
                  <p class="text-slate-700">{section}</p>
                </div>
                {#if i < contract.terms.sections.length - 1}
                  <hr class="border-slate-100" />
                {/if}
              {/each}
            </div>
          {:else}
            <div class="bg-slate-50 rounded-lg p-4">
              <pre class="text-sm text-slate-700 whitespace-pre-wrap">{JSON.stringify(contract.terms, null, 2)}</pre>
            </div>
          {/if}
        </div>

        <!-- Related entities -->
        {#if contract.task || contract.project}
          <div class="bg-white rounded-xl border border-slate-200 p-6">
            <h2 class="text-lg font-semibold text-slate-900 mb-4">Related To</h2>
            
            {#if contract.task}
              <a 
                href="/tasks/{contract.task.id}"
                class="block p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                    <FileText class="text-blue-600" size={20} />
                  </div>
                  <div>
                    <p class="text-xs text-slate-500 uppercase tracking-wider">Task</p>
                    <p class="font-medium text-slate-900">{contract.task.title}</p>
                  </div>
                </div>
              </a>
            {/if}

            {#if contract.project}
              <a 
                href="/projects/{contract.project.id}"
                class="block p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors {contract.task ? 'mt-3' : ''}"
              >
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                    <FileText class="text-purple-600" size={20} />
                  </div>
                  <div>
                    <p class="text-xs text-slate-500 uppercase tracking-wider">Project</p>
                    <p class="font-medium text-slate-900">{contract.project.name}</p>
                  </div>
                </div>
              </a>
            {/if}
          </div>
        {/if}
      </div>

      <!-- Sidebar -->
      <div class="space-y-6">
        <!-- Summary -->
        <div class="bg-white rounded-xl border border-slate-200 p-6">
          <h3 class="text-sm font-semibold text-slate-900 uppercase tracking-wider mb-4">Summary</h3>
          
          <dl class="space-y-4">
            {#if contract.terms.compensation}
              <div>
                <dt class="text-xs text-slate-500 uppercase tracking-wider flex items-center gap-1">
                  <DollarSign size={12} />
                  Compensation
                </dt>
                <dd class="mt-1 text-lg font-semibold text-slate-900">
                  {formatCurrency(contract.terms.compensation)}
                </dd>
              </div>
            {/if}

            {#if contract.terms.timeline}
              <div>
                <dt class="text-xs text-slate-500 uppercase tracking-wider flex items-center gap-1">
                  <Calendar size={12} />
                  Timeline
                </dt>
                <dd class="mt-1 text-slate-700">{contract.terms.timeline}</dd>
              </div>
            {/if}

            <div>
              <dt class="text-xs text-slate-500 uppercase tracking-wider">Template</dt>
              <dd class="mt-1 text-slate-700 capitalize">{contract.template_type}</dd>
            </div>

            <div>
              <dt class="text-xs text-slate-500 uppercase tracking-wider">Created</dt>
              <dd class="mt-1 text-slate-700">{formatDate(contract.created_at)}</dd>
            </div>

            <div>
              <dt class="text-xs text-slate-500 uppercase tracking-wider">Last Updated</dt>
              <dd class="mt-1 text-slate-700">{formatDate(contract.updated_at)}</dd>
            </div>
          </dl>
        </div>

        <!-- Signature status -->
        <div class="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl p-6 text-white">
          <h3 class="text-sm font-semibold uppercase tracking-wider opacity-90 mb-4">Signature Status</h3>
          
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <span class="opacity-75">Party A</span>
              {#if contract.party_a_signed_at}
                <CheckCircle size={20} />
              {:else}
                <Clock size={20} class="opacity-50" />
              {/if}
            </div>
            <div class="flex items-center justify-between">
              <span class="opacity-75">Party B</span>
              {#if contract.party_b_signed_at}
                <CheckCircle size={20} />
              {:else}
                <Clock size={20} class="opacity-50" />
              {/if}
            </div>
          </div>

          {#if contract.status === 'active'}
            <div class="mt-4 pt-4 border-t border-white/20">
              <p class="text-sm opacity-90">
                ✓ Contract is fully executed and active
              </p>
            </div>
          {:else if canSign}
            <div class="mt-4 pt-4 border-t border-white/20">
              <p class="text-sm opacity-90">
                Your signature is required to activate this contract
              </p>
            </div>
          {/if}
        </div>
      </div>
    </div>
  {/if}
</div>

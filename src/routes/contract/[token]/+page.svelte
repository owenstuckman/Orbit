<script lang="ts">
  import type { PageData } from './$types';
  import { contractsApi } from '$lib/services/api';
  import { storage } from '$lib/services/supabase';
  import {
    FileText,
    CheckCircle,
    Clock,
    AlertCircle,
    PenTool,
    Download,
    DollarSign,
    Calendar,
    ExternalLink,
    User,
    Building
  } from 'lucide-svelte';

  export let data: PageData;
  $: contract = data.contract;
  $: token = data.token;

  let signing = false;
  let signError = '';
  let signSuccess = false;

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
    if (!amount) return '$0.00';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  }

  async function signContract() {
    signing = true;
    signError = '';

    try {
      const result = await contractsApi.signExternal(token);

      if (result.success) {
        signSuccess = true;
        // Update local contract state
        contract = {
          ...contract,
          party_b_signed_at: new Date().toISOString(),
          status: result.is_active ? 'active' : contract.status
        };
      } else {
        signError = result.error || 'Failed to sign contract';
      }
    } catch (err) {
      signError = err instanceof Error ? err.message : 'An error occurred';
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
      a.download = `contract-${contract.id.slice(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
    }
  }

  $: canSign = contract?.status === 'pending_signature' && !contract?.party_b_signed_at;
  $: alreadySigned = !!contract?.party_b_signed_at;
</script>

<svelte:head>
  <title>Contract - {contract.terms.party_b_name || 'External Contractor'}</title>
</svelte:head>

<div class="min-h-screen bg-slate-50">
  <!-- Header -->
  <header class="bg-white border-b border-slate-200">
    <div class="max-w-4xl mx-auto px-4 py-6">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
          <FileText class="text-indigo-600" size={20} />
        </div>
        <div>
          <h1 class="text-xl font-bold text-slate-900">Contract Agreement</h1>
          <p class="text-sm text-slate-500">Review and sign your contract</p>
        </div>
      </div>
    </div>
  </header>

  <main class="max-w-4xl mx-auto px-4 py-8">
    {#if signSuccess}
      <div class="bg-green-50 border border-green-200 rounded-xl p-6 mb-6">
        <div class="flex items-center gap-3">
          <CheckCircle class="text-green-600 flex-shrink-0" size={24} />
          <div>
            <h3 class="font-semibold text-green-800">Contract Signed Successfully!</h3>
            <p class="text-green-700 text-sm mt-1">
              {#if contract.status === 'active'}
                The contract is now active. Both parties have signed.
              {:else}
                Your signature has been recorded. The contract will be active once the client signs.
              {/if}
            </p>
          </div>
        </div>
      </div>
    {/if}

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Main Content -->
      <div class="lg:col-span-2 space-y-6">
        <!-- Contract Header -->
        <div class="bg-white rounded-xl border border-slate-200 p-6">
          <div class="flex items-start justify-between mb-4">
            <div>
              <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium {getStatusBadge(contract.status).bg} {getStatusBadge(contract.status).text}">
                {getStatusBadge(contract.status).label}
              </span>
              <h2 class="text-xl font-bold text-slate-900 mt-2">
                {contract.template_type === 'task_assignment' ? 'Task Assignment Contract' : 'Contract Agreement'}
              </h2>
              <p class="text-slate-500 text-sm mt-1">Contract ID: {contract.id.slice(0, 8)}...</p>
            </div>

            {#if contract.pdf_path}
              <button
                on:click={downloadPdf}
                class="flex items-center gap-2 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <Download size={18} />
                Download PDF
              </button>
            {/if}
          </div>

          {#if signError}
            <div class="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2 text-sm text-red-700 mb-4">
              <AlertCircle size={16} />
              {signError}
            </div>
          {/if}

          {#if canSign && !signSuccess}
            <div class="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
              <div class="flex items-start gap-3">
                <PenTool class="text-amber-600 flex-shrink-0 mt-0.5" size={20} />
                <div>
                  <h4 class="font-medium text-amber-800">Your Signature Required</h4>
                  <p class="text-sm text-amber-700 mt-1">
                    Please review the contract terms below and sign to confirm your agreement.
                  </p>
                </div>
              </div>
            </div>
          {/if}
        </div>

        <!-- Parties -->
        <div class="bg-white rounded-xl border border-slate-200 p-6">
          <h3 class="text-lg font-semibold text-slate-900 mb-4">Contract Parties</h3>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <!-- Party A (Client) -->
            <div class="p-4 bg-slate-50 rounded-lg">
              <div class="flex items-center justify-between mb-3">
                <span class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Party A (Client)</span>
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
                  <Building class="text-indigo-600" size={18} />
                </div>
                <div>
                  <p class="font-medium text-slate-900">
                    {contract.party_a?.full_name || contract.terms.party_a_name || 'Client'}
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

            <!-- Party B (Contractor) -->
            <div class="p-4 bg-slate-50 rounded-lg">
              <div class="flex items-center justify-between mb-3">
                <span class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Party B (You)</span>
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
                  <User class="text-purple-600" size={18} />
                </div>
                <div>
                  <p class="font-medium text-slate-900">
                    {contract.terms.party_b_name || 'Contractor'}
                  </p>
                  {#if contract.party_b_email}
                    <p class="text-sm text-slate-500">{contract.party_b_email}</p>
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

        <!-- Contract Terms -->
        <div class="bg-white rounded-xl border border-slate-200 p-6">
          <h3 class="text-lg font-semibold text-slate-900 mb-4">Contract Terms</h3>

          {#if contract.task}
            <div class="mb-6 p-4 bg-blue-50 border border-blue-100 rounded-lg">
              <h4 class="font-medium text-blue-900 mb-2">Task Details</h4>
              <p class="text-blue-800 font-semibold">{contract.task.title}</p>
              {#if contract.terms.task_description}
                <p class="text-sm text-blue-700 mt-2">{contract.terms.task_description}</p>
              {/if}
            </div>
          {/if}

          {#if contract.terms.sections && contract.terms.sections.length > 0}
            <div class="space-y-4">
              {#each contract.terms.sections as section, i}
                <div class="flex gap-3">
                  <span class="flex-shrink-0 w-6 h-6 bg-slate-100 rounded-full flex items-center justify-center text-xs font-medium text-slate-600">
                    {i + 1}
                  </span>
                  <p class="text-slate-700">{section}</p>
                </div>
              {/each}
            </div>
          {:else}
            <p class="text-slate-600">
              Standard contractor agreement terms apply. By signing this contract, you agree to complete the assigned work according to specifications and timelines.
            </p>
          {/if}
        </div>

        <!-- Sign Button -->
        {#if canSign && !signSuccess}
          <div class="bg-white rounded-xl border border-slate-200 p-6">
            <h3 class="text-lg font-semibold text-slate-900 mb-4">Sign Contract</h3>
            <p class="text-slate-600 mb-6">
              By clicking the button below, you confirm that you have read and agree to all the terms and conditions outlined in this contract.
            </p>
            <button
              on:click={signContract}
              disabled={signing}
              class="w-full flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {#if signing}
                <div class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                Signing...
              {:else}
                <PenTool size={20} />
                Sign Contract
              {/if}
            </button>
          </div>
        {:else if alreadySigned}
          <div class="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
            <CheckCircle class="mx-auto text-green-600 mb-3" size={40} />
            <h3 class="font-semibold text-green-800">You've Signed This Contract</h3>
            <p class="text-green-700 text-sm mt-1">
              Signed on {formatDate(contract.party_b_signed_at)}
            </p>
          </div>
        {/if}
      </div>

      <!-- Sidebar -->
      <div class="space-y-6">
        <!-- Compensation -->
        <div class="bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl p-6 text-white">
          <div class="flex items-center gap-2 text-green-100 text-sm mb-2">
            <DollarSign size={16} />
            Compensation
          </div>
          <p class="text-3xl font-bold">{formatCurrency(contract.terms.compensation)}</p>
        </div>

        <!-- Details -->
        <div class="bg-white rounded-xl border border-slate-200 p-6">
          <h3 class="font-semibold text-slate-900 mb-4">Details</h3>
          <div class="space-y-4">
            {#if contract.terms.timeline}
              <div class="flex items-start gap-3">
                <Calendar size={18} class="text-slate-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p class="text-xs text-slate-500 uppercase tracking-wider">Timeline</p>
                  <p class="text-slate-900">{contract.terms.timeline}</p>
                </div>
              </div>
            {/if}

            <div class="flex items-start gap-3">
              <FileText size={18} class="text-slate-400 flex-shrink-0 mt-0.5" />
              <div>
                <p class="text-xs text-slate-500 uppercase tracking-wider">Contract Type</p>
                <p class="text-slate-900 capitalize">{contract.template_type.replace('_', ' ')}</p>
              </div>
            </div>

            <div class="flex items-start gap-3">
              <Calendar size={18} class="text-slate-400 flex-shrink-0 mt-0.5" />
              <div>
                <p class="text-xs text-slate-500 uppercase tracking-wider">Created</p>
                <p class="text-slate-900">{formatDate(contract.created_at)}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Submit Work Link -->
        <div class="bg-indigo-50 border border-indigo-100 rounded-xl p-6">
          <h3 class="font-semibold text-indigo-900 mb-2">Ready to Submit Work?</h3>
          <p class="text-sm text-indigo-800 mb-4">
            Once you've completed your work, submit it through the submission portal.
          </p>
          <a
            href="/submit/{token}"
            class="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <ExternalLink size={18} />
            Go to Submission Portal
          </a>
        </div>
      </div>
    </div>
  </main>
</div>

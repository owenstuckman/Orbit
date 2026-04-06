<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { user } from '$lib/stores/auth';
  import { organization } from '$lib/stores/auth';
  import { contractsApi } from '$lib/services/api';
  import { storage } from '$lib/services/supabase';
  import { toasts } from '$lib/stores/notifications';
  import type { Contract } from '$lib/types';
  import { generateContractorAgreement, generateFromTemplate } from '$lib/services/contractPdf';
  import { contractTemplatesApi } from '$lib/services/api';
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
    XCircle,
    Eye,
    Loader,
    Sparkles,
    X
  } from 'lucide-svelte';

  let contract: Contract | null = null;
  let loading = true;
  let error = '';
  let signing = false;
  let signError = '';

  // PDF viewer state
  let pdfBlobUrl: string | null = null;
  let showPdfViewer = false;
  let loadingPdf = false;
  let generatingPdf = false;

  $: contractId = $page.params.id;
  $: isPartyA = contract?.party_a_id === $user?.id;
  $: isPartyB = contract?.party_b_id === $user?.id;
  $: canSign = (isPartyA && !contract?.party_a_signed_at) || (isPartyB && !contract?.party_b_signed_at);
  $: mySignature = isPartyA ? contract?.party_a_signed_at : (isPartyB ? contract?.party_b_signed_at : null);

  // Helper to get party names (handles both party_b_name and contractor_name)
  function getPartyBName(c: Contract | null): string {
    return c?.terms?.party_b_name || c?.terms?.contractor_name || c?.party_b?.full_name || c?.party_b_email || 'Pending';
  }

  function getPartyAName(c: Contract | null): string {
    return c?.terms?.party_a_name || c?.party_a?.full_name || 'Unknown';
  }

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

  async function loadPdfBlob(): Promise<Blob | null> {
    if (!contract?.pdf_path) return null;
    const { data, error: downloadError } = await storage.downloadFile('contracts', contract.pdf_path);
    if (downloadError || !data) {
      console.error('PDF download failed:', downloadError);
      return null;
    }
    return data;
  }

  async function viewPdf() {
    if (!contract?.pdf_path) return;
    loadingPdf = true;
    try {
      const blob = await loadPdfBlob();
      if (!blob) { toasts.error('Failed to load PDF'); return; }
      if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
      pdfBlobUrl = URL.createObjectURL(blob);
      showPdfViewer = true;
    } catch (err) {
      toasts.error('Failed to load PDF');
    } finally {
      loadingPdf = false;
    }
  }

  function closePdfViewer() {
    showPdfViewer = false;
    if (pdfBlobUrl) {
      URL.revokeObjectURL(pdfBlobUrl);
      pdfBlobUrl = null;
    }
  }

  async function downloadPdf() {
    if (!contract?.pdf_path) return;
    try {
      const blob = await loadPdfBlob();
      if (!blob) { toasts.error('Failed to download PDF'); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `contract-${contract.id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
      toasts.error('Failed to download PDF');
    }
  }

  async function generatePdf() {
    if (!contract || !$organization || !$user) return;
    generatingPdf = true;
    try {
      const contractorName = contract.terms?.contractor_name as string
        || contract.terms?.party_b_name as string
        || contract.party_b?.full_name
        || 'Contractor';
      const contractorEmail = contract.party_b_email
        || contract.terms?.contractor_email as string
        || contract.party_b?.email
        || '';

      let generated;

      // If contract has a template_id, use generateFromTemplate
      if (contract.template_id) {
        const template = await contractTemplatesApi.getById(contract.template_id);
        if (!template) {
          toasts.error('Contract template not found');
          generatingPdf = false;
          return;
        }
        const variableValues = (contract.terms?.variable_values as Record<string, string>) ?? {};
        generated = generateFromTemplate(template, variableValues, {
          contractId: contract.id,
          partyAName: $user.full_name || $user.email,
          partyAEmail: $user.email,
          orgName: $organization.name,
          partyBName: contractorName,
          partyBEmail: contractorEmail,
          createdAt: new Date(contract.created_at)
        });
      } else {
        // Legacy path: task-based hardcoded template
        const task = (contract as any).task;
        if (!task) {
          toasts.error('PDF generation requires a task-based contract or a template');
          generatingPdf = false;
          return;
        }
        generated = generateContractorAgreement({
          contractId: contract.id,
          contractorName,
          contractorEmail,
          task,
          organization: $organization,
          assignedBy: $user,
          createdAt: new Date(contract.created_at)
        });
      }

      const pdfPath = await contractsApi.uploadPdf(contract.id, generated.pdf, generated.filename);
      if (pdfPath) {
        contract = { ...contract, pdf_path: pdfPath };
        toasts.success('PDF generated successfully');
      } else {
        toasts.error('Failed to save PDF');
      }
    } catch (err) {
      console.error('PDF generation failed:', err);
      toasts.error('Failed to generate PDF');
    } finally {
      generatingPdf = false;
    }
  }

  onDestroy(() => {
    if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
  });

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
    class="inline-flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white mb-6 transition-colors"
  >
    <ArrowLeft size={18} />
    Back to contracts
  </a>

  {#if loading}
    <div class="flex items-center justify-center py-20">
      <div class="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
    </div>
  {:else if error}
    <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6 text-center">
      <XCircle class="mx-auto text-red-500 dark:text-red-400 mb-2" size={32} />
      <p class="text-red-800 dark:text-red-300">{error}</p>
      <button
        class="mt-4 text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 underline"
        on:click={loadContract}
      >
        Try again
      </button>
    </div>
  {:else if contract}
    <!-- Header -->
    <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 mb-6">
      <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <div class="flex items-center gap-3 mb-2">
            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium {getStatusBadge(contract.status).bg} {getStatusBadge(contract.status).text}">
              {getStatusBadge(contract.status).label}
            </span>
            <span class="text-sm text-slate-500 dark:text-slate-400 capitalize">{contract.template_type} contract</span>
          </div>
          <h1 class="text-2xl font-bold text-slate-900 dark:text-white">Contract Agreement</h1>
          <p class="text-slate-600 dark:text-slate-400 mt-1">ID: {contract.id.slice(0, 8)}...</p>
        </div>

        <div class="flex flex-wrap gap-3">
          {#if contract.pdf_path}
            <button
              on:click={viewPdf}
              disabled={loadingPdf}
              class="px-4 py-2 border border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 font-medium rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {#if loadingPdf}
                <div class="w-4 h-4 border-2 border-indigo-400/30 border-t-indigo-500 rounded-full animate-spin"></div>
              {:else}
                <Eye size={18} />
              {/if}
              View PDF
            </button>
            <button
              on:click={downloadPdf}
              class="px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 font-medium rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-2"
            >
              <Download size={18} />
              Download
            </button>
          {:else}
            <button
              on:click={generatePdf}
              disabled={generatingPdf}
              class="px-4 py-2 border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 font-medium rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors flex items-center gap-2 disabled:opacity-50"
              title="Generate and save a PDF for this contract"
            >
              {#if generatingPdf}
                <div class="w-4 h-4 border-2 border-amber-400/30 border-t-amber-500 rounded-full animate-spin"></div>
                Generating...
              {:else}
                <Sparkles size={18} />
                Generate PDF
              {/if}
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
        <div class="mt-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 flex items-center gap-2 text-sm text-red-700 dark:text-red-400">
          <AlertCircle size={16} />
          {signError}
        </div>
      {/if}
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Contract details -->
      <div class="lg:col-span-2 space-y-6">
        <!-- Parties -->
        <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
          <h2 class="text-lg font-semibold text-slate-900 dark:text-white mb-4">Contract Parties</h2>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <!-- Party A -->
            <div class="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
              <div class="flex items-center justify-between mb-3">
                <span class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Party A</span>
                {#if contract.party_a_signed_at}
                  <span class="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                    <CheckCircle size={12} />
                    Signed
                  </span>
                {:else}
                  <span class="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                    <Clock size={12} />
                    Pending
                  </span>
                {/if}
              </div>
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center">
                  <span class="text-sm font-semibold text-indigo-700 dark:text-indigo-300">
                    {getPartyAName(contract).charAt(0)}
                  </span>
                </div>
                <div>
                  <p class="font-medium text-slate-900 dark:text-white">
                    {getPartyAName(contract)}
                  </p>
                  {#if contract.party_a?.email}
                    <p class="text-sm text-slate-500 dark:text-slate-400">{contract.party_a.email}</p>
                  {/if}
                </div>
              </div>
              {#if contract.party_a_signed_at}
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-3">
                  Signed on {formatDate(contract.party_a_signed_at)}
                </p>
              {/if}
            </div>

            <!-- Party B -->
            <div class="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
              <div class="flex items-center justify-between mb-3">
                <span class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Party B</span>
                {#if contract.party_b_signed_at}
                  <span class="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                    <CheckCircle size={12} />
                    Signed
                  </span>
                {:else}
                  <span class="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                    <Clock size={12} />
                    Pending
                  </span>
                {/if}
              </div>
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center">
                  <span class="text-sm font-semibold text-purple-700 dark:text-purple-300">
                    {getPartyBName(contract).charAt(0)}
                  </span>
                </div>
                <div>
                  <p class="font-medium text-slate-900 dark:text-white">
                    {getPartyBName(contract)}
                  </p>
                  {#if contract.party_b?.email || contract.party_b_email}
                    <p class="text-sm text-slate-500 dark:text-slate-400">{contract.party_b?.email || contract.party_b_email}</p>
                  {/if}
                </div>
              </div>
              {#if contract.party_b_signed_at}
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-3">
                  Signed on {formatDate(contract.party_b_signed_at)}
                </p>
              {/if}
            </div>
          </div>
        </div>

        <!-- Terms -->
        <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
          <h2 class="text-lg font-semibold text-slate-900 dark:text-white mb-4">Contract Terms</h2>

          {#if contract.terms?.sections && contract.terms.sections.length > 0}
            <div class="space-y-4">
              {#each contract.terms.sections as section, i}
                <div class="prose prose-slate dark:prose-invert max-w-none">
                  <p class="text-slate-700 dark:text-slate-300">{section}</p>
                </div>
                {#if i < contract.terms.sections.length - 1}
                  <hr class="border-slate-100 dark:border-slate-700" />
                {/if}
              {/each}
            </div>
          {:else if contract.terms}
            <div class="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4">
              <pre class="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{JSON.stringify(contract.terms, null, 2)}</pre>
            </div>
          {:else}
            <p class="text-slate-500 dark:text-slate-400">No contract terms available.</p>
          {/if}
        </div>

        <!-- Related entities -->
        {#if contract.task || contract.project}
          <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
            <h2 class="text-lg font-semibold text-slate-900 dark:text-white mb-4">Related To</h2>

            {#if contract.task}
              <a
                href="/tasks/{contract.task.id}"
                class="block p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center">
                    <FileText class="text-blue-600 dark:text-blue-400" size={20} />
                  </div>
                  <div>
                    <p class="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">Task</p>
                    <p class="font-medium text-slate-900 dark:text-white">{contract.task.title}</p>
                  </div>
                </div>
              </a>
            {/if}

            {#if contract.project}
              <a
                href="/projects/{contract.project.id}"
                class="block p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors {contract.task ? 'mt-3' : ''}"
              >
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center">
                    <FileText class="text-purple-600 dark:text-purple-400" size={20} />
                  </div>
                  <div>
                    <p class="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">Project</p>
                    <p class="font-medium text-slate-900 dark:text-white">{contract.project.name}</p>
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
        <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
          <h3 class="text-sm font-semibold text-slate-900 dark:text-white uppercase tracking-wider mb-4">Summary</h3>

          <dl class="space-y-4">
            {#if contract.terms?.compensation}
              <div>
                <dt class="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <DollarSign size={12} />
                  Compensation
                </dt>
                <dd class="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                  {formatCurrency(contract.terms.compensation)}
                </dd>
              </div>
            {/if}

            {#if contract.terms?.timeline}
              <div>
                <dt class="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <Calendar size={12} />
                  Timeline
                </dt>
                <dd class="mt-1 text-slate-700 dark:text-slate-300">{contract.terms.timeline}</dd>
              </div>
            {/if}

            <div>
              <dt class="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">Template</dt>
              <dd class="mt-1 text-slate-700 dark:text-slate-300 capitalize">{contract.template_type}</dd>
            </div>

            <div>
              <dt class="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">Created</dt>
              <dd class="mt-1 text-slate-700 dark:text-slate-300">{formatDate(contract.created_at)}</dd>
            </div>

            <div>
              <dt class="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">Last Updated</dt>
              <dd class="mt-1 text-slate-700 dark:text-slate-300">{formatDate(contract.updated_at)}</dd>
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

<!-- Full-screen PDF Viewer -->
{#if showPdfViewer && pdfBlobUrl}
  <div class="fixed inset-0 z-[100] flex flex-col bg-black/90">
    <!-- Toolbar -->
    <div class="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-700 flex-shrink-0">
      <div class="flex items-center gap-3">
        <FileText size={18} class="text-slate-400" />
        <span class="text-white font-medium text-sm">
          Contract — {contract?.id?.slice(0, 8) ?? ''}
        </span>
      </div>
      <div class="flex items-center gap-2">
        <button
          on:click={downloadPdf}
          class="flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm transition-colors"
        >
          <Download size={14} />
          Download
        </button>
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

<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { tasksApi, contractsApi } from '$lib/services/api';
  import { toasts } from '$lib/stores/notifications';
  import { user, organization } from '$lib/stores/auth';
  import { generateContractorAgreement, downloadPdf } from '$lib/services/contractPdf';
  import type { Task, ExternalAssignmentResult } from '$lib/types';
  import {
    X,
    UserPlus,
    Mail,
    Link,
    Users,
    FileText,
    Copy,
    Check,
    Loader,
    ExternalLink,
    AlertTriangle,
    Download
  } from 'lucide-svelte';

  export let task: Task;
  export let show = false;

  const dispatch = createEventDispatcher<{
    close: void;
    assigned: ExternalAssignmentResult;
  }>();

  let contractorName = '';
  let contractorEmail = '';
  let useGuestLink = true;
  let loading = false;
  let generatingPdf = false;
  let error = '';
  let result: ExternalAssignmentResult | null = null;
  let copied = false;
  let generatedPdf: { pdf: Blob; filename: string } | null = null;
  let pdfUploaded = false;

  $: submissionUrl = result?.submission_token
    ? `${window.location.origin}/submit/${result.submission_token}`
    : '';

  function close() {
    if (!loading && !generatingPdf) {
      // Reset state
      contractorName = '';
      contractorEmail = '';
      useGuestLink = true;
      error = '';
      result = null;
      generatedPdf = null;
      pdfUploaded = false;
      dispatch('close');
    }
  }

  async function handleAssign() {
    if (!contractorName.trim() || !contractorEmail.trim()) {
      error = 'Please fill in all fields';
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(contractorEmail)) {
      error = 'Please enter a valid email address';
      return;
    }

    if (!$user || !$organization) {
      error = 'User or organization not found';
      return;
    }

    loading = true;
    error = '';

    try {
      // Step 1: Create contract and assignment in database
      const assignResult = await tasksApi.assignExternal(task.id, {
        contractor_name: contractorName,
        contractor_email: contractorEmail,
        use_guest_link: useGuestLink
      });

      if (!assignResult.success) {
        error = assignResult.error || 'Failed to assign task externally';
        return;
      }

      result = assignResult;

      // Step 2: Generate PDF contract
      if (assignResult.contract_id) {
        generatingPdf = true;

        try {
          const contractData = {
            contractId: assignResult.contract_id,
            contractorName,
            contractorEmail,
            task,
            organization: $organization,
            assignedBy: $user,
            createdAt: new Date()
          };

          generatedPdf = generateContractorAgreement(contractData);

          // Step 3: Upload PDF to storage
          const uploadResult = await contractsApi.uploadPdf(
            assignResult.contract_id,
            generatedPdf.pdf,
            generatedPdf.filename
          );

          if (uploadResult) {
            pdfUploaded = true;
          }
        } catch (pdfErr) {
          console.error('PDF generation error:', pdfErr);
          // Don't fail the whole operation if PDF fails
        } finally {
          generatingPdf = false;
        }
      }

      toasts.success('Task assigned to external contractor');
      dispatch('assigned', assignResult);
    } catch (err) {
      error = err instanceof Error ? err.message : 'An error occurred';
    } finally {
      loading = false;
    }
  }

  function handleDownloadPdf() {
    if (generatedPdf) {
      downloadPdf(generatedPdf);
    }
  }

  async function copySubmissionUrl() {
    if (submissionUrl) {
      await navigator.clipboard.writeText(submissionUrl);
      copied = true;
      setTimeout(() => copied = false, 2000);
    }
  }

  function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  }
</script>

{#if show}
  <div class="fixed inset-0 z-50 overflow-y-auto">
    <div class="flex min-h-full items-center justify-center p-4">
      <!-- Backdrop -->
      <button
        class="fixed inset-0 bg-black/50"
        on:click={close}
        aria-label="Close modal"
      />

      <!-- Modal -->
      <div class="relative w-full max-w-lg bg-white dark:bg-slate-800 rounded-xl shadow-xl">
        <!-- Header -->
        <div class="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center">
              <UserPlus class="text-indigo-600 dark:text-indigo-400" size={20} />
            </div>
            <div>
              <h2 class="text-lg font-semibold text-slate-900 dark:text-white">Assign Externally</h2>
              <p class="text-sm text-slate-500 dark:text-slate-400">Outsource this task to an external contractor</p>
            </div>
          </div>
          <button
            on:click={close}
            class="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            disabled={loading || generatingPdf}
          >
            <X size={20} />
          </button>
        </div>

        <!-- Content -->
        {#if result}
          <!-- Success State -->
          <div class="p-6 space-y-6">
            <div class="text-center">
              <div class="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check class="text-green-600 dark:text-green-400" size={32} />
              </div>
              <h3 class="text-lg font-semibold text-slate-900 dark:text-white mb-2">Task Assigned!</h3>
              <p class="text-slate-600 dark:text-slate-300">
                The task has been assigned to <strong>{contractorName}</strong> and a contract has been created.
              </p>
            </div>

            {#if submissionUrl}
              <div class="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-4 space-y-3">
                <div class="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                  <Link size={16} />
                  Guest Submission Link
                </div>
                <div class="flex items-center gap-2">
                  <input
                    type="text"
                    value={submissionUrl}
                    readonly
                    class="flex-1 px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-600 dark:text-slate-300 font-mono"
                  />
                  <button
                    on:click={copySubmissionUrl}
                    class="p-2 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-colors"
                    title="Copy link"
                  >
                    {#if copied}
                      <Check size={18} class="text-green-600 dark:text-green-400" />
                    {:else}
                      <Copy size={18} />
                    {/if}
                  </button>
                </div>
                {#if copied}
                  <p class="text-sm text-green-600 dark:text-green-400">Copied to clipboard!</p>
                {/if}

                <!-- Email and Copy buttons -->
                <div class="flex gap-2 pt-2">
                  <a
                    href="mailto:{contractorEmail}?subject=Task Assignment: {encodeURIComponent(task.title)}&body={encodeURIComponent(`Hi ${contractorName},\n\nYou have been assigned to work on the following task:\n\n${task.title}\n\nValue: ${formatCurrency(task.dollar_value)}\n${task.deadline ? `Deadline: ${new Date(task.deadline).toLocaleDateString()}\n` : ''}\nPlease submit your work using this link:\n${submissionUrl}\n\nThank you!`)}"
                    class="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                  >
                    <Mail size={16} />
                    Email Link to Contractor
                  </a>
                </div>

                <p class="text-xs text-slate-500 dark:text-slate-400">
                  Share this link with the contractor. They can submit their work without creating an account.
                </p>
              </div>
            {/if}

            <div class="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 rounded-lg p-4">
              <div class="flex items-start gap-3">
                <FileText size={18} class="text-indigo-600 dark:text-indigo-400 flex-shrink-0 mt-0.5" />
                <div class="flex-1">
                  <div class="text-sm text-indigo-800 dark:text-indigo-200">
                    <p class="font-medium mb-1">Contract Created</p>
                    {#if generatingPdf}
                      <p class="flex items-center gap-2">
                        <Loader size={14} class="animate-spin" />
                        Generating PDF contract...
                      </p>
                    {:else if generatedPdf}
                      <p class="mb-2">PDF contract has been generated{pdfUploaded ? ' and saved' : ''}.</p>
                      <button
                        on:click={handleDownloadPdf}
                        class="inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                      >
                        <Download size={14} />
                        Download Contract PDF
                      </button>
                    {:else}
                      <p>A contract record has been created. You can view and manage it in the Contracts section.</p>
                    {/if}
                  </div>
                </div>
              </div>
            </div>

            <div class="flex justify-end">
              <button
                on:click={close}
                class="px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        {:else}
          <!-- Assignment Form -->
          <form on:submit|preventDefault={handleAssign} class="p-6 space-y-6">
            <!-- Task Summary -->
            <div class="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4">
              <h4 class="font-medium text-slate-900 dark:text-white mb-2">{task.title}</h4>
              <div class="flex items-center gap-4 text-sm text-slate-600 dark:text-slate-300">
                <span class="font-semibold text-green-600 dark:text-green-400">{formatCurrency(task.dollar_value)}</span>
                {#if task.deadline}
                  <span>Due: {new Date(task.deadline).toLocaleDateString()}</span>
                {/if}
                {#if task.story_points}
                  <span>{task.story_points} story points</span>
                {/if}
              </div>
            </div>

            {#if error}
              <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 flex items-center gap-2 text-sm text-red-700 dark:text-red-400">
                <AlertTriangle size={16} />
                {error}
              </div>
            {/if}

            <!-- Contractor Name -->
            <div>
              <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Contractor Name
              </label>
              <div class="relative">
                <UserPlus class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  bind:value={contractorName}
                  placeholder="John Smith"
                  class="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  disabled={loading}
                />
              </div>
            </div>

            <!-- Contractor Email -->
            <div>
              <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Contractor Email
              </label>
              <div class="relative">
                <Mail class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="email"
                  bind:value={contractorEmail}
                  placeholder="contractor@example.com"
                  class="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  disabled={loading}
                />
              </div>
            </div>

            <!-- Assignment Type Toggle -->
            <div>
              <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Submission Method
              </label>
              <div class="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  on:click={() => useGuestLink = true}
                  class="p-4 border rounded-lg text-left transition-colors {useGuestLink ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30' : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500'}"
                  disabled={loading}
                >
                  <div class="flex items-center gap-2 mb-1">
                    <Link size={18} class={useGuestLink ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'} />
                    <span class="font-medium {useGuestLink ? 'text-indigo-900 dark:text-indigo-200' : 'text-slate-700 dark:text-slate-300'}">Guest Link</span>
                  </div>
                  <p class="text-xs {useGuestLink ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-500 dark:text-slate-400'}">
                    Submit via unique link without an account
                  </p>
                </button>
                <button
                  type="button"
                  on:click={() => useGuestLink = false}
                  class="p-4 border rounded-lg text-left transition-colors {!useGuestLink ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30' : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500'}"
                  disabled={loading}
                >
                  <div class="flex items-center gap-2 mb-1">
                    <Users size={18} class={!useGuestLink ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'} />
                    <span class="font-medium {!useGuestLink ? 'text-indigo-900 dark:text-indigo-200' : 'text-slate-700 dark:text-slate-300'}">Org Invite</span>
                  </div>
                  <p class="text-xs {!useGuestLink ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-500 dark:text-slate-400'}">
                    Invite contractor to join the organization
                  </p>
                </button>
              </div>
            </div>

            <!-- Info about contract -->
            <div class="bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 rounded-lg p-4">
              <div class="flex items-start gap-3">
                <FileText size={18} class="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <div class="text-sm text-amber-800 dark:text-amber-200">
                  <p class="font-medium mb-1">PDF Contract Auto-Generated</p>
                  <p>A professional contract PDF will be created with the task details and contractor information.</p>
                </div>
              </div>
            </div>

            <!-- Actions -->
            <div class="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
              <button
                type="button"
                on:click={close}
                class="px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !contractorName.trim() || !contractorEmail.trim()}
                class="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {#if loading}
                  <Loader size={16} class="animate-spin" />
                  Assigning...
                {:else}
                  <ExternalLink size={16} />
                  Assign Externally
                {/if}
              </button>
            </div>
          </form>
        {/if}
      </div>
    </div>
  </div>
{/if}

<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { user, organization, capabilities } from '$lib/stores/auth';
  import { qcApi, tasksApi } from '$lib/services/api';
  import { formatCurrency, computeQCMarginals, calculateQCPayout } from '$lib/utils/payout';
  import { toasts } from '$lib/stores/notifications';
  import type { Task, QCReview, ShapleyParams } from '$lib/types';
  import {
    Shield,
    CheckCircle,
    XCircle,
    Clock,
    DollarSign,
    User,
    FileText,
    AlertTriangle,
    ChevronRight,
    Sparkles
  } from 'lucide-svelte';

  let pendingTasks: Task[] = [];
  let selectedTask: Task | null = null;
  let loading = true;
  let submitting = false;

  // Review form
  let reviewPassed = true;
  let feedback = '';

  // QC payout preview - reactively update when org settings or task changes
  $: potentialPayout = selectedTask ? calculatePotentialPayout(selectedTask) : 0;

  onMount(async () => {
    // Route guard: Only QC reviewers and admins can access this page
    if (!$capabilities.canReviewQC) {
      toasts.error('You do not have permission to access QC reviews');
      goto('/dashboard');
      return;
    }

    // Ensure organization settings are loaded
    if (!$organization) {
      await organization.load();
    }
    await loadPendingTasks();
  });

  async function loadPendingTasks() {
    loading = true;
    try {
      pendingTasks = await qcApi.listPending();
    } catch (error) {
      console.error('Failed to load pending tasks:', error);
      toasts.error('Failed to load review queue');
    } finally {
      loading = false;
    }
  }

  async function selectTask(task: Task) {
    selectedTask = await tasksApi.getById(task.id);
  }

  function calculatePotentialPayout(task: Task): number {
    // Use organization settings with sensible defaults
    const beta = $organization?.qc_beta ?? 0.25;
    const gamma = $organization?.qc_gamma ?? 0.4;
    const v0 = task.dollar_value * 0.7; // Worker baseline: 70% of task value

    // Get latest AI confidence if available
    const aiReview = task.qc_reviews?.find(r => r.review_type === 'ai');
    const p0 = aiReview?.confidence ?? 0.8;

    // Number of passes (how many times it's been reviewed/rejected + current)
    const K = (task.qc_reviews?.filter(r => r.review_type !== 'ai' && !r.passed).length ?? 0) + 1;

    const params: ShapleyParams = {
      V: task.dollar_value,
      v0,
      p0,
      beta,
      gamma,
      K
    };

    return calculateQCPayout(params);
  }

  async function submitReview() {
    if (!selectedTask || !$user) return;

    // Validate feedback is required for rejections
    if (!reviewPassed && !feedback.trim()) {
      toasts.error('Please provide feedback explaining what needs to be fixed');
      return;
    }

    submitting = true;
    try {
      const result = await qcApi.submitReview(
        selectedTask.id,
        $user.id,
        reviewPassed,
        feedback,
        'independent'
      );

      if (!result) {
        toasts.error('Failed to submit review');
        return;
      }

      // Show success message
      if (reviewPassed) {
        toasts.success(`Task approved! Payout: ${formatCurrency(potentialPayout)}`);
      } else {
        toasts.info('Task returned for revisions');
      }

      // Reset form
      feedback = '';
      reviewPassed = true;
      selectedTask = null;

      // Reload tasks
      await loadPendingTasks();
    } catch (error) {
      console.error('Failed to submit review:', error);
      toasts.error('Failed to submit review. Please try again.');
    } finally {
      submitting = false;
    }
  }

  function getConfidenceColor(confidence: number): string {
    if (confidence >= 0.9) return 'text-green-600 bg-green-100';
    if (confidence >= 0.75) return 'text-blue-600 bg-blue-100';
    if (confidence >= 0.5) return 'text-amber-600 bg-amber-100';
    return 'text-red-600 bg-red-100';
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
</script>

<div class="h-[calc(100vh-8rem)] flex gap-6">
  <!-- Task Queue -->
  <div class="w-96 flex-shrink-0 bg-white rounded-xl border border-slate-200 flex flex-col">
    <div class="px-6 py-4 border-b border-slate-200">
      <div class="flex items-center justify-between">
        <h2 class="font-semibold text-slate-900">Review Queue</h2>
        <span class="px-2 py-1 bg-orange-100 text-orange-700 text-xs font-medium rounded-full">
          {pendingTasks.length} pending
        </span>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto">
      {#if loading}
        <div class="p-6 flex justify-center">
          <div class="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      {:else if pendingTasks.length === 0}
        <div class="p-6 text-center">
          <Shield class="mx-auto text-slate-300 mb-3" size={48} />
          <p class="text-slate-500">No tasks pending review</p>
          <p class="text-sm text-slate-400 mt-1">Check back later!</p>
        </div>
      {:else}
        <div class="divide-y divide-slate-100">
          {#each pendingTasks as task}
            {@const aiReview = task.qc_reviews?.find(r => r.review_type === 'ai')}
            <button
              class="w-full px-6 py-4 text-left hover:bg-slate-50 transition-colors flex items-start gap-3
                {selectedTask?.id === task.id ? 'bg-indigo-50 border-l-4 border-l-indigo-600' : ''}"
              on:click={() => selectTask(task)}
            >
              <div class="flex-1 min-w-0">
                <h4 class="font-medium text-slate-900 truncate">{task.title}</h4>
                
                <div class="flex items-center gap-3 mt-2 text-sm">
                  <!-- AI Confidence -->
                  {#if aiReview?.confidence}
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium {getConfidenceColor(aiReview.confidence)}">
                      <Sparkles size={12} />
                      {(aiReview.confidence * 100).toFixed(0)}%
                    </span>
                  {/if}
                  
                  <!-- Value -->
                  <span class="text-slate-500">
                    {formatCurrency(task.dollar_value)}
                  </span>
                </div>

                <p class="text-xs text-slate-400 mt-2">
                  Completed {formatDate(task.completed_at || '')}
                </p>
              </div>
              
              <ChevronRight class="text-slate-300 flex-shrink-0" size={18} />
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>

  <!-- Review Panel -->
  <div class="flex-1 bg-white rounded-xl border border-slate-200 flex flex-col">
    {#if selectedTask}
      <!-- Task Header -->
      <div class="px-6 py-4 border-b border-slate-200">
        <div class="flex items-start justify-between">
          <div>
            <h2 class="text-xl font-bold text-slate-900">{selectedTask.title}</h2>
            <p class="text-sm text-slate-500 mt-1">
              Assigned to {selectedTask.assignee?.full_name || 'Unknown'}
            </p>
          </div>
          <div class="text-right">
            <p class="text-2xl font-bold text-slate-900">{formatCurrency(selectedTask.dollar_value)}</p>
            <p class="text-sm text-slate-500">Task value</p>
          </div>
        </div>
      </div>

      <!-- Task Content -->
      <div class="flex-1 overflow-y-auto p-6 space-y-6">
        <!-- Description -->
        <div>
          <h3 class="text-sm font-medium text-slate-700 mb-2">Task Description</h3>
          <div class="bg-slate-50 rounded-lg p-4">
            <p class="text-slate-600">{selectedTask.description || 'No description provided'}</p>
          </div>
        </div>

        <!-- Submission -->
        <div>
          <h3 class="text-sm font-medium text-slate-700 mb-2">Submission</h3>
          <div class="bg-slate-50 rounded-lg p-4">
            {#if selectedTask.submission_data}
              <pre class="text-sm text-slate-600 whitespace-pre-wrap">{JSON.stringify(selectedTask.submission_data, null, 2)}</pre>
            {:else}
              <p class="text-slate-500 italic">No submission data</p>
            {/if}
          </div>
          
          {#if selectedTask.submission_files?.length}
            <div class="mt-3 flex flex-wrap gap-2">
              {#each selectedTask.submission_files as file}
                <a 
                  href={file} 
                  target="_blank"
                  class="inline-flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-lg hover:border-indigo-300 transition-colors"
                >
                  <FileText size={16} class="text-slate-400" />
                  <span class="text-sm text-slate-600">Attachment</span>
                </a>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Previous Reviews -->
        {#if selectedTask.qc_reviews?.length}
          <div>
            <h3 class="text-sm font-medium text-slate-700 mb-2">Previous Reviews</h3>
            <div class="space-y-3">
              {#each selectedTask.qc_reviews as review}
                <div class="bg-slate-50 rounded-lg p-4 flex items-start gap-3">
                  {#if review.passed}
                    <CheckCircle class="text-green-500 flex-shrink-0" size={20} />
                  {:else}
                    <XCircle class="text-red-500 flex-shrink-0" size={20} />
                  {/if}
                  <div class="flex-1">
                    <div class="flex items-center gap-2">
                      <span class="font-medium text-slate-900 capitalize">{review.review_type}</span>
                      {#if review.confidence}
                        <span class="text-xs text-slate-500">
                          ({(review.confidence * 100).toFixed(0)}% confidence)
                        </span>
                      {/if}
                    </div>
                    {#if review.feedback}
                      <p class="text-sm text-slate-600 mt-1">{review.feedback}</p>
                    {/if}
                    <p class="text-xs text-slate-400 mt-2">
                      {formatDate(review.created_at)}
                    </p>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Potential Payout Info -->
        <div class="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl p-6 text-white">
          <h3 class="text-sm font-medium text-indigo-200 mb-2">Your Potential QC Payout</h3>
          <p class="text-3xl font-bold">{formatCurrency(potentialPayout)}</p>
          <p class="text-sm text-indigo-200 mt-2">
            Based on Shapley value calculation with current confidence scores
          </p>
        </div>
      </div>

      <!-- Review Form -->
      <div class="px-6 py-4 border-t border-slate-200 space-y-4">
        <div>
          <label class="text-sm font-medium text-slate-700 mb-2 block">Your Decision</label>
          <div class="flex gap-4">
            <button
              class="flex-1 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2
                {reviewPassed ? 'bg-green-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}"
              on:click={() => reviewPassed = true}
            >
              <CheckCircle size={18} />
              Approve
            </button>
            <button
              class="flex-1 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2
                {!reviewPassed ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}"
              on:click={() => reviewPassed = false}
            >
              <XCircle size={18} />
              Reject
            </button>
          </div>
        </div>

        <div>
          <label class="text-sm font-medium text-slate-700 mb-2 block">
            Feedback {!reviewPassed ? '(required)' : '(optional)'}
          </label>
          <textarea
            bind:value={feedback}
            rows="3"
            class="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            placeholder={reviewPassed ? 'Add optional comments...' : 'Explain what needs to be fixed...'}
          />
        </div>

        <button
          class="w-full py-3 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          on:click={submitReview}
          disabled={submitting || (!reviewPassed && !feedback.trim())}
        >
          {submitting ? 'Submitting...' : 'Submit Review'}
        </button>
      </div>
    {:else}
      <!-- Empty State -->
      <div class="flex-1 flex items-center justify-center">
        <div class="text-center">
          <Shield class="mx-auto text-slate-200 mb-4" size={64} />
          <h3 class="text-lg font-semibold text-slate-900">Select a task to review</h3>
          <p class="text-slate-500 mt-1">Choose a task from the queue to start your review</p>
        </div>
      </div>
    {/if}
  </div>
</div>

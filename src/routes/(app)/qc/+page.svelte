<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { user, organization, capabilities } from '$lib/stores/auth';
  import { qcApi, tasksApi } from '$lib/services/api';
  import { formatCurrency, computeQCMarginals, calculateQCPayout } from '$lib/utils/payout';
  import { toasts } from '$lib/stores/notifications';
  import { featureFlags } from '$lib/stores/featureFlags';
  import { mlApi, type MLQualityAssessmentResponse } from '$lib/services/ml';
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

  // AI quality assessment
  let qualityAssessment: MLQualityAssessmentResponse | null = null;
  let loadingAssessment = false;

  // AI confidence breakdown - derived from selected task's AI review
  $: selectedAiReview = selectedTask?.qc_reviews?.find(r => r.review_type === 'ai') ?? null;

  // Parse AI review feedback - may be a JSON string containing breakdown, issues, recommendations
  $: parsedAiFeedback = (() => {
    if (!selectedAiReview?.feedback) return null;
    try {
      const parsed = typeof selectedAiReview.feedback === 'string'
        ? JSON.parse(selectedAiReview.feedback)
        : selectedAiReview.feedback;
      return parsed as {
        confidence_breakdown?: { completeness?: number; quality?: number; requirements_met?: number };
        issues?: string[];
        recommendations?: string[];
      };
    } catch {
      return null;
    }
  })();
  $: confidenceBreakdown = parsedAiFeedback?.confidence_breakdown ?? null;
  $: aiFeedbackObj = parsedAiFeedback;

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
    qualityAssessment = null;

    if (selectedTask && $featureFlags.ai_qc_review) {
      loadingAssessment = true;
      try {
        qualityAssessment = await mlApi.getQualityAssessment(selectedTask.id);
      } catch (err) {
        console.warn('Failed to load AI quality assessment:', err);
      } finally {
        loadingAssessment = false;
      }
    }
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
    if (confidence >= 0.9) return 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/30';
    if (confidence >= 0.75) return 'text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/30';
    if (confidence >= 0.5) return 'text-amber-600 bg-amber-100 dark:text-amber-400 dark:bg-amber-900/30';
    return 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/30';
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

<div class="h-[calc(100vh-8rem)] flex flex-col lg:flex-row gap-4 lg:gap-6">
  <!-- Task Queue -->
  <div class="w-full lg:w-96 flex-shrink-0 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col max-h-64 lg:max-h-full">
    <div class="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
      <div class="flex items-center justify-between">
        <h2 class="font-semibold text-slate-900 dark:text-white">Review Queue</h2>
        <span class="px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 text-xs font-medium rounded-full">
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
          <Shield class="mx-auto text-slate-300 dark:text-slate-600 mb-3" size={48} />
          <p class="text-slate-500 dark:text-slate-400">No tasks pending review</p>
          <p class="text-sm text-slate-400 dark:text-slate-500 mt-1">Check back later!</p>
        </div>
      {:else}
        <div class="divide-y divide-slate-100 dark:divide-slate-700">
          {#each pendingTasks as task}
            {@const aiReview = task.qc_reviews?.find(r => r.review_type === 'ai')}
            <button
              class="w-full px-6 py-4 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors flex items-start gap-3
                {selectedTask?.id === task.id ? 'bg-indigo-50 dark:bg-indigo-900/20 border-l-4 border-l-indigo-600' : ''}"
              on:click={() => selectTask(task)}
            >
              <div class="flex-1 min-w-0">
                <h4 class="font-medium text-slate-900 dark:text-white truncate">{task.title}</h4>

                <div class="flex items-center gap-3 mt-2 text-sm">
                  <!-- AI Confidence -->
                  {#if aiReview?.confidence}
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium {getConfidenceColor(aiReview.confidence)}">
                      <Sparkles size={12} />
                      {(aiReview.confidence * 100).toFixed(0)}%
                    </span>
                  {/if}

                  <!-- Value -->
                  <span class="text-slate-500 dark:text-slate-400">
                    {formatCurrency(task.dollar_value)}
                  </span>
                </div>

                <p class="text-xs text-slate-400 dark:text-slate-500 mt-2">
                  Completed {formatDate(task.completed_at || '')}
                </p>
              </div>

              <ChevronRight class="text-slate-300 dark:text-slate-600 flex-shrink-0" size={18} />
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>

  <!-- Review Panel -->
  <div class="flex-1 min-h-0 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden">
    {#if selectedTask}
      <!-- Task Header -->
      <div class="flex-shrink-0 px-6 py-4 border-b border-slate-200 dark:border-slate-700">
        <div class="flex items-start justify-between">
          <div>
            <h2 class="text-xl font-bold text-slate-900 dark:text-white">{selectedTask.title}</h2>
            <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Assigned to {selectedTask.assignee?.full_name || 'Unknown'}
            </p>
          </div>
          <div class="text-right">
            <p class="text-2xl font-bold text-slate-900 dark:text-white">{formatCurrency(selectedTask.dollar_value)}</p>
            <p class="text-sm text-slate-500 dark:text-slate-400">Task value</p>
          </div>
        </div>
      </div>

      <!-- Task Content -->
      <div class="flex-1 min-h-0 overflow-y-auto p-6 space-y-6">
        <!-- Description -->
        <div>
          <h3 class="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Task Description</h3>
          <div class="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4">
            <p class="text-slate-600 dark:text-slate-300">{selectedTask.description || 'No description provided'}</p>
          </div>
        </div>

        <!-- Submission -->
        <div>
          <h3 class="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Submission</h3>
          <div class="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4">
            {#if selectedTask.submission_data}
              <pre class="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{JSON.stringify(selectedTask.submission_data, null, 2)}</pre>
            {:else}
              <p class="text-slate-500 dark:text-slate-400 italic">No submission data</p>
            {/if}
          </div>

          {#if selectedTask.submission_files?.length}
            <div class="mt-3 flex flex-wrap gap-2">
              {#each selectedTask.submission_files as file}
                <a
                  href={file}
                  target="_blank"
                  class="inline-flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg hover:border-indigo-300 dark:hover:border-indigo-500 transition-colors"
                >
                  <FileText size={16} class="text-slate-400" />
                  <span class="text-sm text-slate-600 dark:text-slate-300">Attachment</span>
                </a>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Previous Reviews -->
        {#if selectedTask.qc_reviews?.length}
          <div>
            <h3 class="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Previous Reviews</h3>
            <div class="space-y-3">
              {#each selectedTask.qc_reviews as review}
                <div class="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4 flex items-start gap-3">
                  {#if review.passed}
                    <CheckCircle class="text-green-500 dark:text-green-400 flex-shrink-0" size={20} />
                  {:else}
                    <XCircle class="text-red-500 dark:text-red-400 flex-shrink-0" size={20} />
                  {/if}
                  <div class="flex-1">
                    <div class="flex items-center gap-2">
                      <span class="font-medium text-slate-900 dark:text-white capitalize">{review.review_type}</span>
                      {#if review.confidence}
                        <span class="text-xs text-slate-500 dark:text-slate-400">
                          ({(review.confidence * 100).toFixed(0)}% confidence)
                        </span>
                      {/if}
                    </div>
                    {#if review.feedback}
                      <p class="text-sm text-slate-600 dark:text-slate-300 mt-1">{review.feedback}</p>
                    {/if}
                    <p class="text-xs text-slate-400 dark:text-slate-500 mt-2">
                      {formatDate(review.created_at)}
                    </p>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- AI Confidence Breakdown -->
        {#if $featureFlags.ai_qc_review && selectedAiReview}
          <div>
            <h3 class="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">AI Confidence Breakdown</h3>
            <div class="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4 space-y-3">
              {#if confidenceBreakdown}
                {#each [
                  { label: 'Completeness', value: confidenceBreakdown.completeness },
                  { label: 'Quality', value: confidenceBreakdown.quality },
                  { label: 'Requirements Met', value: confidenceBreakdown.requirements_met }
                ] as metric}
                  {#if metric.value != null}
                    <div>
                      <div class="flex items-center justify-between text-sm mb-1">
                        <span class="text-slate-600 dark:text-slate-300">{metric.label}</span>
                        <span class="font-medium {getConfidenceColor(metric.value)} px-2 py-0.5 rounded-full text-xs">
                          {(metric.value * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div class="w-full h-2 bg-slate-200 dark:bg-slate-600 rounded-full overflow-hidden">
                        <div
                          class="h-full rounded-full transition-all {metric.value >= 0.75 ? 'bg-green-500' : metric.value >= 0.5 ? 'bg-amber-500' : 'bg-red-500'}"
                          style="width: {metric.value * 100}%"
                        ></div>
                      </div>
                    </div>
                  {/if}
                {/each}
              {/if}

              {#if aiFeedbackObj?.issues?.length}
                <div class="pt-2 border-t border-slate-200 dark:border-slate-600">
                  <p class="text-xs font-medium text-red-600 dark:text-red-400 mb-1">Issues Found</p>
                  <ul class="text-sm text-slate-600 dark:text-slate-300 space-y-1">
                    {#each aiFeedbackObj.issues as issue}
                      <li class="flex items-start gap-2">
                        <span class="text-red-400 mt-0.5">&#x2022;</span>
                        {issue}
                      </li>
                    {/each}
                  </ul>
                </div>
              {/if}
              {#if aiFeedbackObj?.recommendations?.length}
                <div class="pt-2 border-t border-slate-200 dark:border-slate-600">
                  <p class="text-xs font-medium text-blue-600 dark:text-blue-400 mb-1">Recommendations</p>
                  <ul class="text-sm text-slate-600 dark:text-slate-300 space-y-1">
                    {#each aiFeedbackObj.recommendations as rec}
                      <li class="flex items-start gap-2">
                        <span class="text-blue-400 mt-0.5">&#x2022;</span>
                        {rec}
                      </li>
                    {/each}
                  </ul>
                </div>
              {/if}
            </div>
          </div>
        {/if}

        <!-- AI Quality Assessment -->
        {#if $featureFlags.ai_qc_review}
          <div>
            <h3 class="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">AI Quality Assessment</h3>
            {#if loadingAssessment}
              <div class="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-6 flex items-center justify-center gap-2">
                <div class="w-5 h-5 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin"></div>
                <span class="text-sm text-slate-500 dark:text-slate-400">Loading AI assessment...</span>
              </div>
            {:else if qualityAssessment}
              <div class="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4 space-y-4">
                <!-- Overall Quality Score -->
                <div>
                  <div class="flex items-center justify-between text-sm mb-1">
                    <span class="text-slate-600 dark:text-slate-300">Overall Quality</span>
                    <span class="font-semibold {getConfidenceColor(qualityAssessment.overall_quality)} px-2 py-0.5 rounded-full text-xs">
                      {(qualityAssessment.overall_quality * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div class="w-full h-3 bg-slate-200 dark:bg-slate-600 rounded-full overflow-hidden">
                    <div
                      class="h-full rounded-full transition-all {qualityAssessment.overall_quality >= 0.75 ? 'bg-green-500' : qualityAssessment.overall_quality >= 0.5 ? 'bg-amber-500' : 'bg-red-500'}"
                      style="width: {qualityAssessment.overall_quality * 100}%"
                    ></div>
                  </div>
                </div>

                <!-- Strengths -->
                {#if qualityAssessment.strengths.length > 0}
                  <div>
                    <p class="text-xs font-medium text-green-600 dark:text-green-400 mb-1">Strengths</p>
                    <ul class="text-sm text-slate-600 dark:text-slate-300 space-y-1">
                      {#each qualityAssessment.strengths as strength}
                        <li class="flex items-start gap-2">
                          <span class="text-green-500 mt-0.5">&#x2713;</span>
                          {strength}
                        </li>
                      {/each}
                    </ul>
                  </div>
                {/if}

                <!-- Areas of Concern -->
                {#if qualityAssessment.areas_of_concern.length > 0}
                  <div>
                    <p class="text-xs font-medium text-amber-600 dark:text-amber-400 mb-1">Areas of Concern</p>
                    <ul class="text-sm text-slate-600 dark:text-slate-300 space-y-1">
                      {#each qualityAssessment.areas_of_concern as concern}
                        <li class="flex items-start gap-2">
                          <span class="text-amber-500 mt-0.5">&#x26A0;</span>
                          {concern}
                        </li>
                      {/each}
                    </ul>
                  </div>
                {/if}

                <!-- Comparison -->
                {#if qualityAssessment.comparison_to_similar != null}
                  <div class="pt-2 border-t border-slate-200 dark:border-slate-600 text-xs text-slate-500 dark:text-slate-400">
                    Compared to similar tasks: <span class="font-medium">{qualityAssessment.comparison_to_similar >= 0.5 ? 'Above' : 'Below'} average</span>
                    ({(qualityAssessment.comparison_to_similar * 100).toFixed(0)}th percentile)
                  </div>
                {/if}
              </div>
            {:else}
              <div class="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4 text-center text-sm text-slate-400 dark:text-slate-500">
                No AI assessment available
              </div>
            {/if}
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
      <div class="flex-shrink-0 px-6 py-4 border-t border-slate-200 dark:border-slate-700 space-y-4">
        <div role="group" aria-labelledby="decision-label">
          <span id="decision-label" class="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">Your Decision</span>
          <div class="flex gap-4">
            <button
              class="flex-1 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2
                {reviewPassed ? 'bg-green-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'}"
              on:click={() => reviewPassed = true}
            >
              <CheckCircle size={18} />
              Approve
            </button>
            <button
              class="flex-1 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2
                {!reviewPassed ? 'bg-red-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'}"
              on:click={() => reviewPassed = false}
            >
              <XCircle size={18} />
              Reject
            </button>
          </div>
        </div>

        <div>
          <label for="qc-feedback-input" class="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">
            Feedback {!reviewPassed ? '(required)' : '(optional)'}
          </label>
          <textarea
            id="qc-feedback-input"
            bind:value={feedback}
            rows="3"
            class="w-full px-4 py-3 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
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
          <Shield class="mx-auto text-slate-200 dark:text-slate-600 mb-4" size={64} />
          <h3 class="text-lg font-semibold text-slate-900 dark:text-white">Select a task to review</h3>
          <p class="text-slate-500 dark:text-slate-400 mt-1">Choose a task from the queue to start your review</p>
        </div>
      </div>
    {/if}
  </div>
</div>

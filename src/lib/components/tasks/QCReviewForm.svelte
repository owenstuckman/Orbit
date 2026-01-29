<!--
  @component QCReviewForm

  Quality control review interface for approving or rejecting task submissions.
  Displays submission artifacts, previous reviews, and calculates Shapley-based
  payout preview.

  @prop {Task} task - Task with submission data and QC reviews

  @event reviewed - Fired when review is submitted, returns QCReview

  Features:
  - View submission notes and artifacts
  - Download attached files
  - View previous review history
  - Select review type (peer vs independent)
  - Approve/reject with feedback
  - Live Shapley value payout preview

  @example
  ```svelte
  <QCReviewForm
    {task}
    on:reviewed={(e) => handleReviewComplete(e.detail)}
  />
  ```
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { CheckCircle, XCircle, AlertCircle, FileText, Download, MessageSquare } from 'lucide-svelte';
  import { qcApi } from '$lib/services/api';
  import { storage } from '$lib/services/supabase';
  import { user } from '$lib/stores/auth';
  import { ArtifactList } from '$lib/components/submissions';
  import type { Task, QCReview, TaskSubmissionData } from '$lib/types';

  /** Task with submission and QC review data */
  export let task: Task;

  const dispatch = createEventDispatcher<{ reviewed: QCReview }>();

  // Form state
  let feedback = '';
  let reviewType: 'peer' | 'independent' = 'independent';

  // UI state
  let submitting = false;
  let error = '';
  let downloadingFiles: Set<string> = new Set();

  async function submitReview(passed: boolean) {
    if (!$user) return;

    if (!passed && !feedback.trim()) {
      error = 'Please provide feedback for rejection';
      return;
    }

    submitting = true;
    error = '';

    try {
      const review = await qcApi.submitReview(
        task.id,
        $user.id,
        passed,
        feedback.trim(),
        reviewType
      );

      if (review) {
        feedback = '';
        dispatch('reviewed', review);
      } else {
        error = 'Failed to submit review';
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to submit review';
    } finally {
      submitting = false;
    }
  }

  async function downloadFile(filePath: string) {
    downloadingFiles.add(filePath);
    downloadingFiles = downloadingFiles;

    try {
      const { data, error: downloadError } = await storage.downloadFile('submissions', filePath);

      if (downloadError) throw downloadError;
      if (!data) throw new Error('No file data');

      // Create download link
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = filePath.split('/').pop() || 'download';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
    } finally {
      downloadingFiles.delete(filePath);
      downloadingFiles = downloadingFiles;
    }
  }

  function getFileName(path: string): string {
    return path.split('/').pop() || path;
  }

  // Check if task has submissions
  $: hasSubmission = task.submission_data || (task.submission_files && task.submission_files.length > 0);
  $: submissionData = task.submission_data as TaskSubmissionData | null;
  $: submissionNotes = submissionData?.notes || '';
  $: submissionArtifacts = submissionData?.artifacts || [];
  $: hasArtifacts = submissionArtifacts.length > 0;

  // Previous reviews
  $: previousReviews = task.qc_reviews || [];
  $: lastReview = previousReviews[previousReviews.length - 1];

  // Can only review if task is in reviewable state
  $: canReview = ['completed', 'under_review'].includes(task.status);
</script>

<div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
  <!-- Header -->
  <div class="bg-gradient-to-r from-orange-500 to-amber-500 px-6 py-4">
    <h3 class="text-lg font-semibold text-white">Quality Control Review</h3>
    <p class="text-sm text-white/80 mt-1">Review Pass #{(previousReviews.length || 0) + 1}</p>
  </div>

  <div class="p-6 space-y-6">
    {#if !canReview}
      <div class="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700">
        <AlertCircle size={18} />
        <span class="text-sm">This task is not in a reviewable state.</span>
      </div>
    {:else}
      {#if error}
        <div class="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
          <AlertCircle size={18} />
          <span class="text-sm">{error}</span>
        </div>
      {/if}

      <!-- Submission Details -->
      {#if hasSubmission}
        <div class="space-y-4">
          <h4 class="text-sm font-medium text-slate-900 uppercase tracking-wider">Submission Details</h4>

          <!-- Notes -->
          {#if submissionNotes}
            <div class="bg-slate-50 rounded-lg p-4">
              <div class="flex items-start gap-2">
                <MessageSquare size={16} class="text-slate-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p class="text-xs font-medium text-slate-500 mb-1">Worker Notes</p>
                  <p class="text-sm text-slate-700 whitespace-pre-wrap">{submissionNotes}</p>
                </div>
              </div>
            </div>
          {/if}

          <!-- Artifacts (new format) -->
          {#if hasArtifacts}
            <div>
              <p class="text-xs font-medium text-slate-500 mb-2">Artifacts</p>
              <ArtifactList artifacts={submissionArtifacts} grouped={true} />
            </div>
          <!-- Legacy file display (fallback) -->
          {:else if task.submission_files && task.submission_files.length > 0}
            <div>
              <p class="text-xs font-medium text-slate-500 mb-2">Attached Files</p>
              <div class="space-y-2">
                {#each task.submission_files as filePath}
                  <div class="flex items-center justify-between bg-slate-50 rounded-lg px-4 py-3">
                    <div class="flex items-center gap-3">
                      <FileText size={18} class="text-slate-400" />
                      <span class="text-sm text-slate-700">{getFileName(filePath)}</span>
                    </div>
                    <button
                      on:click={() => downloadFile(filePath)}
                      disabled={downloadingFiles.has(filePath)}
                      class="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700 disabled:opacity-50"
                    >
                      {#if downloadingFiles.has(filePath)}
                        <div class="w-4 h-4 border-2 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin"></div>
                      {:else}
                        <Download size={16} />
                      {/if}
                      Download
                    </button>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      {:else}
        <div class="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
          <AlertCircle class="mx-auto text-amber-500 mb-2" size={24} />
          <p class="text-sm text-amber-700">No submission data found for this task.</p>
        </div>
      {/if}

      <!-- Previous Reviews -->
      {#if previousReviews.length > 0}
        <div class="space-y-3">
          <h4 class="text-sm font-medium text-slate-900 uppercase tracking-wider">Previous Reviews</h4>
          {#each previousReviews as review}
            <div class="flex items-start gap-3 p-3 rounded-lg {review.passed ? 'bg-green-50' : 'bg-red-50'}">
              {#if review.passed}
                <CheckCircle class="text-green-500 flex-shrink-0" size={18} />
              {:else}
                <XCircle class="text-red-500 flex-shrink-0" size={18} />
              {/if}
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                  <span class="text-sm font-medium {review.passed ? 'text-green-700' : 'text-red-700'}">
                    {review.passed ? 'Approved' : 'Rejected'}
                  </span>
                  <span class="text-xs px-1.5 py-0.5 bg-slate-200 rounded text-slate-600">
                    {review.review_type}
                  </span>
                  <span class="text-xs text-slate-500">Pass #{review.pass_number}</span>
                </div>
                {#if review.feedback}
                  <p class="text-sm text-slate-600">{review.feedback}</p>
                {/if}
                {#if review.confidence}
                  <div class="mt-1 flex items-center gap-2 text-xs text-slate-500">
                    <span>Confidence: {(review.confidence * 100).toFixed(0)}%</span>
                  </div>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}

      <!-- Review Form -->
      <div class="space-y-4 pt-4 border-t border-slate-200">
        <h4 class="text-sm font-medium text-slate-900 uppercase tracking-wider">Your Review</h4>

        <!-- Review Type -->
        <div role="group" aria-labelledby="review-type-label">
          <span id="review-type-label" class="block text-sm font-medium text-slate-700 mb-2">Review Type</span>
          <div class="flex gap-3">
            <button
              type="button"
              on:click={() => reviewType = 'peer'}
              class="flex-1 px-4 py-2.5 rounded-lg border-2 transition-colors text-sm font-medium
                {reviewType === 'peer'
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300'}"
            >
              Peer Review (1x weight)
            </button>
            <button
              type="button"
              on:click={() => reviewType = 'independent'}
              class="flex-1 px-4 py-2.5 rounded-lg border-2 transition-colors text-sm font-medium
                {reviewType === 'independent'
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300'}"
            >
              Independent Review (2x weight)
            </button>
          </div>
        </div>

        <!-- Feedback -->
        <div>
          <label for="qc-feedback" class="block text-sm font-medium text-slate-700 mb-2">
            Feedback
            <span class="text-slate-400 font-normal">(required for rejection)</span>
          </label>
          <textarea
            id="qc-feedback"
            bind:value={feedback}
            rows="3"
            placeholder="Provide feedback on the submission quality, issues found, or suggestions for improvement..."
            class="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
          ></textarea>
        </div>

        <!-- Action Buttons -->
        <div class="flex gap-3">
          <button
            on:click={() => submitReview(false)}
            disabled={submitting}
            class="flex-1 py-3 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {#if submitting}
              <div class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            {:else}
              <XCircle size={20} />
            {/if}
            Reject
          </button>
          <button
            on:click={() => submitReview(true)}
            disabled={submitting}
            class="flex-1 py-3 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {#if submitting}
              <div class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            {:else}
              <CheckCircle size={20} />
            {/if}
            Approve
          </button>
        </div>

        <!-- Payout Preview -->
        <div class="bg-gradient-to-r from-slate-100 to-slate-50 rounded-lg p-4">
          <p class="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Estimated QC Payout</p>
          <div class="flex items-baseline gap-2">
            <span class="text-2xl font-bold text-slate-900">
              ${(task.dollar_value * 0.25 * 0.8 * Math.pow(0.4, previousReviews.length)).toFixed(2)}
            </span>
            <span class="text-sm text-slate-500">for this review pass</span>
          </div>
          <p class="text-xs text-slate-400 mt-1">
            Based on Shapley value calculation (β=0.25, γ=0.4)
          </p>
        </div>
      </div>
    {/if}
  </div>
</div>

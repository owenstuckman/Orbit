<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onMount, onDestroy } from 'svelte';
  import { user, capabilities } from '$lib/stores/auth';
  import { currentTask, tasks } from '$lib/stores/tasks';
  import { tasksApi } from '$lib/services/api';
  import { toasts } from '$lib/stores/notifications';
  import { formatCurrency } from '$lib/utils/payout';
  import TaskEditModal from '$lib/components/tasks/TaskEditModal.svelte';
  import type { TaskStatus } from '$lib/types';
  import {
    ArrowLeft,
    Clock,
    DollarSign,
    User,
    Calendar,
    Tag,
    TrendingUp,
    CheckCircle,
    XCircle,
    AlertTriangle,
    Play,
    Send,
    Upload,
    FileText,
    Edit,
    Eye,
    Star,
    Flag,
    Folder,
    Shield
  } from 'lucide-svelte';

  $: taskId = $page.params.id;

  let loading = true;
  let submitting = false;
  let showEditModal = false;
  let showSubmitModal = false;

  // Submission form
  let submissionNotes = '';
  let submissionFiles: string[] = [];

  // Status colors and labels
  const statusConfig: Record<TaskStatus, { color: string; bg: string; label: string }> = {
    open: { color: 'text-slate-700', bg: 'bg-slate-100', label: 'Open' },
    assigned: { color: 'text-blue-700', bg: 'bg-blue-100', label: 'Assigned' },
    in_progress: { color: 'text-yellow-700', bg: 'bg-yellow-100', label: 'In Progress' },
    completed: { color: 'text-purple-700', bg: 'bg-purple-100', label: 'Completed' },
    under_review: { color: 'text-orange-700', bg: 'bg-orange-100', label: 'Under Review' },
    approved: { color: 'text-green-700', bg: 'bg-green-100', label: 'Approved' },
    rejected: { color: 'text-red-700', bg: 'bg-red-100', label: 'Rejected' },
    paid: { color: 'text-emerald-700', bg: 'bg-emerald-100', label: 'Paid' }
  };

  onMount(async () => {
    await loadTask();
  });

  onDestroy(() => {
    currentTask.clear();
  });

  async function loadTask() {
    if (!taskId) return;
    loading = true;
    await currentTask.load(taskId);
    loading = false;
  }

  // Can submit work (only if assigned to user and in progress)
  $: canSubmit = $currentTask.task &&
    $currentTask.task.assignee_id === $user?.id &&
    ($currentTask.task.status === 'assigned' || $currentTask.task.status === 'in_progress');

  // Can start task (if assigned but not started)
  $: canStart = $currentTask.task &&
    $currentTask.task.assignee_id === $user?.id &&
    $currentTask.task.status === 'assigned';

  // Can accept task (if open and user has capability)
  $: canAccept = $currentTask.task &&
    $currentTask.task.status === 'open' &&
    $capabilities.canAcceptTasks &&
    $currentTask.task.required_level <= ($user?.training_level || 1);

  // Can edit task (PM/Admin)
  $: canEdit = $capabilities.canCreateTasks || $user?.role === 'admin';

  // Calculate total value with urgency
  $: totalValue = $currentTask.task
    ? $currentTask.task.dollar_value * $currentTask.task.urgency_multiplier
    : 0;

  // Days until deadline
  $: daysLeft = $currentTask.task?.deadline
    ? Math.ceil((new Date($currentTask.task.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  async function handleAcceptTask() {
    if (!$currentTask.task || !$user) return;

    const accepted = await tasks.accept($currentTask.task.id, $user.id);
    if (accepted) {
      toasts.success('Task accepted! You can now start working on it.');
      await loadTask();
    } else {
      toasts.error('Failed to accept task');
    }
  }

  async function handleStartTask() {
    if (!$currentTask.task) return;

    const updated = await tasksApi.update($currentTask.task.id, {
      status: 'in_progress'
    });

    if (updated) {
      currentTask.update({ status: 'in_progress' });
      toasts.success('Task started! Good luck!');
    } else {
      toasts.error('Failed to start task');
    }
  }

  async function handleSubmitWork() {
    if (!$currentTask.task) return;

    submitting = true;
    try {
      const submitted = await tasks.submit($currentTask.task.id, {
        notes: submissionNotes,
        submitted_at: new Date().toISOString()
      }, submissionFiles);

      if (submitted) {
        toasts.success('Work submitted for review!');
        showSubmitModal = false;
        submissionNotes = '';
        submissionFiles = [];
        await loadTask();
      } else {
        toasts.error('Failed to submit work');
      }
    } finally {
      submitting = false;
    }
  }

  function handleTaskUpdated() {
    loadTask();
    showEditModal = false;
  }
</script>

<svelte:head>
  <title>{$currentTask.task?.title || 'Task'} - Orbit</title>
</svelte:head>

{#if loading || $currentTask.loading}
  <div class="flex items-center justify-center py-20">
    <div class="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
  </div>
{:else if $currentTask.error}
  <div class="max-w-2xl mx-auto">
    <div class="bg-red-50 border border-red-200 rounded-xl p-8 text-center">
      <XCircle class="mx-auto text-red-400 mb-4" size={48} />
      <h2 class="text-lg font-semibold text-red-800 mb-2">Task Not Found</h2>
      <p class="text-red-600 mb-4">{$currentTask.error}</p>
      <button
        on:click={() => goto('/tasks')}
        class="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
      >
        Back to Tasks
      </button>
    </div>
  </div>
{:else if $currentTask.task}
  {@const task = $currentTask.task}
  {@const status = statusConfig[task.status]}

  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-start justify-between">
      <div class="flex items-start gap-4">
        <button
          on:click={() => goto('/tasks')}
          class="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <ArrowLeft size={20} />
        </button>

        <div>
          <div class="flex items-center gap-3 mb-2">
            <span class="px-3 py-1 text-sm font-medium rounded-full {status.bg} {status.color}">
              {status.label}
            </span>
            {#if task.urgency_multiplier > 1}
              <span class="flex items-center gap-1 px-2 py-1 bg-amber-100 text-amber-700 rounded-full text-sm font-medium">
                <TrendingUp size={14} />
                +{((task.urgency_multiplier - 1) * 100).toFixed(0)}% Urgency
              </span>
            {/if}
          </div>
          <h1 class="text-2xl font-bold text-slate-900">{task.title}</h1>
          {#if task.project}
            <div class="flex items-center gap-2 mt-2 text-slate-500">
              <Folder size={16} />
              <span>{task.project.name}</span>
            </div>
          {/if}
        </div>
      </div>

      <!-- Actions -->
      <div class="flex items-center gap-3">
        {#if canEdit}
          <button
            on:click={() => showEditModal = true}
            class="flex items-center gap-2 px-4 py-2 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <Edit size={18} />
            Edit
          </button>
        {/if}

        {#if canAccept}
          <button
            on:click={handleAcceptTask}
            class="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <CheckCircle size={18} />
            Accept Task
          </button>
        {/if}

        {#if canStart}
          <button
            on:click={handleStartTask}
            class="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Play size={18} />
            Start Work
          </button>
        {/if}

        {#if canSubmit}
          <button
            on:click={() => showSubmitModal = true}
            class="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
          >
            <Send size={18} />
            Submit Work
          </button>
        {/if}
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Main Content -->
      <div class="lg:col-span-2 space-y-6">
        <!-- Description -->
        <div class="bg-white rounded-xl border border-slate-200 p-6">
          <h2 class="text-lg font-semibold text-slate-900 mb-4">Description</h2>
          {#if task.description}
            <div class="prose prose-slate max-w-none">
              <p class="whitespace-pre-wrap text-slate-600">{task.description}</p>
            </div>
          {:else}
            <p class="text-slate-400 italic">No description provided</p>
          {/if}
        </div>

        <!-- Submission Data (if completed) -->
        {#if task.submission_data && ['completed', 'under_review', 'approved', 'paid'].includes(task.status)}
          <div class="bg-white rounded-xl border border-slate-200 p-6">
            <h2 class="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <FileText class="text-purple-500" size={20} />
              Submission
            </h2>

            {#if task.submission_data.notes}
              <div class="mb-4">
                <h3 class="text-sm font-medium text-slate-700 mb-2">Notes</h3>
                <p class="text-slate-600 whitespace-pre-wrap bg-slate-50 rounded-lg p-4">
                  {task.submission_data.notes}
                </p>
              </div>
            {/if}

            {#if task.submission_files && task.submission_files.length > 0}
              <div>
                <h3 class="text-sm font-medium text-slate-700 mb-2">Attached Files</h3>
                <div class="space-y-2">
                  {#each task.submission_files as file}
                    <div class="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                      <FileText class="text-slate-400" size={18} />
                      <span class="text-slate-600">{file}</span>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}

            {#if task.completed_at}
              <p class="mt-4 text-sm text-slate-500">
                Submitted on {new Date(task.completed_at).toLocaleString()}
              </p>
            {/if}
          </div>
        {/if}

        <!-- QC Reviews -->
        {#if task.qc_reviews && task.qc_reviews.length > 0}
          <div class="bg-white rounded-xl border border-slate-200 p-6">
            <h2 class="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Shield class="text-indigo-500" size={20} />
              QC Reviews ({task.qc_reviews.length})
            </h2>

            <div class="space-y-4">
              {#each task.qc_reviews as review}
                <div class="border border-slate-200 rounded-lg p-4">
                  <div class="flex items-start justify-between mb-3">
                    <div class="flex items-center gap-3">
                      <div class="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-sm font-medium">
                        {review.reviewer?.full_name?.charAt(0) || 'Q'}
                      </div>
                      <div>
                        <p class="font-medium text-slate-900">{review.reviewer?.full_name || 'QC Reviewer'}</p>
                        <p class="text-xs text-slate-500 capitalize">{review.review_type} review</p>
                      </div>
                    </div>
                    <div class="flex items-center gap-2">
                      {#if review.passed === true}
                        <span class="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                          <CheckCircle size={14} />
                          Passed
                        </span>
                      {:else if review.passed === false}
                        <span class="flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded-full text-sm font-medium">
                          <XCircle size={14} />
                          Failed
                        </span>
                      {:else}
                        <span class="px-2 py-1 bg-slate-100 text-slate-600 rounded-full text-sm">
                          Pending
                        </span>
                      {/if}
                    </div>
                  </div>

                  {#if review.feedback}
                    <p class="text-slate-600 text-sm">{review.feedback}</p>
                  {/if}

                  {#if review.confidence}
                    <div class="mt-2 flex items-center gap-2 text-sm text-slate-500">
                      <span>Confidence: {(review.confidence * 100).toFixed(0)}%</span>
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>

      <!-- Sidebar -->
      <div class="space-y-6">
        <!-- Value Card -->
        <div class="bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl p-6 text-white">
          <div class="flex items-center gap-2 text-green-100 text-sm mb-2">
            <DollarSign size={16} />
            Task Value
          </div>
          <p class="text-3xl font-bold">{formatCurrency(totalValue)}</p>
          {#if task.urgency_multiplier > 1}
            <p class="text-green-100 text-sm mt-1">
              Base: {formatCurrency(task.dollar_value)} + {((task.urgency_multiplier - 1) * 100).toFixed(0)}% urgency
            </p>
          {/if}
        </div>

        <!-- Details Card -->
        <div class="bg-white rounded-xl border border-slate-200 p-6">
          <h3 class="font-semibold text-slate-900 mb-4">Details</h3>

          <div class="space-y-4">
            <!-- Assignee -->
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2 text-slate-500">
                <User size={16} />
                <span>Assignee</span>
              </div>
              {#if task.assignee}
                <div class="flex items-center gap-2">
                  <div class="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-xs font-medium">
                    {task.assignee.full_name?.charAt(0) || task.assignee.email.charAt(0).toUpperCase()}
                  </div>
                  <span class="text-slate-900 font-medium">{task.assignee.full_name || 'Anonymous'}</span>
                </div>
              {:else}
                <span class="text-slate-400">Unassigned</span>
              {/if}
            </div>

            <!-- Deadline -->
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2 text-slate-500">
                <Calendar size={16} />
                <span>Deadline</span>
              </div>
              {#if task.deadline}
                <div class="text-right">
                  <p class="text-slate-900 font-medium">
                    {new Date(task.deadline).toLocaleDateString()}
                  </p>
                  {#if daysLeft !== null}
                    <p class="text-sm {daysLeft <= 0 ? 'text-red-500' : daysLeft <= 3 ? 'text-amber-500' : 'text-slate-500'}">
                      {daysLeft <= 0 ? 'Overdue!' : `${daysLeft} days left`}
                    </p>
                  {/if}
                </div>
              {:else}
                <span class="text-slate-400">No deadline</span>
              {/if}
            </div>

            <!-- Required Level -->
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2 text-slate-500">
                <Star size={16} />
                <span>Required Level</span>
              </div>
              <span class="text-slate-900 font-medium">Level {task.required_level}+</span>
            </div>

            <!-- Story Points -->
            {#if task.story_points}
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2 text-slate-500">
                  <Tag size={16} />
                  <span>Story Points</span>
                </div>
                <span class="text-slate-900 font-medium">{task.story_points}</span>
              </div>
            {/if}

            <!-- Created -->
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2 text-slate-500">
                <Clock size={16} />
                <span>Created</span>
              </div>
              <span class="text-slate-600 text-sm">
                {new Date(task.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>

        <!-- Assignment Status for Workers -->
        {#if $user?.role === 'employee' || $user?.role === 'contractor'}
          <div class="bg-white rounded-xl border border-slate-200 p-6">
            <h3 class="font-semibold text-slate-900 mb-4">Your Status</h3>

            {#if task.assignee_id === $user.id}
              <div class="flex items-center gap-3 p-4 bg-green-50 rounded-lg">
                <CheckCircle class="text-green-600" size={24} />
                <div>
                  <p class="font-medium text-green-800">This task is assigned to you</p>
                  <p class="text-sm text-green-600">
                    {task.status === 'assigned' ? 'Click "Start Work" to begin' :
                     task.status === 'in_progress' ? 'Submit your work when ready' :
                     task.status === 'completed' ? 'Waiting for QC review' :
                     task.status === 'approved' ? 'Great job! Task approved' : ''}
                  </p>
                </div>
              </div>
            {:else if task.status === 'open'}
              {#if task.required_level <= ($user?.training_level || 1)}
                <div class="flex items-center gap-3 p-4 bg-blue-50 rounded-lg">
                  <Flag class="text-blue-600" size={24} />
                  <div>
                    <p class="font-medium text-blue-800">Available for you</p>
                    <p class="text-sm text-blue-600">Click "Accept Task" to take this on</p>
                  </div>
                </div>
              {:else}
                <div class="flex items-center gap-3 p-4 bg-amber-50 rounded-lg">
                  <AlertTriangle class="text-amber-600" size={24} />
                  <div>
                    <p class="font-medium text-amber-800">Level requirement not met</p>
                    <p class="text-sm text-amber-600">
                      Requires Level {task.required_level}, you are Level {$user?.training_level || 1}
                    </p>
                  </div>
                </div>
              {/if}
            {:else}
              <div class="flex items-center gap-3 p-4 bg-slate-50 rounded-lg">
                <Eye class="text-slate-500" size={24} />
                <div>
                  <p class="font-medium text-slate-700">Viewing only</p>
                  <p class="text-sm text-slate-500">This task is assigned to someone else</p>
                </div>
              </div>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  </div>

  <!-- Submit Work Modal -->
  {#if showSubmitModal}
    <div class="fixed inset-0 z-50 overflow-y-auto">
      <div class="flex min-h-full items-center justify-center p-4">
        <button
          class="fixed inset-0 bg-black/50"
          on:click={() => showSubmitModal = false}
        />

        <div class="relative bg-white rounded-xl shadow-xl w-full max-w-lg">
          <div class="p-6 border-b border-slate-200">
            <h2 class="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <Send class="text-purple-500" size={20} />
              Submit Work
            </h2>
            <p class="text-sm text-slate-500 mt-1">
              Submit your completed work for QC review
            </p>
          </div>

          <form on:submit|preventDefault={handleSubmitWork} class="p-6 space-y-4">
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1" for="submission-notes">
                Submission Notes
              </label>
              <textarea
                id="submission-notes"
                bind:value={submissionNotes}
                rows="4"
                class="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Describe what you've completed, any challenges encountered, and notes for the reviewer..."
              ></textarea>
            </div>

            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1" for="file-upload">
                Attachments (optional)
              </label>
              <div class="border-2 border-dashed border-slate-200 rounded-lg p-6 text-center hover:border-indigo-400 transition-colors">
                <Upload class="mx-auto text-slate-400 mb-2" size={24} />
                <p class="text-sm text-slate-500">
                  Drag files here or click to upload
                </p>
                <p class="text-xs text-slate-400 mt-1">
                  File upload not implemented yet
                </p>
              </div>
            </div>

            <div class="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
              <AlertTriangle class="text-amber-600 flex-shrink-0 mt-0.5" size={18} />
              <div class="text-sm text-amber-800">
                <p class="font-medium">Before submitting:</p>
                <ul class="mt-1 space-y-1 text-amber-700">
                  <li>Ensure your work is complete and tested</li>
                  <li>Double-check for any errors or issues</li>
                  <li>Include relevant notes for the reviewer</li>
                </ul>
              </div>
            </div>

            <div class="flex justify-end gap-3 pt-4 border-t border-slate-200">
              <button
                type="button"
                on:click={() => showSubmitModal = false}
                class="px-4 py-2 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                class="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
              >
                {#if submitting}
                  <div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                {:else}
                  <Send size={18} />
                {/if}
                Submit for Review
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  {/if}

  <!-- Edit Modal -->
  {#if showEditModal}
    <TaskEditModal
      bind:show={showEditModal}
      task={task}
      on:updated={handleTaskUpdated}
    />
  {/if}
{/if}

<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { user, capabilities } from '$lib/stores/auth';
  import { tasksApi } from '$lib/services/api';
  import { storage } from '$lib/services/supabase';
  import { TaskEditModal, QCReviewForm } from '$lib/components/tasks';
  import type { Task } from '$lib/types';
  import {
    ArrowLeft,
    Clock,
    DollarSign,
    User as UserIcon,
    Calendar,
    CheckCircle,
    XCircle,
    Upload,
    FileText,
    Send,
    Star,
    TrendingUp,
    Edit3,
    Sparkles,
    Trophy,
    Zap,
    Award
  } from 'lucide-svelte';

  let task: Task | null = null;
  let loading = true;
  let error = '';
  let submitting = false;
  let accepting = false;

  // Modals
  let showEditModal = false;

  // Submission form
  let submissionNotes = '';
  let submissionFiles: File[] = [];
  let uploadProgress = 0;

  $: taskId = $page.params.id;
  $: isAssignee = task?.assignee_id === $user?.id;
  $: canAccept = $capabilities.canAcceptTasks && task?.status === 'open' && ($user?.training_level ?? 0) >= (task?.required_level ?? 0);
  $: canSubmit = isAssignee && (task?.status === 'assigned' || task?.status === 'in_progress');
  $: canReview = $capabilities.canReviewQC && ['completed', 'under_review'].includes(task?.status || '');
  $: canEdit = $capabilities.canCreateTasks && !['approved', 'paid'].includes(task?.status || '');
  $: urgencyColor = (task?.urgency_multiplier ?? 1) > 1.2 ? 'text-red-500' : (task?.urgency_multiplier ?? 1) > 1.1 ? 'text-amber-500' : 'text-green-500';

  onMount(async () => {
    await loadTask();
  });

  async function loadTask() {
    loading = true;
    error = '';
    try {
      task = await tasksApi.getById(taskId);
      if (!task) {
        error = 'Task not found';
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load task';
    } finally {
      loading = false;
    }
  }

  async function acceptTask() {
    if (!task || !$user) return;

    accepting = true;
    try {
      const updated = await tasksApi.accept(task.id, $user.id);
      if (updated) {
        task = { ...task, ...updated };
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to accept task';
    } finally {
      accepting = false;
    }
  }

  async function startTask() {
    if (!task) return;

    try {
      const updated = await tasksApi.update(task.id, { status: 'in_progress' });
      if (updated) {
        task = { ...task, ...updated };
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to start task';
    }
  }

  async function submitTask() {
    if (!task || !$user) return;

    submitting = true;
    uploadProgress = 0;

    try {
      // Upload files if any
      const uploadedPaths: string[] = [];
      if (submissionFiles.length > 0) {
        for (let i = 0; i < submissionFiles.length; i++) {
          const file = submissionFiles[i];
          const path = `${$user.org_id}/${$user.id}/${task.id}/${file.name}`;
          const { error: uploadError } = await storage.uploadFile('submissions', path, file);
          if (uploadError) throw uploadError;
          uploadedPaths.push(path);
          uploadProgress = ((i + 1) / submissionFiles.length) * 100;
        }
      }

      // Submit the task
      const updated = await tasksApi.submit(
        task.id,
        { notes: submissionNotes, submitted_at: new Date().toISOString() },
        uploadedPaths
      );

      if (updated) {
        task = { ...task, ...updated };
        submissionNotes = '';
        submissionFiles = [];
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to submit task';
    } finally {
      submitting = false;
      uploadProgress = 0;
    }
  }

  function handleFileSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files) {
      submissionFiles = [...submissionFiles, ...Array.from(input.files)];
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    if (e.dataTransfer?.files) {
      submissionFiles = [...submissionFiles, ...Array.from(e.dataTransfer.files)];
    }
  }

  function removeFile(index: number) {
    submissionFiles = submissionFiles.filter((_, i) => i !== index);
  }

  function handleReviewed() {
    loadTask();
  }

  function handleTaskUpdated(event: CustomEvent<Task>) {
    task = event.detail;
  }

  function getStatusBadge(status: string) {
    const badges: Record<string, { bg: string; text: string; icon: typeof CheckCircle }> = {
      open: { bg: 'bg-slate-100', text: 'text-slate-700', icon: Clock },
      assigned: { bg: 'bg-blue-100', text: 'text-blue-700', icon: UserIcon },
      in_progress: { bg: 'bg-yellow-100', text: 'text-yellow-700', icon: TrendingUp },
      completed: { bg: 'bg-purple-100', text: 'text-purple-700', icon: Send },
      under_review: { bg: 'bg-orange-100', text: 'text-orange-700', icon: Clock },
      approved: { bg: 'bg-green-100', text: 'text-green-700', icon: CheckCircle },
      rejected: { bg: 'bg-red-100', text: 'text-red-700', icon: XCircle },
      paid: { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: DollarSign }
    };
    return badges[status] || { bg: 'bg-gray-100', text: 'text-gray-800', icon: Clock };
  }

  function formatDate(date: string | null) {
    if (!date) return 'Not set';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  // Calculate XP from task
  function calculateXP(task: Task): number {
    const baseXP = task.story_points ? task.story_points * 10 : 25;
    const urgencyBonus = Math.floor((task.urgency_multiplier - 1) * 50);
    const levelBonus = (task.required_level - 1) * 5;
    return baseXP + urgencyBonus + levelBonus;
  }
</script>

<svelte:head>
  <title>{task?.title || 'Task'} - Orbit</title>
</svelte:head>

<div class="max-w-6xl mx-auto">
  <!-- Back button and actions -->
  <div class="flex items-center justify-between mb-6">
    <a
      href="/tasks"
      class="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
    >
      <ArrowLeft size={18} />
      Back to tasks
    </a>

    {#if canEdit && task}
      <button
        on:click={() => showEditModal = true}
        class="flex items-center gap-2 px-4 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
      >
        <Edit3 size={18} />
        Edit Task
      </button>
    {/if}
  </div>

  {#if loading}
    <div class="flex items-center justify-center py-20">
      <div class="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
    </div>
  {:else if error}
    <div class="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
      <XCircle class="mx-auto text-red-500 mb-2" size={32} />
      <p class="text-red-800">{error}</p>
      <button
        class="mt-4 text-red-600 hover:text-red-800 underline"
        on:click={loadTask}
      >
        Try again
      </button>
    </div>
  {:else if task}
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Main content -->
      <div class="lg:col-span-2 space-y-6">
        <!-- Header Card -->
        <div class="bg-white rounded-xl border border-slate-200 p-6">
          <div class="flex items-start justify-between mb-4">
            <div class="flex-1">
              <div class="flex items-center gap-2 mb-2">
                <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium {getStatusBadge(task.status).bg} {getStatusBadge(task.status).text}">
                  <svelte:component this={getStatusBadge(task.status).icon} size={12} />
                  {task.status.replace('_', ' ')}
                </span>
                {#if task.urgency_multiplier >= 1.5}
                  <span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                    <Zap size={12} />
                    Hot Task
                  </span>
                {:else if task.urgency_multiplier > 1}
                  <span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                    <TrendingUp size={12} />
                    Bonus Task
                  </span>
                {/if}
              </div>
              <h1 class="text-2xl font-bold text-slate-900">{task.title}</h1>
              {#if task.project}
                <a href="/projects/{task.project.id}" class="text-sm text-indigo-600 hover:text-indigo-700 mt-1 inline-block">
                  {task.project.name}
                </a>
              {/if}
            </div>
            <div class="text-right">
              <div class="text-3xl font-bold text-green-600">${(task.dollar_value * task.urgency_multiplier).toFixed(2)}</div>
              {#if task.urgency_multiplier > 1}
                <div class="flex items-center justify-end gap-1 text-sm {urgencyColor}">
                  <TrendingUp size={14} />
                  {task.urgency_multiplier.toFixed(2)}x multiplier
                </div>
              {/if}
            </div>
          </div>

          {#if task.description}
            <div class="prose prose-slate max-w-none mt-4 pt-4 border-t border-slate-100">
              <p class="text-slate-600 whitespace-pre-wrap">{task.description}</p>
            </div>
          {/if}

          <!-- Gamification badges -->
          <div class="flex flex-wrap gap-2 mt-4 pt-4 border-t border-slate-100">
            <div class="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 rounded-lg">
              <Trophy size={14} class="text-indigo-500" />
              <span class="text-sm font-medium text-indigo-700">{calculateXP(task)} XP</span>
            </div>
            {#if task.required_level >= 3}
              <div class="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 rounded-lg">
                <Award size={14} class="text-purple-500" />
                <span class="text-sm font-medium text-purple-700">Expert Task</span>
              </div>
            {/if}
            {#if task.story_points}
              <div class="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-lg">
                <Sparkles size={14} class="text-slate-500" />
                <span class="text-sm font-medium text-slate-700">{task.story_points} Story Points</span>
              </div>
            {/if}
          </div>

          <!-- Action buttons -->
          <div class="mt-6 flex flex-wrap gap-3">
            {#if canAccept}
              <button
                on:click={acceptTask}
                disabled={accepting}
                class="px-6 py-2.5 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {#if accepting}
                  <div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                {:else}
                  <CheckCircle size={18} />
                {/if}
                Accept Task
              </button>
            {/if}

            {#if isAssignee && task.status === 'assigned'}
              <button
                on:click={startTask}
                class="px-6 py-2.5 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
              >
                <TrendingUp size={18} />
                Start Working
              </button>
            {/if}
          </div>
        </div>

        <!-- Submission form -->
        {#if canSubmit}
          <div class="bg-white rounded-xl border border-slate-200 p-6">
            <h2 class="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Send size={20} class="text-indigo-500" />
              Submit Your Work
            </h2>

            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-2">
                  Notes / Comments
                </label>
                <textarea
                  bind:value={submissionNotes}
                  rows="4"
                  placeholder="Describe your work, any issues encountered, or notes for review..."
                  class="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
                ></textarea>
              </div>

              <div>
                <label class="block text-sm font-medium text-slate-700 mb-2">
                  Attachments
                </label>
                <div
                  class="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center hover:border-indigo-400 transition-colors"
                  on:drop={handleDrop}
                  on:dragover|preventDefault
                  role="button"
                  tabindex="0"
                >
                  <input
                    type="file"
                    multiple
                    on:change={handleFileSelect}
                    class="hidden"
                    id="file-upload"
                  />
                  <label for="file-upload" class="cursor-pointer">
                    <Upload class="mx-auto text-slate-400 mb-2" size={32} />
                    <p class="text-sm text-slate-600">
                      <span class="text-indigo-600 font-medium">Click to upload</span> or drag and drop
                    </p>
                    <p class="text-xs text-slate-400 mt-1">PDF, DOC, images up to 50MB</p>
                  </label>
                </div>

                {#if submissionFiles.length > 0}
                  <ul class="mt-3 space-y-2">
                    {#each submissionFiles as file, i}
                      <li class="flex items-center justify-between bg-slate-50 rounded-lg px-4 py-2">
                        <div class="flex items-center gap-2">
                          <FileText size={16} class="text-slate-400" />
                          <span class="text-sm text-slate-700">{file.name}</span>
                          <span class="text-xs text-slate-400">({(file.size / 1024).toFixed(1)} KB)</span>
                        </div>
                        <button
                          on:click={() => removeFile(i)}
                          class="text-red-500 hover:text-red-700"
                        >
                          <XCircle size={18} />
                        </button>
                      </li>
                    {/each}
                  </ul>
                {/if}
              </div>

              {#if uploadProgress > 0 && uploadProgress < 100}
                <div class="w-full bg-slate-200 rounded-full h-2">
                  <div
                    class="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                    style="width: {uploadProgress}%"
                  ></div>
                </div>
              {/if}

              <button
                on:click={submitTask}
                disabled={submitting}
                class="w-full py-3 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {#if submitting}
                  <div class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Submitting...
                {:else}
                  <Send size={18} />
                  Submit for Review
                {/if}
              </button>
            </div>
          </div>
        {/if}

        <!-- QC Review Section -->
        {#if canReview}
          <QCReviewForm {task} on:reviewed={handleReviewed} />
        {/if}

        <!-- QC Reviews History -->
        {#if task.qc_reviews && task.qc_reviews.length > 0}
          <div class="bg-white rounded-xl border border-slate-200 p-6">
            <h2 class="text-lg font-semibold text-slate-900 mb-4">Review History</h2>

            <div class="space-y-4">
              {#each task.qc_reviews as review}
                <div class="border border-slate-200 rounded-lg p-4 {review.passed ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}">
                  <div class="flex items-start justify-between mb-2">
                    <div class="flex items-center gap-2">
                      {#if review.passed}
                        <CheckCircle class="text-green-500" size={20} />
                        <span class="font-medium text-green-800">Approved</span>
                      {:else}
                        <XCircle class="text-red-500" size={20} />
                        <span class="font-medium text-red-800">Rejected</span>
                      {/if}
                      <span class="text-xs px-2 py-0.5 bg-slate-100 rounded text-slate-600">
                        {review.review_type}
                      </span>
                    </div>
                    <span class="text-sm text-slate-500">
                      Pass #{review.pass_number}
                    </span>
                  </div>
                  {#if review.feedback}
                    <p class="text-sm text-slate-600 mt-2">{review.feedback}</p>
                  {/if}
                  {#if review.confidence}
                    <div class="mt-2 flex items-center gap-2">
                      <span class="text-xs text-slate-500">Confidence:</span>
                      <div class="flex-1 bg-slate-200 rounded-full h-1.5 max-w-[100px]">
                        <div
                          class="bg-indigo-600 h-1.5 rounded-full"
                          style="width: {review.confidence * 100}%"
                        ></div>
                      </div>
                      <span class="text-xs text-slate-600">{(review.confidence * 100).toFixed(0)}%</span>
                    </div>
                  {/if}
                  <p class="text-xs text-slate-400 mt-2">
                    {formatDate(review.created_at)}
                  </p>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>

      <!-- Sidebar -->
      <div class="space-y-6">
        <!-- Details Card -->
        <div class="bg-white rounded-xl border border-slate-200 p-6">
          <h3 class="text-sm font-semibold text-slate-900 uppercase tracking-wider mb-4">Details</h3>

          <dl class="space-y-4">
            <div>
              <dt class="text-xs text-slate-500 uppercase tracking-wider">Assignee</dt>
              <dd class="mt-1 flex items-center gap-2">
                {#if task.assignee}
                  <div class="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center">
                    <span class="text-sm font-medium text-white">
                      {task.assignee.full_name?.charAt(0) || '?'}
                    </span>
                  </div>
                  <div>
                    <p class="text-slate-900 font-medium">{task.assignee.full_name}</p>
                    <p class="text-xs text-slate-500">Level {task.assignee.level || 1}</p>
                  </div>
                {:else}
                  <UserIcon size={16} class="text-slate-400" />
                  <span class="text-slate-500">Unassigned</span>
                {/if}
              </dd>
            </div>

            <div>
              <dt class="text-xs text-slate-500 uppercase tracking-wider">Required Level</dt>
              <dd class="mt-1 flex items-center gap-1">
                {#each Array(task.required_level) as _, i}
                  <Star size={16} class="text-amber-500 fill-amber-500" />
                {/each}
                {#each Array(5 - task.required_level) as _, i}
                  <Star size={16} class="text-slate-200" />
                {/each}
                <span class="ml-2 text-sm text-slate-600">Level {task.required_level}+</span>
              </dd>
            </div>

            <div>
              <dt class="text-xs text-slate-500 uppercase tracking-wider">Deadline</dt>
              <dd class="mt-1 flex items-center gap-2">
                <Calendar size={16} class="text-slate-400" />
                <span class="text-slate-700">{formatDate(task.deadline)}</span>
              </dd>
            </div>

            <div>
              <dt class="text-xs text-slate-500 uppercase tracking-wider">Created</dt>
              <dd class="mt-1 flex items-center gap-2">
                <Clock size={16} class="text-slate-400" />
                <span class="text-slate-700">{formatDate(task.created_at)}</span>
              </dd>
            </div>

            {#if task.assigned_at}
              <div>
                <dt class="text-xs text-slate-500 uppercase tracking-wider">Assigned</dt>
                <dd class="mt-1 text-slate-700">{formatDate(task.assigned_at)}</dd>
              </div>
            {/if}

            {#if task.completed_at}
              <div>
                <dt class="text-xs text-slate-500 uppercase tracking-wider">Completed</dt>
                <dd class="mt-1 text-slate-700">{formatDate(task.completed_at)}</dd>
              </div>
            {/if}
          </dl>
        </div>

        <!-- Payout Estimate Card -->
        <div class="bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl p-6 text-white">
          <h3 class="text-sm font-semibold uppercase tracking-wider opacity-90 mb-2">Estimated Payout</h3>
          <div class="text-3xl font-bold">
            ${(task.dollar_value * task.urgency_multiplier * (1 - ($user?.r ?? 0.7))).toFixed(2)}
          </div>
          <p class="text-sm opacity-75 mt-2">
            Based on your r = {($user?.r ?? 0.7).toFixed(2)}
          </p>
          <div class="mt-4 pt-4 border-t border-white/20 text-sm space-y-1">
            <div class="flex justify-between">
              <span class="opacity-75">Base value</span>
              <span>${task.dollar_value.toFixed(2)}</span>
            </div>
            <div class="flex justify-between">
              <span class="opacity-75">Urgency bonus</span>
              <span>×{task.urgency_multiplier.toFixed(2)}</span>
            </div>
            <div class="flex justify-between">
              <span class="opacity-75">Task portion (1-r)</span>
              <span>×{(1 - ($user?.r ?? 0.7)).toFixed(2)}</span>
            </div>
          </div>
        </div>

        <!-- XP Reward Card -->
        <div class="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl p-6 text-white">
          <h3 class="text-sm font-semibold uppercase tracking-wider opacity-90 mb-2">XP Reward</h3>
          <div class="text-3xl font-bold flex items-center gap-2">
            <Trophy size={28} />
            {calculateXP(task)} XP
          </div>
          <p class="text-sm opacity-75 mt-2">
            Complete this task to earn experience points
          </p>
          <div class="mt-4 pt-4 border-t border-white/20 text-sm space-y-1">
            <div class="flex justify-between">
              <span class="opacity-75">Base XP</span>
              <span>{task.story_points ? task.story_points * 10 : 25}</span>
            </div>
            {#if task.urgency_multiplier > 1}
              <div class="flex justify-between">
                <span class="opacity-75">Urgency bonus</span>
                <span>+{Math.floor((task.urgency_multiplier - 1) * 50)}</span>
              </div>
            {/if}
            {#if task.required_level > 1}
              <div class="flex justify-between">
                <span class="opacity-75">Level bonus</span>
                <span>+{(task.required_level - 1) * 5}</span>
              </div>
            {/if}
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>

<!-- Edit Task Modal -->
{#if task}
  <TaskEditModal
    bind:show={showEditModal}
    {task}
    on:updated={handleTaskUpdated}
  />
{/if}

<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { X, Edit3, Calendar, DollarSign, Sparkles, AlertCircle, Trash2, Tag } from 'lucide-svelte';
  import { tasks } from '$lib/stores/tasks';
  import TagInput from '$lib/components/common/TagInput.svelte';
  import type { Task, TaskStatus } from '$lib/types';

  export let show = false;
  export let task: Task | null = null;

  const dispatch = createEventDispatcher<{ close: void; updated: Task; deleted: string }>();

  // Form state
  let title = '';
  let description = '';
  let dollarValue = 50;
  let storyPoints: number | null = null;
  let urgencyMultiplier = 1.0;
  let requiredLevel = 1;
  let deadline = '';
  let status: TaskStatus = 'open';
  let tags: string[] = [];

  // Common tag suggestions
  const tagSuggestions = ['bug', 'feature', 'urgent', 'design', 'backend', 'frontend', 'documentation', 'testing', 'refactor', 'security'];

  // UI state
  let submitting = false;
  let deleting = false;
  let error = '';
  let showDeleteConfirm = false;

  // Initialize form when task changes
  $: if (show && task) {
    initializeForm();
  }

  function initializeForm() {
    if (!task) return;
    title = task.title;
    description = task.description || '';
    dollarValue = task.dollar_value;
    storyPoints = task.story_points;
    urgencyMultiplier = task.urgency_multiplier;
    requiredLevel = task.required_level;
    deadline = task.deadline ? new Date(task.deadline).toISOString().slice(0, 16) : '';
    status = task.status;
    tags = task.tags || [];
    error = '';
    showDeleteConfirm = false;
  }

  function close() {
    show = false;
    dispatch('close');
  }

  async function handleSubmit() {
    if (!task) return;
    if (!title.trim()) {
      error = 'Title is required';
      return;
    }
    if (dollarValue <= 0) {
      error = 'Dollar value must be greater than 0';
      return;
    }

    submitting = true;
    error = '';

    try {
      const updates: Partial<Task> = {
        title: title.trim(),
        description: description.trim() || null,
        dollar_value: dollarValue,
        story_points: storyPoints,
        urgency_multiplier: urgencyMultiplier,
        required_level: requiredLevel,
        deadline: deadline ? new Date(deadline).toISOString() : null,
        tags: tags,
        status
      };

      const updated = await tasks.updateTask(task.id, updates);

      if (updated) {
        dispatch('updated', updated);
        close();
      } else {
        error = 'Failed to update task';
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to update task';
    } finally {
      submitting = false;
    }
  }

  async function handleDelete() {
    if (!task) return;

    deleting = true;
    error = '';

    try {
      // For now, we'll just update status to cancelled/rejected
      // In production, you might want a soft delete
      const updated = await tasks.updateTask(task.id, { status: 'rejected' });

      if (updated) {
        dispatch('deleted', task.id);
        close();
      } else {
        error = 'Failed to delete task';
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to delete task';
    } finally {
      deleting = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      close();
    }
  }

  // Story point presets
  const storyPointPresets = [
    { label: 'XS', value: 1 },
    { label: 'S', value: 2 },
    { label: 'M', value: 3 },
    { label: 'L', value: 5 },
    { label: 'XL', value: 8 },
    { label: 'XXL', value: 13 }
  ];

  // Urgency presets
  const urgencyPresets = [
    { label: 'Normal', value: 1.0, color: 'bg-slate-100 text-slate-700' },
    { label: '+10%', value: 1.1, color: 'bg-amber-100 text-amber-700' },
    { label: '+20%', value: 1.2, color: 'bg-orange-100 text-orange-700' },
    { label: '+50%', value: 1.5, color: 'bg-red-100 text-red-700' }
  ];

  // Status options (limited based on current status)
  const statusOptions: { value: TaskStatus; label: string; disabled?: boolean }[] = [
    { value: 'open', label: 'Open' },
    { value: 'assigned', label: 'Assigned' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'completed', label: 'Completed' },
    { value: 'under_review', label: 'Under Review' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' },
    { value: 'paid', label: 'Paid' }
  ];

  // Check if task can be edited (not in final states)
  $: canEdit = task && !['approved', 'paid'].includes(task.status);
  $: canChangeStatus = task && !['paid'].includes(task.status);
</script>

<svelte:window on:keydown={handleKeydown} />

{#if show && task}
  <div class="fixed inset-0 z-50 overflow-y-auto">
    <!-- Backdrop -->
    <button
      class="fixed inset-0 bg-black/50 transition-opacity"
      on:click={close}
      aria-label="Close modal"
    />

    <!-- Modal -->
    <div class="flex min-h-full items-center justify-center p-4">
      <div class="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <!-- Header -->
        <div class="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <div class="flex items-center gap-3">
            <div class="p-2 bg-indigo-100 rounded-lg">
              <Edit3 class="text-indigo-600" size={20} />
            </div>
            <h2 class="text-xl font-bold text-slate-900">Edit Task</h2>
          </div>
          <button
            on:click={close}
            class="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <!-- Form -->
        <form on:submit|preventDefault={handleSubmit} class="p-6 space-y-6">
          {#if error}
            <div class="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
              <AlertCircle size={18} />
              <span class="text-sm">{error}</span>
            </div>
          {/if}

          {#if !canEdit}
            <div class="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700">
              <AlertCircle size={18} />
              <span class="text-sm">This task is in a final state and cannot be fully edited.</span>
            </div>
          {/if}

          <!-- Title -->
          <div>
            <label for="edit-title" class="block text-sm font-medium text-slate-700 mb-1">
              Task Title <span class="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="edit-title"
              bind:value={title}
              disabled={!canEdit}
              placeholder="Enter task title..."
              class="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-slate-50 disabled:text-slate-500"
              required
            />
          </div>

          <!-- Status -->
          {#if canChangeStatus}
            <div>
              <label for="edit-status" class="block text-sm font-medium text-slate-700 mb-1">
                Status
              </label>
              <select
                id="edit-status"
                bind:value={status}
                class="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                {#each statusOptions as option}
                  <option value={option.value} disabled={option.disabled}>
                    {option.label}
                  </option>
                {/each}
              </select>
            </div>
          {/if}

          <!-- Description -->
          <div>
            <label for="edit-description" class="block text-sm font-medium text-slate-700 mb-1">
              Description
            </label>
            <textarea
              id="edit-description"
              bind:value={description}
              disabled={!canEdit}
              rows="3"
              placeholder="Describe the task requirements..."
              class="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none disabled:bg-slate-50 disabled:text-slate-500"
            ></textarea>
          </div>

          <!-- Tags -->
          <div>
            <span id="edit-tags-label" class="block text-sm font-medium text-slate-700 mb-1">
              <span class="flex items-center gap-2">
                <Tag size={16} class="text-slate-400" />
                Tags
              </span>
            </span>
            <TagInput
              bind:tags
              suggestions={tagSuggestions}
              placeholder="Add tags..."
              disabled={!canEdit}
            />
          </div>

          <!-- Value and Points Row -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <!-- Dollar Value -->
            <div>
              <label for="edit-dollarValue" class="block text-sm font-medium text-slate-700 mb-1">
                Base Value <span class="text-red-500">*</span>
              </label>
              <div class="relative">
                <DollarSign class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="number"
                  id="edit-dollarValue"
                  bind:value={dollarValue}
                  disabled={!canEdit}
                  min="1"
                  step="0.01"
                  class="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-slate-50 disabled:text-slate-500"
                  required
                />
              </div>
            </div>

            <!-- Story Points -->
            <div role="group" aria-labelledby="edit-story-points-label">
              <span id="edit-story-points-label" class="block text-sm font-medium text-slate-700 mb-1">
                Story Points (T-Shirt Size)
              </span>
              <div class="flex flex-wrap gap-2">
                {#each storyPointPresets as preset}
                  <button
                    type="button"
                    on:click={() => { if (canEdit) storyPoints = preset.value; }}
                    disabled={!canEdit}
                    class="px-3 py-1.5 text-sm font-medium rounded-lg transition-colors disabled:opacity-50
                      {storyPoints === preset.value
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}"
                  >
                    {preset.label}
                  </button>
                {/each}
              </div>
            </div>
          </div>

          <!-- Urgency Multiplier -->
          <div role="group" aria-labelledby="edit-urgency-label">
            <span id="edit-urgency-label" class="block text-sm font-medium text-slate-700 mb-1">
              Urgency Bonus
            </span>
            <div class="flex flex-wrap gap-2">
              {#each urgencyPresets as preset}
                <button
                  type="button"
                  on:click={() => { if (canEdit) urgencyMultiplier = preset.value; }}
                  disabled={!canEdit}
                  class="px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50
                    {urgencyMultiplier === preset.value
                      ? preset.color + ' ring-2 ring-offset-2 ring-indigo-500'
                      : preset.color + ' opacity-60 hover:opacity-100'}"
                >
                  {preset.label}
                </button>
              {/each}
            </div>
          </div>

          <!-- Required Level -->
          <div>
            <label for="edit-requiredLevel" class="block text-sm font-medium text-slate-700 mb-1">
              Required Level
            </label>
            <div class="flex items-center gap-4">
              <input
                type="range"
                id="edit-requiredLevel"
                bind:value={requiredLevel}
                disabled={!canEdit}
                min="1"
                max="5"
                class="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer disabled:opacity-50"
              />
              <div class="flex items-center gap-1 px-3 py-1.5 bg-amber-100 rounded-lg">
                <Sparkles size={14} class="text-amber-600" />
                <span class="text-sm font-medium text-amber-700">Level {requiredLevel}+</span>
              </div>
            </div>
          </div>

          <!-- Deadline -->
          <div>
            <label for="edit-deadline" class="block text-sm font-medium text-slate-700 mb-1">
              Deadline
            </label>
            <div class="relative">
              <Calendar class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="datetime-local"
                id="edit-deadline"
                bind:value={deadline}
                disabled={!canEdit}
                class="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-slate-50 disabled:text-slate-500"
              />
            </div>
          </div>

          <!-- Delete Confirmation -->
          {#if showDeleteConfirm}
            <div class="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p class="text-sm text-red-700 mb-3">
                Are you sure you want to delete this task? This action cannot be undone.
              </p>
              <div class="flex gap-2">
                <button
                  type="button"
                  on:click={handleDelete}
                  disabled={deleting}
                  class="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {#if deleting}
                    <div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  {/if}
                  Yes, Delete
                </button>
                <button
                  type="button"
                  on:click={() => showDeleteConfirm = false}
                  class="px-4 py-2 bg-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          {/if}

          <!-- Actions -->
          <div class="flex justify-between pt-4 border-t border-slate-200">
            <div>
              {#if canEdit && !showDeleteConfirm}
                <button
                  type="button"
                  on:click={() => showDeleteConfirm = true}
                  class="px-4 py-2 text-red-600 hover:text-red-700 hover:bg-red-50 font-medium rounded-lg transition-colors flex items-center gap-2"
                >
                  <Trash2 size={16} />
                  Delete
                </button>
              {/if}
            </div>
            <div class="flex gap-3">
              <button
                type="button"
                on:click={close}
                class="px-6 py-2.5 text-slate-600 hover:text-slate-900 font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                class="px-6 py-2.5 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {#if submitting}
                  <div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                {/if}
                Save Changes
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  </div>
{/if}

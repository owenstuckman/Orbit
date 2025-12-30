<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { X, Plus, Calendar, DollarSign, Sparkles, AlertCircle } from 'lucide-svelte';
  import { tasks } from '$lib/stores/tasks';
  import { projects } from '$lib/stores/projects';
  import { user } from '$lib/stores/auth';
  import type { Task } from '$lib/types';

  export let show = false;
  export let projectId: string | null = null;

  const dispatch = createEventDispatcher<{ close: void; created: Task }>();

  // Form state
  let title = '';
  let description = '';
  let dollarValue = 50;
  let storyPoints: number | null = null;
  let urgencyMultiplier = 1.0;
  let requiredLevel = 1;
  let deadline = '';
  let selectedProjectId = projectId || '';

  // UI state
  let submitting = false;
  let error = '';

  // Load projects on mount
  $: if (show && $projects.items.length === 0) {
    projects.load({ status: ['active'] });
  }

  // Reset form when modal opens
  $: if (show) {
    resetForm();
  }

  function resetForm() {
    title = '';
    description = '';
    dollarValue = 50;
    storyPoints = null;
    urgencyMultiplier = 1.0;
    requiredLevel = 1;
    deadline = '';
    selectedProjectId = projectId || '';
    error = '';
  }

  function close() {
    show = false;
    dispatch('close');
  }

  async function handleSubmit() {
    if (!title.trim()) {
      error = 'Title is required';
      return;
    }
    if (!selectedProjectId) {
      error = 'Please select a project';
      return;
    }
    if (dollarValue <= 0) {
      error = 'Dollar value must be greater than 0';
      return;
    }

    submitting = true;
    error = '';

    try {
      const taskData: Partial<Task> = {
        title: title.trim(),
        description: description.trim() || null,
        project_id: selectedProjectId,
        org_id: $user?.org_id,
        dollar_value: dollarValue,
        story_points: storyPoints,
        urgency_multiplier: urgencyMultiplier,
        required_level: requiredLevel,
        deadline: deadline ? new Date(deadline).toISOString() : null,
        status: 'open'
      };

      const created = await tasks.create(taskData);

      if (created) {
        dispatch('created', created);
        close();
      } else {
        error = 'Failed to create task';
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to create task';
    } finally {
      submitting = false;
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
</script>

<svelte:window on:keydown={handleKeydown} />

{#if show}
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
              <Plus class="text-indigo-600" size={20} />
            </div>
            <h2 class="text-xl font-bold text-slate-900">Create New Task</h2>
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

          <!-- Title -->
          <div>
            <label for="title" class="block text-sm font-medium text-slate-700 mb-1">
              Task Title <span class="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="title"
              bind:value={title}
              placeholder="Enter task title..."
              class="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              required
            />
          </div>

          <!-- Project Selection -->
          <div>
            <label for="project" class="block text-sm font-medium text-slate-700 mb-1">
              Project <span class="text-red-500">*</span>
            </label>
            <select
              id="project"
              bind:value={selectedProjectId}
              class="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              required
            >
              <option value="">Select a project...</option>
              {#each $projects.items.filter(p => p.status === 'active') as project}
                <option value={project.id}>{project.name}</option>
              {/each}
            </select>
          </div>

          <!-- Description -->
          <div>
            <label for="description" class="block text-sm font-medium text-slate-700 mb-1">
              Description
            </label>
            <textarea
              id="description"
              bind:value={description}
              rows="3"
              placeholder="Describe the task requirements..."
              class="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
            ></textarea>
          </div>

          <!-- Value and Points Row -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <!-- Dollar Value -->
            <div>
              <label for="dollarValue" class="block text-sm font-medium text-slate-700 mb-1">
                Base Value <span class="text-red-500">*</span>
              </label>
              <div class="relative">
                <DollarSign class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="number"
                  id="dollarValue"
                  bind:value={dollarValue}
                  min="1"
                  step="0.01"
                  class="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
              </div>
            </div>

            <!-- Story Points -->
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">
                Story Points (T-Shirt Size)
              </label>
              <div class="flex flex-wrap gap-2">
                {#each storyPointPresets as preset}
                  <button
                    type="button"
                    on:click={() => storyPoints = preset.value}
                    class="px-3 py-1.5 text-sm font-medium rounded-lg transition-colors
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
          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1">
              Urgency Bonus
            </label>
            <div class="flex flex-wrap gap-2">
              {#each urgencyPresets as preset}
                <button
                  type="button"
                  on:click={() => urgencyMultiplier = preset.value}
                  class="px-4 py-2 text-sm font-medium rounded-lg transition-colors
                    {urgencyMultiplier === preset.value
                      ? preset.color + ' ring-2 ring-offset-2 ring-indigo-500'
                      : preset.color + ' opacity-60 hover:opacity-100'}"
                >
                  {preset.label}
                </button>
              {/each}
            </div>
            <p class="mt-1 text-xs text-slate-500">
              Higher urgency means higher payout but faster deadline expectations
            </p>
          </div>

          <!-- Required Level -->
          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1">
              Required Level
            </label>
            <div class="flex items-center gap-4">
              <input
                type="range"
                bind:value={requiredLevel}
                min="1"
                max="5"
                class="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
              />
              <div class="flex items-center gap-1 px-3 py-1.5 bg-amber-100 rounded-lg">
                <Sparkles size={14} class="text-amber-600" />
                <span class="text-sm font-medium text-amber-700">Level {requiredLevel}+</span>
              </div>
            </div>
            <p class="mt-1 text-xs text-slate-500">
              Only employees at this level or higher can accept the task
            </p>
          </div>

          <!-- Deadline -->
          <div>
            <label for="deadline" class="block text-sm font-medium text-slate-700 mb-1">
              Deadline
            </label>
            <div class="relative">
              <Calendar class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="datetime-local"
                id="deadline"
                bind:value={deadline}
                min={new Date().toISOString().slice(0, 16)}
                class="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>

          <!-- Preview Card -->
          <div class="p-4 bg-slate-50 rounded-xl border border-slate-200">
            <h4 class="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">Task Preview</h4>
            <div class="bg-white rounded-lg border border-slate-200 p-4">
              <div class="flex items-start justify-between gap-2">
                <h5 class="font-medium text-slate-900">{title || 'Task title...'}</h5>
                {#if urgencyMultiplier > 1}
                  <span class="px-2 py-0.5 text-xs font-medium rounded bg-amber-100 text-amber-700">
                    +{((urgencyMultiplier - 1) * 100).toFixed(0)}% bonus
                  </span>
                {/if}
              </div>
              <div class="mt-2 flex items-center gap-4 text-sm text-slate-500">
                <span class="text-green-600 font-medium">${(dollarValue * urgencyMultiplier).toFixed(2)}</span>
                {#if requiredLevel > 1}
                  <span class="flex items-center gap-1">
                    <Sparkles size={12} />
                    Level {requiredLevel}+
                  </span>
                {/if}
              </div>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex justify-end gap-3 pt-4 border-t border-slate-200">
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
              Create Task
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
{/if}

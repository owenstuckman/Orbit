<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { X, Filter, Calendar, TrendingUp, FolderOpen, Sparkles, RotateCcw } from 'lucide-svelte';
  import { projects } from '$lib/stores/projects';
  import type { TaskStatus, Project } from '$lib/types';

  export let show = false;

  // Filter values
  export let selectedStatuses: TaskStatus[] = [];
  export let selectedProjectId: string | null = null;
  export let urgencyMin: number = 1.0;
  export let urgencyMax: number = 2.0;
  export let levelMin: number = 1;
  export let levelMax: number = 5;
  export let deadlineFrom: string = '';
  export let deadlineTo: string = '';

  const dispatch = createEventDispatcher<{
    close: void;
    apply: {
      statuses: TaskStatus[];
      projectId: string | null;
      urgencyRange: [number, number];
      levelRange: [number, number];
      deadlineRange: [string, string];
    };
    reset: void;
  }>();

  // Load projects
  $: if (show && $projects.items.length === 0) {
    projects.load();
  }

  const allStatuses: { value: TaskStatus; label: string; color: string }[] = [
    { value: 'open', label: 'Open', color: 'bg-slate-100 text-slate-700' },
    { value: 'assigned', label: 'Assigned', color: 'bg-blue-100 text-blue-700' },
    { value: 'in_progress', label: 'In Progress', color: 'bg-yellow-100 text-yellow-700' },
    { value: 'completed', label: 'Completed', color: 'bg-purple-100 text-purple-700' },
    { value: 'under_review', label: 'Under Review', color: 'bg-orange-100 text-orange-700' },
    { value: 'approved', label: 'Approved', color: 'bg-green-100 text-green-700' },
    { value: 'rejected', label: 'Rejected', color: 'bg-red-100 text-red-700' },
    { value: 'paid', label: 'Paid', color: 'bg-emerald-100 text-emerald-700' }
  ];

  function toggleStatus(status: TaskStatus) {
    if (selectedStatuses.includes(status)) {
      selectedStatuses = selectedStatuses.filter(s => s !== status);
    } else {
      selectedStatuses = [...selectedStatuses, status];
    }
  }

  function close() {
    show = false;
    dispatch('close');
  }

  function applyFilters() {
    dispatch('apply', {
      statuses: selectedStatuses,
      projectId: selectedProjectId,
      urgencyRange: [urgencyMin, urgencyMax],
      levelRange: [levelMin, levelMax],
      deadlineRange: [deadlineFrom, deadlineTo]
    });
    close();
  }

  function resetFilters() {
    selectedStatuses = [];
    selectedProjectId = null;
    urgencyMin = 1.0;
    urgencyMax = 2.0;
    levelMin = 1;
    levelMax = 5;
    deadlineFrom = '';
    deadlineTo = '';
    dispatch('reset');
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      close();
    }
  }

  // Count active filters
  $: activeFilterCount = [
    selectedStatuses.length > 0,
    selectedProjectId !== null,
    urgencyMin > 1.0 || urgencyMax < 2.0,
    levelMin > 1 || levelMax < 5,
    deadlineFrom !== '' || deadlineTo !== ''
  ].filter(Boolean).length;
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

    <!-- Slide-over Panel -->
    <div class="fixed inset-y-0 right-0 flex max-w-full pl-10">
      <div class="w-screen max-w-md">
        <div class="flex h-full flex-col bg-white shadow-xl">
          <!-- Header -->
          <div class="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="p-2 bg-indigo-100 rounded-lg">
                <Filter class="text-indigo-600" size={20} />
              </div>
              <div>
                <h2 class="text-lg font-bold text-slate-900">Filter Tasks</h2>
                {#if activeFilterCount > 0}
                  <p class="text-sm text-slate-500">{activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''} active</p>
                {/if}
              </div>
            </div>
            <button
              on:click={close}
              class="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <!-- Filter Content -->
          <div class="flex-1 overflow-y-auto p-6 space-y-6">
            <!-- Status Filter -->
            <div role="group" aria-labelledby="status-filter-label">
              <span id="status-filter-label" class="block text-sm font-medium text-slate-900 mb-3">Status</span>
              <div class="flex flex-wrap gap-2">
                {#each allStatuses as status}
                  <button
                    type="button"
                    on:click={() => toggleStatus(status.value)}
                    class="px-3 py-1.5 text-sm font-medium rounded-lg transition-all
                      {selectedStatuses.includes(status.value)
                        ? status.color + ' ring-2 ring-offset-1 ring-indigo-500'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}"
                  >
                    {status.label}
                  </button>
                {/each}
              </div>
            </div>

            <!-- Project Filter -->
            <div>
              <label for="filter-project" class="block text-sm font-medium text-slate-900 mb-2">
                <div class="flex items-center gap-2">
                  <FolderOpen size={16} class="text-slate-400" />
                  Project
                </div>
              </label>
              <select
                id="filter-project"
                bind:value={selectedProjectId}
                class="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value={null}>All Projects</option>
                {#each $projects.items as project}
                  <option value={project.id}>{project.name}</option>
                {/each}
              </select>
            </div>

            <!-- Urgency Range -->
            <fieldset>
              <legend class="block text-sm font-medium text-slate-900 mb-2">
                <span class="flex items-center gap-2">
                  <TrendingUp size={16} class="text-slate-400" />
                  Urgency Multiplier
                </span>
              </legend>
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label for="urgency-min" class="text-xs text-slate-500">Min</label>
                  <input
                    type="number"
                    id="urgency-min"
                    bind:value={urgencyMin}
                    min="1"
                    max="2"
                    step="0.1"
                    class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label for="urgency-max" class="text-xs text-slate-500">Max</label>
                  <input
                    type="number"
                    id="urgency-max"
                    bind:value={urgencyMax}
                    min="1"
                    max="2"
                    step="0.1"
                    class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              </div>
              <div class="mt-2 flex justify-between text-xs text-slate-400">
                <span>Normal (1.0x)</span>
                <span>High Priority (2.0x)</span>
              </div>
            </fieldset>

            <!-- Level Range -->
            <fieldset>
              <legend class="block text-sm font-medium text-slate-900 mb-2">
                <span class="flex items-center gap-2">
                  <Sparkles size={16} class="text-slate-400" />
                  Required Level
                </span>
              </legend>
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label for="level-min" class="text-xs text-slate-500">Min Level</label>
                  <input
                    type="number"
                    id="level-min"
                    bind:value={levelMin}
                    min="1"
                    max="5"
                    class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label for="level-max" class="text-xs text-slate-500">Max Level</label>
                  <input
                    type="number"
                    id="level-max"
                    bind:value={levelMax}
                    min="1"
                    max="5"
                    class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              </div>
              <div class="mt-2 flex gap-1">
                {#each [1, 2, 3, 4, 5] as level}
                  <div
                    class="flex-1 h-2 rounded {level >= levelMin && level <= levelMax ? 'bg-indigo-500' : 'bg-slate-200'}"
                  ></div>
                {/each}
              </div>
            </fieldset>

            <!-- Deadline Range -->
            <fieldset>
              <legend class="block text-sm font-medium text-slate-900 mb-2">
                <span class="flex items-center gap-2">
                  <Calendar size={16} class="text-slate-400" />
                  Deadline Range
                </span>
              </legend>
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label for="deadline-from" class="text-xs text-slate-500">From</label>
                  <input
                    type="date"
                    id="deadline-from"
                    bind:value={deadlineFrom}
                    class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label for="deadline-to" class="text-xs text-slate-500">To</label>
                  <input
                    type="date"
                    id="deadline-to"
                    bind:value={deadlineTo}
                    class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              </div>
            </fieldset>

            <!-- Quick Filters -->
            <div role="group" aria-labelledby="quick-filters-label">
              <span id="quick-filters-label" class="block text-sm font-medium text-slate-900 mb-3">Quick Filters</span>
              <div class="space-y-2">
                <button
                  type="button"
                  on:click={() => {
                    selectedStatuses = ['open'];
                    urgencyMin = 1.2;
                    urgencyMax = 2.0;
                  }}
                  class="w-full text-left px-4 py-3 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors"
                >
                  <span class="text-sm font-medium text-amber-800">High Priority Open Tasks</span>
                  <p class="text-xs text-amber-600 mt-0.5">Open tasks with urgency bonus &gt; 20%</p>
                </button>

                <button
                  type="button"
                  on:click={() => {
                    selectedStatuses = ['completed', 'under_review'];
                  }}
                  class="w-full text-left px-4 py-3 bg-orange-50 hover:bg-orange-100 rounded-lg transition-colors"
                >
                  <span class="text-sm font-medium text-orange-800">Pending QC Review</span>
                  <p class="text-xs text-orange-600 mt-0.5">Tasks awaiting quality review</p>
                </button>

                <button
                  type="button"
                  on:click={() => {
                    const today = new Date();
                    const nextWeek = new Date(today);
                    nextWeek.setDate(today.getDate() + 7);
                    deadlineFrom = '';
                    deadlineTo = nextWeek.toISOString().split('T')[0];
                  }}
                  class="w-full text-left px-4 py-3 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                >
                  <span class="text-sm font-medium text-red-800">Due This Week</span>
                  <p class="text-xs text-red-600 mt-0.5">Tasks with deadlines in the next 7 days</p>
                </button>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="border-t border-slate-200 px-6 py-4 flex items-center justify-between bg-slate-50">
            <button
              type="button"
              on:click={resetFilters}
              class="flex items-center gap-2 px-4 py-2 text-slate-600 hover:text-slate-900 font-medium transition-colors"
            >
              <RotateCcw size={16} />
              Reset All
            </button>
            <div class="flex gap-3">
              <button
                type="button"
                on:click={close}
                class="px-4 py-2 text-slate-600 hover:text-slate-900 font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                on:click={applyFilters}
                class="px-6 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

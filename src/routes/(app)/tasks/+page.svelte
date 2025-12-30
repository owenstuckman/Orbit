<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { user, capabilities } from '$lib/stores/auth';
  import { tasks, tasksByStatus, taskCounts } from '$lib/stores/tasks';
  import { projects } from '$lib/stores/projects';
  import { subscribeToTable } from '$lib/services/supabase';
  import { TaskCard, TaskCreateModal, TaskFilters } from '$lib/components/tasks';
  import {
    Plus,
    Filter,
    Search,
    RefreshCw,
    LayoutGrid,
    List,
    Wifi,
    WifiOff,
    TrendingUp,
    Clock,
    CheckCircle
  } from 'lucide-svelte';
  import type { Task, TaskStatus } from '$lib/types';

  // View mode
  let viewMode: 'board' | 'list' = 'board';
  let searchQuery = '';
  let showAvailableOnly = true;

  // Modals
  let showCreateModal = false;
  let showFiltersPanel = false;

  // Real-time connection status
  let isConnected = false;
  let unsubscribeRealtime: (() => void) | null = null;

  // Filter state
  let activeFilters = {
    statuses: [] as TaskStatus[],
    projectId: null as string | null,
    urgencyRange: [1.0, 2.0] as [number, number],
    levelRange: [1, 5] as [number, number],
    deadlineRange: ['', ''] as [string, string]
  };

  // Kanban columns configuration
  const columns: { status: TaskStatus; label: string; color: string; bgColor: string }[] = [
    { status: 'open', label: 'Open', color: 'bg-slate-500', bgColor: 'bg-slate-50' },
    { status: 'assigned', label: 'Assigned', color: 'bg-blue-500', bgColor: 'bg-blue-50' },
    { status: 'in_progress', label: 'In Progress', color: 'bg-yellow-500', bgColor: 'bg-yellow-50' },
    { status: 'completed', label: 'Completed', color: 'bg-purple-500', bgColor: 'bg-purple-50' },
    { status: 'under_review', label: 'Under Review', color: 'bg-orange-500', bgColor: 'bg-orange-50' },
    { status: 'approved', label: 'Approved', color: 'bg-green-500', bgColor: 'bg-green-50' }
  ];

  // Filter columns based on role
  $: visibleColumns = (() => {
    if ($user?.role === 'employee' || $user?.role === 'contractor') {
      if (showAvailableOnly) {
        return columns.filter(c => c.status === 'open');
      }
      return columns.filter(c =>
        ['open', 'assigned', 'in_progress', 'completed', 'approved'].includes(c.status)
      );
    }
    if ($user?.role === 'qc') {
      return columns.filter(c =>
        ['completed', 'under_review', 'approved'].includes(c.status)
      );
    }
    return columns;
  })();

  // Apply all filters to tasks
  $: filteredTasks = (status: TaskStatus) => {
    let items = $tasksByStatus[status] || [];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      items = items.filter(t =>
        t.title.toLowerCase().includes(query) ||
        t.description?.toLowerCase().includes(query)
      );
    }

    // Status filter (if specific statuses are selected)
    if (activeFilters.statuses.length > 0 && !activeFilters.statuses.includes(status)) {
      return [];
    }

    // Project filter
    if (activeFilters.projectId) {
      items = items.filter(t => t.project_id === activeFilters.projectId);
    }

    // Urgency filter
    items = items.filter(t =>
      t.urgency_multiplier >= activeFilters.urgencyRange[0] &&
      t.urgency_multiplier <= activeFilters.urgencyRange[1]
    );

    // Level filter
    items = items.filter(t =>
      t.required_level >= activeFilters.levelRange[0] &&
      t.required_level <= activeFilters.levelRange[1]
    );

    // Deadline filter
    if (activeFilters.deadlineRange[0] || activeFilters.deadlineRange[1]) {
      items = items.filter(t => {
        if (!t.deadline) return false;
        const deadline = new Date(t.deadline);
        if (activeFilters.deadlineRange[0] && deadline < new Date(activeFilters.deadlineRange[0])) {
          return false;
        }
        if (activeFilters.deadlineRange[1] && deadline > new Date(activeFilters.deadlineRange[1])) {
          return false;
        }
        return true;
      });
    }

    // Role-based filtering
    if ($user?.role === 'employee' || $user?.role === 'contractor') {
      if (status === 'open') {
        items = items.filter(t => t.required_level <= ($user?.training_level || 1));
      } else {
        items = items.filter(t => t.assignee_id === $user?.id);
      }
    }

    return items;
  };

  // Count active filters
  $: activeFilterCount = [
    activeFilters.statuses.length > 0,
    activeFilters.projectId !== null,
    activeFilters.urgencyRange[0] > 1.0 || activeFilters.urgencyRange[1] < 2.0,
    activeFilters.levelRange[0] > 1 || activeFilters.levelRange[1] < 5,
    activeFilters.deadlineRange[0] !== '' || activeFilters.deadlineRange[1] !== ''
  ].filter(Boolean).length;

  // Stats for header
  $: stats = {
    total: $tasks.items.length,
    open: $taskCounts.open || 0,
    inProgress: ($taskCounts.assigned || 0) + ($taskCounts.in_progress || 0),
    completed: ($taskCounts.completed || 0) + ($taskCounts.approved || 0)
  };

  onMount(async () => {
    // Load projects for filtering
    projects.load();

    // Load tasks based on role
    if ($user?.role === 'employee' || $user?.role === 'contractor') {
      if (showAvailableOnly) {
        await tasks.loadAvailable($user.training_level);
      } else {
        await tasks.loadByAssignee($user.id);
      }
    } else {
      await tasks.load();
    }

    // Setup real-time subscription
    setupRealtime();
  });

  onDestroy(() => {
    tasks.unsubscribe();
    if (unsubscribeRealtime) {
      unsubscribeRealtime();
    }
  });

  function setupRealtime() {
    // Subscribe to all task changes
    const { unsubscribe } = subscribeToTable<Task>(
      'tasks',
      undefined,
      (payload) => {
        isConnected = true;
        // The store will handle the update
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE' || payload.eventType === 'DELETE') {
          // Refresh tasks to get the updated data with relations
          refreshTasks();
        }
      }
    );

    unsubscribeRealtime = unsubscribe;
    isConnected = true;
  }

  async function refreshTasks() {
    if ($user?.role === 'employee' || $user?.role === 'contractor') {
      if (showAvailableOnly) {
        await tasks.loadAvailable($user.training_level);
      } else {
        await tasks.loadByAssignee($user.id);
      }
    } else {
      await tasks.load();
    }
  }

  async function handleAcceptTask(task: Task) {
    if (!$user) return;
    await tasks.accept(task.id, $user.id);
  }

  function handleTaskClick(task: Task) {
    goto(`/tasks/${task.id}`);
  }

  function handleFiltersApply(event: CustomEvent) {
    activeFilters = event.detail;
  }

  function handleFiltersReset() {
    activeFilters = {
      statuses: [],
      projectId: null,
      urgencyRange: [1.0, 2.0],
      levelRange: [1, 5],
      deadlineRange: ['', '']
    };
  }

  function toggleViewMode() {
    showAvailableOnly = !showAvailableOnly;
    if (showAvailableOnly) {
      tasks.loadAvailable($user?.training_level || 1);
    } else {
      tasks.loadByAssignee($user?.id || '');
    }
  }
</script>

<div class="space-y-6">
  <!-- Header with Stats -->
  <div class="bg-white rounded-xl border border-slate-200 p-6">
    <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
      <div>
        <div class="flex items-center gap-3">
          <h1 class="text-2xl font-bold text-slate-900">Tasks</h1>
          <!-- Real-time indicator -->
          <div class="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium
            {isConnected ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}">
            {#if isConnected}
              <Wifi size={12} />
              <span>Live</span>
            {:else}
              <WifiOff size={12} />
              <span>Offline</span>
            {/if}
          </div>
        </div>
        <p class="mt-1 text-slate-600">
          {#if $user?.role === 'employee' || $user?.role === 'contractor'}
            {showAvailableOnly ? 'Available tasks for your level' : 'Your assigned tasks'}
          {:else if $user?.role === 'qc'}
            Tasks pending quality review
          {:else}
            Manage and track all tasks
          {/if}
        </p>
      </div>

      <!-- Quick Stats -->
      <div class="flex gap-6">
        <div class="text-center">
          <div class="text-2xl font-bold text-slate-900">{stats.open}</div>
          <div class="text-xs text-slate-500 flex items-center gap-1 justify-center">
            <Clock size={12} />
            Open
          </div>
        </div>
        <div class="text-center">
          <div class="text-2xl font-bold text-indigo-600">{stats.inProgress}</div>
          <div class="text-xs text-slate-500 flex items-center gap-1 justify-center">
            <TrendingUp size={12} />
            In Progress
          </div>
        </div>
        <div class="text-center">
          <div class="text-2xl font-bold text-green-600">{stats.completed}</div>
          <div class="text-xs text-slate-500 flex items-center gap-1 justify-center">
            <CheckCircle size={12} />
            Completed
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Controls -->
  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
    <div class="flex items-center gap-3">
      <!-- Search -->
      <div class="relative">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
        <input
          type="text"
          placeholder="Search tasks..."
          bind:value={searchQuery}
          class="pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent w-64"
        />
      </div>

      <!-- Filter button -->
      <button
        on:click={() => showFiltersPanel = true}
        class="flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors
          {activeFilterCount > 0 ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}"
      >
        <Filter size={18} />
        Filters
        {#if activeFilterCount > 0}
          <span class="px-1.5 py-0.5 bg-indigo-600 text-white text-xs rounded-full">{activeFilterCount}</span>
        {/if}
      </button>

      <!-- Refresh -->
      <button
        on:click={refreshTasks}
        disabled={$tasks.loading}
        class="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
        title="Refresh tasks"
      >
        <RefreshCw size={18} class={$tasks.loading ? 'animate-spin' : ''} />
      </button>
    </div>

    <div class="flex items-center gap-3">
      <!-- View toggle for employees -->
      {#if $user?.role === 'employee' || $user?.role === 'contractor'}
        <button
          class="px-4 py-2 rounded-lg font-medium transition-colors
            {showAvailableOnly ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}"
          on:click={toggleViewMode}
        >
          {showAvailableOnly ? 'Available' : 'My Tasks'}
        </button>
      {/if}

      <!-- View mode toggle -->
      <div class="flex items-center bg-slate-100 rounded-lg p-1">
        <button
          on:click={() => viewMode = 'board'}
          class="p-2 rounded transition-colors {viewMode === 'board' ? 'bg-white shadow text-indigo-600' : 'text-slate-400 hover:text-slate-600'}"
          title="Board view"
        >
          <LayoutGrid size={18} />
        </button>
        <button
          on:click={() => viewMode = 'list'}
          class="p-2 rounded transition-colors {viewMode === 'list' ? 'bg-white shadow text-indigo-600' : 'text-slate-400 hover:text-slate-600'}"
          title="List view"
        >
          <List size={18} />
        </button>
      </div>

      <!-- Create button for PM -->
      {#if $capabilities.canCreateTasks}
        <button
          class="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          on:click={() => showCreateModal = true}
        >
          <Plus size={18} />
          New Task
        </button>
      {/if}
    </div>
  </div>

  <!-- Loading state -->
  {#if $tasks.loading}
    <div class="flex items-center justify-center py-12">
      <div class="flex flex-col items-center gap-3">
        <div class="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        <p class="text-sm text-slate-500">Loading tasks...</p>
      </div>
    </div>
  {:else if $tasks.error}
    <div class="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
      <p class="text-red-700">{$tasks.error}</p>
      <button
        on:click={refreshTasks}
        class="mt-3 text-red-600 hover:text-red-800 underline text-sm"
      >
        Try again
      </button>
    </div>
  {:else}
    <!-- Board View -->
    {#if viewMode === 'board'}
      <div class="flex gap-4 overflow-x-auto pb-4">
        {#each visibleColumns as column}
          <div class="flex-shrink-0 w-80">
            <!-- Column header -->
            <div class="flex items-center justify-between mb-4 px-2">
              <div class="flex items-center gap-2">
                <span class="w-3 h-3 rounded-full {column.color}"></span>
                <h3 class="font-semibold text-slate-900">{column.label}</h3>
                <span class="px-2 py-0.5 bg-slate-100 rounded-full text-xs font-medium text-slate-600">
                  {filteredTasks(column.status).length}
                </span>
              </div>
            </div>

            <!-- Tasks column -->
            <div class="space-y-3 min-h-[200px] {column.bgColor} rounded-xl p-3">
              {#each filteredTasks(column.status) as task (task.id)}
                <TaskCard
                  {task}
                  showAcceptButton={column.status === 'open' && $capabilities.canAcceptTasks}
                  on:click={() => handleTaskClick(task)}
                  on:accept={() => handleAcceptTask(task)}
                />
              {:else}
                <div class="flex items-center justify-center h-24 text-slate-400 text-sm">
                  No tasks
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <!-- List View -->
      <div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead class="bg-slate-50 border-b border-slate-200">
              <tr>
                <th class="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Task</th>
                <th class="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                <th class="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Value</th>
                <th class="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Deadline</th>
                <th class="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Level</th>
                <th class="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Assignee</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-200">
              {#each visibleColumns.flatMap(c => filteredTasks(c.status)) as task (task.id)}
                <tr
                  class="hover:bg-slate-50 cursor-pointer transition-colors"
                  on:click={() => handleTaskClick(task)}
                >
                  <td class="px-6 py-4">
                    <div class="flex items-center gap-3">
                      {#if task.urgency_multiplier > 1}
                        <span class="w-2 h-2 rounded-full {task.urgency_multiplier > 1.2 ? 'bg-red-500' : 'bg-amber-500'}"></span>
                      {/if}
                      <div>
                        <p class="font-medium text-slate-900">{task.title}</p>
                        {#if task.project}
                          <p class="text-xs text-slate-500">{task.project.name}</p>
                        {/if}
                      </div>
                    </div>
                  </td>
                  <td class="px-6 py-4">
                    <span class="px-2 py-1 text-xs font-medium rounded-full
                      {task.status === 'open' ? 'bg-slate-100 text-slate-700' :
                        task.status === 'assigned' ? 'bg-blue-100 text-blue-700' :
                        task.status === 'in_progress' ? 'bg-yellow-100 text-yellow-700' :
                        task.status === 'completed' ? 'bg-purple-100 text-purple-700' :
                        task.status === 'under_review' ? 'bg-orange-100 text-orange-700' :
                        task.status === 'approved' ? 'bg-green-100 text-green-700' :
                        'bg-slate-100 text-slate-700'}">
                      {task.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td class="px-6 py-4">
                    <span class="font-medium text-green-600">${task.dollar_value.toFixed(2)}</span>
                    {#if task.urgency_multiplier > 1}
                      <span class="text-xs text-amber-600 ml-1">+{((task.urgency_multiplier - 1) * 100).toFixed(0)}%</span>
                    {/if}
                  </td>
                  <td class="px-6 py-4 text-sm text-slate-600">
                    {task.deadline ? new Date(task.deadline).toLocaleDateString() : '—'}
                  </td>
                  <td class="px-6 py-4 text-sm text-slate-600">
                    Level {task.required_level}+
                  </td>
                  <td class="px-6 py-4 text-sm text-slate-600">
                    {task.assignee?.full_name || '—'}
                  </td>
                </tr>
              {:else}
                <tr>
                  <td colspan="6" class="px-6 py-12 text-center text-slate-500">
                    No tasks match your filters
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    {/if}
  {/if}
</div>

<!-- Create Task Modal -->
<TaskCreateModal
  bind:show={showCreateModal}
  on:created={() => refreshTasks()}
/>

<!-- Filters Panel -->
<TaskFilters
  bind:show={showFiltersPanel}
  bind:selectedStatuses={activeFilters.statuses}
  bind:selectedProjectId={activeFilters.projectId}
  bind:urgencyMin={activeFilters.urgencyRange[0]}
  bind:urgencyMax={activeFilters.urgencyRange[1]}
  bind:levelMin={activeFilters.levelRange[0]}
  bind:levelMax={activeFilters.levelRange[1]}
  bind:deadlineFrom={activeFilters.deadlineRange[0]}
  bind:deadlineTo={activeFilters.deadlineRange[1]}
  on:apply={handleFiltersApply}
  on:reset={handleFiltersReset}
/>

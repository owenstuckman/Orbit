<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { user, capabilities, currentOrgRole } from '$lib/stores/auth';
  import { features } from '$lib/stores/featureFlags';
  import { tasks, tasksByStatus, taskCounts } from '$lib/stores/tasks';
  import { projects } from '$lib/stores/projects';
  import { toasts } from '$lib/stores/notifications';
  import { subscribeToTable } from '$lib/services/supabase';
  import { TaskCard, TaskCreateModal, TaskFilters, DraggableTaskList } from '$lib/components/tasks';
  import { tasksApi } from '$lib/services/api';
  import { supabase } from '$lib/services/supabase';
  import ExportButton from '$lib/components/common/ExportButton.svelte';
  import LoadingSpinner from '$lib/components/common/LoadingSpinner.svelte';
  import LoadingSkeleton from '$lib/components/common/LoadingSkeleton.svelte';
  import { exportTasks, type TaskExport } from '$lib/services/export';
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
    CheckCircle,
    Hand,
    Sparkles
  } from 'lucide-svelte';
  import type { Task, TaskStatus } from '$lib/types';
  import KeyboardShortcutsHelp from '$lib/components/common/KeyboardShortcutsHelp.svelte';
  import * as m from '$lib/paraglide/messages.js';

  // View mode
  let viewMode: 'board' | 'list' = 'board';
  let searchQuery = '';
  let showAvailableOnly = true;

  // Modals
  let showCreateModal = false;
  let showFiltersPanel = false;
  let showShortcutsHelp = false;

  // Keyboard navigation state
  let selectedColumnIndex = 0;
  let selectedTaskIndex = -1;
  let searchInputRef: HTMLInputElement;

  // Bulk operations
  let bulkMode = false;
  let selectedTaskIds = new Set<string>();

  function toggleBulkSelect(taskId: string) {
    if (selectedTaskIds.has(taskId)) {
      selectedTaskIds.delete(taskId);
    } else {
      selectedTaskIds.add(taskId);
    }
    selectedTaskIds = selectedTaskIds; // trigger reactivity
  }

  function selectAllInColumn(status: TaskStatus) {
    const colTasks = filteredTasks(status);
    for (const t of colTasks) {
      selectedTaskIds.add(t.id);
    }
    selectedTaskIds = selectedTaskIds;
  }

  function clearBulkSelection() {
    selectedTaskIds = new Set();
    bulkMode = false;
  }

  async function bulkUpdateStatus(newStatus: TaskStatus) {
    if (selectedTaskIds.size === 0) return;
    let success = 0;
    for (const id of selectedTaskIds) {
      try {
        await tasksApi.update(id, { status: newStatus });
        success++;
      } catch { /* skip */ }
    }
    toasts.success(`Updated ${success} task(s) to ${newStatus.replace('_', ' ')}`);
    clearBulkSelection();
    await refreshTasks();
  }

  async function bulkDelete() {
    if (selectedTaskIds.size === 0) return;
    if (!confirm(`Delete ${selectedTaskIds.size} task(s)? This cannot be undone.`)) return;
    let success = 0;
    for (const id of selectedTaskIds) {
      try {
        const { error } = await supabase.from('tasks').delete().eq('id', id);
        if (!error) success++;
      } catch { /* skip */ }
    }
    toasts.success(`Deleted ${success} task(s)`);
    clearBulkSelection();
    await refreshTasks();
  }

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
    if ($currentOrgRole === 'employee' || $currentOrgRole === 'contractor') {
      if (showAvailableOnly) {
        return columns.filter(c => c.status === 'open');
      }
      return columns.filter(c =>
        ['open', 'assigned', 'in_progress', 'completed', 'approved'].includes(c.status)
      );
    }
    if ($currentOrgRole === 'qc') {
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
    if ($currentOrgRole === 'employee' || $currentOrgRole === 'contractor') {
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
    if ($currentOrgRole === 'employee' || $currentOrgRole === 'contractor') {
      if (!$user) return;
      if (showAvailableOnly) {
        await tasks.loadAvailable($user.training_level);
      } else {
        await tasks.loadByAssignee($user.id);
      }
    } else {
      await tasks.load();
    }

    // Setup real-time subscription (gated by feature flag)
    if ($features.realtime_updates) {
      setupRealtime();
    }
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
    if ($currentOrgRole === 'employee' || $currentOrgRole === 'contractor') {
      if (!$user) return;
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
    try {
      const acceptedTask = await tasks.accept(task.id, $user.id);
      if (acceptedTask) {
        toasts.success(`You picked up "${task.title}"! Good luck!`);
        // Optionally navigate to the task
        goto(`/tasks/${task.id}`);
      } else {
        toasts.error('Failed to pick up task. It may have been claimed already.');
      }
    } catch (err) {
      toasts.error(err instanceof Error ? err.message : 'Failed to pick up task');
    }
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

  function handleExport(format: 'csv' | 'pdf' | 'json') {
    const allTasks = visibleColumns.flatMap(c => filteredTasks(c.status));
    const exportData: TaskExport[] = allTasks.map(t => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.urgency_multiplier > 1 ? 'High' : 'Normal',
      assignee: t.assignee?.full_name || 'Unassigned',
      project: t.project?.name || 'No Project',
      base_value: t.dollar_value,
      created_at: t.created_at,
      completed_at: t.completed_at || undefined
    }));
    exportTasks(exportData, format as 'csv' | 'pdf');
  }

  async function handleReorderTasks(event: CustomEvent<{ taskIds: string[]; status: TaskStatus }>) {
    const { taskIds, status } = event.detail;
    const success = await tasksApi.reorderTasks(taskIds, status);
    if (success) {
      // Refresh tasks to get updated sort order
      await refreshTasks();
    }
  }

  // Determine if reordering should be enabled
  $: canReorder = $capabilities.canCreateTasks || $capabilities.canManageProjects;

  // Get currently selected task for keyboard nav
  $: selectedTask = (() => {
    if (selectedTaskIndex < 0 || !visibleColumns[selectedColumnIndex]) return null;
    const colTasks = filteredTasks(visibleColumns[selectedColumnIndex].status);
    return colTasks[selectedTaskIndex] || null;
  })();

  function handleKeyboardNav(e: KeyboardEvent) {
    // Don't handle if user is typing in an input
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      // Allow Escape to blur search input
      if (e.key === 'Escape' && target === searchInputRef) {
        searchInputRef.blur();
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case '?':
        e.preventDefault();
        showShortcutsHelp = !showShortcutsHelp;
        break;
      case '/':
        e.preventDefault();
        searchInputRef?.focus();
        break;
      case 'n':
        if ($capabilities.canCreateTasks) {
          e.preventDefault();
          showCreateModal = true;
        }
        break;
      case 'f':
        e.preventDefault();
        showFiltersPanel = !showFiltersPanel;
        break;
      case 'r':
        e.preventDefault();
        refreshTasks();
        break;
      case 'b':
        e.preventDefault();
        viewMode = viewMode === 'board' ? 'list' : 'board';
        break;
      case 'ArrowRight':
        if (viewMode === 'board') {
          e.preventDefault();
          selectedColumnIndex = Math.min(selectedColumnIndex + 1, visibleColumns.length - 1);
          selectedTaskIndex = 0;
        }
        break;
      case 'ArrowLeft':
        if (viewMode === 'board') {
          e.preventDefault();
          selectedColumnIndex = Math.max(selectedColumnIndex - 1, 0);
          selectedTaskIndex = 0;
        }
        break;
      case 'ArrowDown': {
        e.preventDefault();
        const col = visibleColumns[selectedColumnIndex];
        if (col) {
          const maxIdx = filteredTasks(col.status).length - 1;
          selectedTaskIndex = Math.min(selectedTaskIndex + 1, maxIdx);
        }
        break;
      }
      case 'ArrowUp':
        e.preventDefault();
        selectedTaskIndex = Math.max(selectedTaskIndex - 1, 0);
        break;
      case 'Enter':
        if (selectedTask) {
          e.preventDefault();
          handleTaskClick(selectedTask);
        }
        break;
      case 'a':
        if (selectedTask && $capabilities.canAcceptTasks && selectedTask.status === 'open') {
          e.preventDefault();
          handleAcceptTask(selectedTask);
        }
        break;
      case 'Escape':
        selectedTaskIndex = -1;
        showShortcutsHelp = false;
        break;
    }
  }
</script>

<svelte:window on:keydown={handleKeyboardNav} />

<div class="space-y-6">
  <!-- Header with Stats -->
  <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
    <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
      <div>
        <div class="flex items-center gap-3">
          <h1 class="text-2xl font-bold text-slate-900 dark:text-white">
            {#if ($currentOrgRole === 'employee' || $currentOrgRole === 'contractor') && showAvailableOnly}
              {m.pick_up_tasks()}
            {:else}
              {m.tasks()}
            {/if}
          </h1>
          <!-- Real-time indicator -->
          <div class="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium
            {isConnected ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}">
            {#if isConnected}
              <Wifi size={12} />
              <span>{m.live()}</span>
            {:else}
              <WifiOff size={12} />
              <span>{m.offline()}</span>
            {/if}
          </div>
          <!-- Level indicator for employees -->
          {#if ($currentOrgRole === 'employee' || $currentOrgRole === 'contractor') && $user?.training_level}
            <div class="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
              <Sparkles size={12} />
              <span>{m.level_indicator({ level: String($user.training_level) })}</span>
            </div>
          {/if}
        </div>
        <p class="mt-1 text-slate-600 dark:text-slate-300">
          {#if $currentOrgRole === 'employee' || $currentOrgRole === 'contractor'}
            {#if showAvailableOnly}
              {m.browse_available_tasks()}
            {:else}
              {m.view_assigned_tasks()}
            {/if}
          {:else if $currentOrgRole === 'qc'}
            {m.tasks_pending_review()}
          {:else}
            {m.manage_all_tasks()}
          {/if}
        </p>
      </div>

      <!-- Quick Stats -->
      <div class="flex gap-6">
        <div class="text-center">
          <div class="text-2xl font-bold text-slate-900 dark:text-white">{stats.open}</div>
          <div class="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 justify-center">
            <Clock size={12} />
            {m.open()}
          </div>
        </div>
        <div class="text-center">
          <div class="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{stats.inProgress}</div>
          <div class="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 justify-center">
            <TrendingUp size={12} />
            {m.in_progress()}
          </div>
        </div>
        <div class="text-center">
          <div class="text-2xl font-bold text-green-600 dark:text-green-400">{stats.completed}</div>
          <div class="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 justify-center">
            <CheckCircle size={12} />
            {m.completed()}
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
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={18} />
        <input
          bind:this={searchInputRef}
          type="text"
          placeholder={m.search_tasks_placeholder()}
          bind:value={searchQuery}
          class="pl-10 pr-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent w-64"
        />
      </div>

      <!-- Filter button -->
      <button
        on:click={() => showFiltersPanel = true}
        class="flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors
          {activeFilterCount > 0 ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'}"
      >
        <Filter size={18} />
        {m.filters()}
        {#if activeFilterCount > 0}
          <span class="px-1.5 py-0.5 bg-indigo-600 text-white text-xs rounded-full">{activeFilterCount}</span>
        {/if}
      </button>

      <!-- Refresh -->
      <button
        on:click={refreshTasks}
        disabled={$tasks.loading}
        class="p-2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
        title="Refresh tasks"
      >
        <RefreshCw size={18} class={$tasks.loading ? 'animate-spin' : ''} />
      </button>
    </div>

    <div class="flex items-center gap-3">
      <!-- View toggle for employees -->
      {#if $currentOrgRole === 'employee' || $currentOrgRole === 'contractor'}
        <button
          class="px-4 py-2 rounded-lg font-medium transition-colors
            {showAvailableOnly ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}"
          on:click={toggleViewMode}
        >
          {showAvailableOnly ? m.available() : m.my_tasks()}
        </button>
      {/if}

      <!-- View mode toggle -->
      <div class="flex items-center bg-slate-100 dark:bg-slate-700 rounded-lg p-1">
        <button
          on:click={() => viewMode = 'board'}
          class="p-2 rounded transition-colors {viewMode === 'board' ? 'bg-white dark:bg-slate-600 shadow text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'}"
          title="Board view"
        >
          <LayoutGrid size={18} />
        </button>
        <button
          on:click={() => viewMode = 'list'}
          class="p-2 rounded transition-colors {viewMode === 'list' ? 'bg-white dark:bg-slate-600 shadow text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'}"
          title="List view"
        >
          <List size={18} />
        </button>
      </div>

      <!-- Bulk operations toggle (PM/Admin only) -->
      {#if $capabilities.canCreateTasks}
        <button
          class="px-3 py-2 rounded-lg text-sm font-medium transition-colors
            {bulkMode ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'}"
          on:click={() => { bulkMode = !bulkMode; if (!bulkMode) clearBulkSelection(); }}
          title="Toggle bulk select"
        >
          {bulkMode ? m.bulk_selected({ count: String(selectedTaskIds.size) }) : m.bulk_mode()}
        </button>
      {/if}

      <!-- Export button -->
      <ExportButton onExport={handleExport} disabled={$tasks.items.length === 0} size="sm" />

      <!-- Keyboard shortcuts hint -->
      <button
        on:click={() => showShortcutsHelp = true}
        class="hidden sm:flex items-center gap-1 px-2 py-2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
        title="Keyboard shortcuts (?)"
      >
        <kbd class="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded text-xs font-mono">?</kbd>
      </button>

      <!-- Create button for PM -->
      {#if $capabilities.canCreateTasks}
        <button
          class="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          on:click={() => showCreateModal = true}
        >
          <Plus size={18} />
          {m.new_task()}
        </button>
      {/if}
    </div>
  </div>

  <!-- Bulk Actions Bar -->
  {#if bulkMode && selectedTaskIds.size > 0}
    <div class="flex items-center gap-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg px-4 py-3">
      <span class="text-sm font-medium text-indigo-700 dark:text-indigo-400">{selectedTaskIds.size} selected</span>
      <div class="flex-1" />
      <button
        on:click={() => bulkUpdateStatus('assigned')}
        class="px-3 py-1.5 text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/50"
      >
        Mark Assigned
      </button>
      <button
        on:click={() => bulkUpdateStatus('in_progress')}
        class="px-3 py-1.5 text-xs font-medium bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded-lg hover:bg-yellow-200 dark:hover:bg-yellow-900/50"
      >
        Mark In Progress
      </button>
      <button
        on:click={() => bulkUpdateStatus('approved')}
        class="px-3 py-1.5 text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-lg hover:bg-green-200 dark:hover:bg-green-900/50"
      >
        Approve
      </button>
      <button
        on:click={bulkDelete}
        class="px-3 py-1.5 text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50"
      >
        Delete
      </button>
      <button
        on:click={clearBulkSelection}
        class="px-3 py-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
      >
        Clear
      </button>
    </div>
  {/if}

  <!-- Loading state -->
  {#if $tasks.loading}
    <LoadingSkeleton type="card" rows={6} />
  {:else if $tasks.error}
    <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 text-center">
      <p class="text-red-700 dark:text-red-400">{$tasks.error}</p>
      <button
        on:click={refreshTasks}
        class="mt-3 text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 underline text-sm"
      >
        Try again
      </button>
    </div>
  {:else}
    <!-- Board View -->
    {#if viewMode === 'board'}
      <div class="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 sm:mx-0 sm:px-0 snap-x snap-mandatory sm:snap-none">
        {#each visibleColumns as column, colIdx}
          <div class="flex-shrink-0 w-72 sm:w-80 snap-center">
            <!-- Column header -->
            <div class="flex items-center justify-between mb-4 px-2">
              <div class="flex items-center gap-2">
                <span class="w-3 h-3 rounded-full {column.color}"></span>
                <h3 class="font-semibold text-slate-900 dark:text-white">{column.label}</h3>
                <span class="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 rounded-full text-xs font-medium text-slate-600 dark:text-slate-300">
                  {filteredTasks(column.status).length}
                </span>
              </div>
            </div>

            <!-- Tasks column -->
            <div class="min-h-[200px] {column.bgColor} dark:bg-slate-800/50 rounded-xl p-3 transition-shadow
              {colIdx === selectedColumnIndex && selectedTaskIndex >= 0 ? 'ring-2 ring-indigo-300 dark:ring-indigo-700' : ''}"
            >
              <DraggableTaskList
                tasks={filteredTasks(column.status)}
                status={column.status}
                showAcceptButton={column.status === 'open' && $capabilities.canAcceptTasks}
                {canReorder}
                on:click={(e) => handleTaskClick(e.detail)}
                on:accept={(e) => handleAcceptTask(e.detail)}
                on:reorder={handleReorderTasks}
              />
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <!-- List View -->
      <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead class="bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th class="text-left px-6 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Task</th>
                <th class="text-left px-6 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                <th class="text-left px-6 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Value</th>
                <th class="text-left px-6 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Deadline</th>
                <th class="text-left px-6 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Level</th>
                <th class="text-left px-6 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Assignee</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-200 dark:divide-slate-700">
              {#each visibleColumns.flatMap(c => filteredTasks(c.status)) as task (task.id)}
                <tr
                  class="hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors"
                  on:click={() => handleTaskClick(task)}
                >
                  <td class="px-6 py-4">
                    <div class="flex items-center gap-3">
                      {#if task.urgency_multiplier > 1}
                        <span class="w-2 h-2 rounded-full {task.urgency_multiplier > 1.2 ? 'bg-red-500' : 'bg-amber-500'}"></span>
                      {/if}
                      <div>
                        <p class="font-medium text-slate-900 dark:text-white">{task.title}</p>
                        {#if task.project}
                          <p class="text-xs text-slate-500 dark:text-slate-400">{task.project.name}</p>
                        {/if}
                      </div>
                    </div>
                  </td>
                  <td class="px-6 py-4">
                    <span class="px-2 py-1 text-xs font-medium rounded-full
                      {task.status === 'open' ? 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300' :
                        task.status === 'assigned' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' :
                        task.status === 'in_progress' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' :
                        task.status === 'completed' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400' :
                        task.status === 'under_review' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400' :
                        task.status === 'approved' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                        'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300'}">
                      {task.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td class="px-6 py-4">
                    <span class="font-medium text-green-600 dark:text-green-400">${task.dollar_value.toFixed(2)}</span>
                    {#if task.urgency_multiplier > 1}
                      <span class="text-xs text-amber-600 dark:text-amber-400 ml-1">+{((task.urgency_multiplier - 1) * 100).toFixed(0)}%</span>
                    {/if}
                  </td>
                  <td class="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
                    {task.deadline ? new Date(task.deadline).toLocaleDateString() : '—'}
                  </td>
                  <td class="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
                    Level {task.required_level}+
                  </td>
                  <td class="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
                    {task.assignee?.full_name || '—'}
                  </td>
                </tr>
              {:else}
                <tr>
                  <td colspan="6" class="px-6 py-12 text-center text-slate-500 dark:text-slate-400">
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

<!-- Keyboard Shortcuts Help -->
<KeyboardShortcutsHelp bind:show={showShortcutsHelp} />

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

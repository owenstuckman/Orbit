<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { user, capabilities } from '$lib/stores/auth';
  import { tasks, tasksByStatus, taskCounts } from '$lib/stores/tasks';
  import { formatCurrency, calculateTaskPayout } from '$lib/utils/payout';
  import { 
    Plus, 
    Filter, 
    Search, 
    Clock, 
    DollarSign, 
    User,
    ChevronRight,
    Sparkles,
    AlertCircle
  } from 'lucide-svelte';
  import type { Task, TaskStatus } from '$lib/types';

  // View mode
  let viewMode: 'board' | 'list' = 'board';
  let searchQuery = '';
  let showAvailableOnly = true;

  // For creating new tasks (PM only)
  let showCreateModal = false;

  // Kanban columns configuration
  const columns: { status: TaskStatus; label: string; color: string }[] = [
    { status: 'open', label: 'Open', color: 'bg-slate-100' },
    { status: 'assigned', label: 'Assigned', color: 'bg-blue-100' },
    { status: 'in_progress', label: 'In Progress', color: 'bg-yellow-100' },
    { status: 'completed', label: 'Completed', color: 'bg-purple-100' },
    { status: 'under_review', label: 'Under Review', color: 'bg-orange-100' },
    { status: 'approved', label: 'Approved', color: 'bg-green-100' }
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

  // Filtered tasks based on search
  $: filteredTasks = (status: TaskStatus) => {
    let items = $tasksByStatus[status] || [];
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      items = items.filter(t => 
        t.title.toLowerCase().includes(query) ||
        t.description?.toLowerCase().includes(query)
      );
    }

    // For employees, filter by level
    if ($user?.role === 'employee' || $user?.role === 'contractor') {
      if (status === 'open') {
        items = items.filter(t => t.required_level <= ($user?.training_level || 1));
      } else {
        // Show only their own tasks
        items = items.filter(t => t.assignee_id === $user?.id);
      }
    }

    return items;
  };

  onMount(async () => {
    if ($user?.role === 'employee' || $user?.role === 'contractor') {
      if (showAvailableOnly) {
        await tasks.loadAvailable($user.training_level);
      } else {
        await tasks.loadByAssignee($user.id);
      }
    } else {
      await tasks.load();
    }
  });

  onDestroy(() => {
    tasks.unsubscribe();
  });

  async function handleAcceptTask(task: Task) {
    if (!$user) return;
    await tasks.accept(task.id, $user.id);
  }

  function getTaskCardClasses(task: Task): string {
    let classes = 'bg-white rounded-lg border shadow-sm p-4 cursor-pointer hover:shadow-md transition-shadow';
    
    if (task.urgency_multiplier > 1.2) {
      classes += ' border-l-4 border-l-red-500';
    } else if (task.urgency_multiplier > 1.1) {
      classes += ' border-l-4 border-l-amber-500';
    }
    
    return classes;
  }

  function formatDeadline(deadline: string | null): string {
    if (!deadline) return 'No deadline';
    const date = new Date(deadline);
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    
    if (days < 0) return 'Overdue';
    if (days === 0) return 'Due today';
    if (days === 1) return 'Due tomorrow';
    if (days <= 7) return `${days} days left`;
    return date.toLocaleDateString();
  }
</script>

<div class="space-y-6">
  <!-- Header -->
  <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
    <div>
      <h1 class="text-2xl font-bold text-slate-900">Tasks</h1>
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

      <!-- View toggle for employees -->
      {#if $user?.role === 'employee' || $user?.role === 'contractor'}
        <button
          class="px-4 py-2 rounded-lg font-medium transition-colors
            {showAvailableOnly ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}"
          on:click={() => {
            showAvailableOnly = !showAvailableOnly;
            if (showAvailableOnly) {
              tasks.loadAvailable($user?.training_level || 1);
            } else {
              tasks.loadByAssignee($user?.id || '');
            }
          }}
        >
          {showAvailableOnly ? 'Available' : 'My Tasks'}
        </button>
      {/if}

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
      <div class="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
    </div>
  {:else if $tasks.error}
    <div class="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
      <AlertCircle class="text-red-500" size={20} />
      <p class="text-red-700">{$tasks.error}</p>
    </div>
  {:else}
    <!-- Kanban Board -->
    <div class="flex gap-6 overflow-x-auto pb-4">
      {#each visibleColumns as column}
        <div class="flex-shrink-0 w-80">
          <!-- Column header -->
          <div class="flex items-center justify-between mb-4">
            <div class="flex items-center gap-2">
              <span class="w-3 h-3 rounded-full {column.color}"></span>
              <h3 class="font-semibold text-slate-900">{column.label}</h3>
              <span class="px-2 py-0.5 bg-slate-100 rounded-full text-xs font-medium text-slate-600">
                {filteredTasks(column.status).length}
              </span>
            </div>
          </div>

          <!-- Tasks -->
          <div class="space-y-3">
            {#each filteredTasks(column.status) as task (task.id)}
              <a href="/tasks/{task.id}" class={getTaskCardClasses(task)}>
                <!-- Task header -->
                <div class="flex items-start justify-between gap-2 mb-2">
                  <h4 class="font-medium text-slate-900 line-clamp-2">{task.title}</h4>
                  {#if task.urgency_multiplier > 1}
                    <span class="flex-shrink-0 px-1.5 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded">
                      {(task.urgency_multiplier * 100 - 100).toFixed(0)}% bonus
                    </span>
                  {/if}
                </div>

                <!-- Task meta -->
                <div class="flex items-center gap-4 text-sm text-slate-500">
                  <div class="flex items-center gap-1">
                    <DollarSign size={14} />
                    <span>
                      {formatCurrency(
                        $user?.r != null 
                          ? calculateTaskPayout(task.dollar_value, $user.r, task.urgency_multiplier)
                          : task.dollar_value
                      )}
                    </span>
                  </div>
                  {#if task.deadline}
                    <div class="flex items-center gap-1">
                      <Clock size={14} />
                      <span class:text-red-500={new Date(task.deadline) < new Date()}>
                        {formatDeadline(task.deadline)}
                      </span>
                    </div>
                  {/if}
                </div>

                <!-- Level requirement -->
                {#if task.required_level > 1}
                  <div class="mt-2 flex items-center gap-1 text-xs text-slate-400">
                    <Sparkles size={12} />
                    Level {task.required_level} required
                  </div>
                {/if}

                <!-- Assignee (for non-open tasks) -->
                {#if task.assignee && column.status !== 'open'}
                  <div class="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2">
                    <div class="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center">
                      <User size={12} class="text-indigo-600" />
                    </div>
                    <span class="text-sm text-slate-600">{task.assignee.full_name || 'Unassigned'}</span>
                  </div>
                {/if}

                <!-- Accept button for open tasks -->
                {#if column.status === 'open' && $capabilities.canAcceptTasks}
                  <button
                    class="mt-3 w-full py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                    on:click|preventDefault|stopPropagation={() => handleAcceptTask(task)}
                  >
                    Accept Task
                  </button>
                {/if}
              </a>
            {:else}
              <div class="bg-slate-50 rounded-lg border-2 border-dashed border-slate-200 p-6 text-center">
                <p class="text-slate-500 text-sm">No tasks</p>
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- Create Task Modal (placeholder) -->
{#if showCreateModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center">
    <button 
      class="absolute inset-0 bg-black/50" 
      on:click={() => showCreateModal = false}
      aria-label="Close modal"
    />
    <div class="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6">
      <h2 class="text-xl font-bold text-slate-900 mb-4">Create New Task</h2>
      <p class="text-slate-600">Task creation form would go here...</p>
      <div class="mt-6 flex justify-end gap-3">
        <button
          class="px-4 py-2 text-slate-600 hover:text-slate-900"
          on:click={() => showCreateModal = false}
        >
          Cancel
        </button>
        <button
          class="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
        >
          Create Task
        </button>
      </div>
    </div>
  </div>
{/if}

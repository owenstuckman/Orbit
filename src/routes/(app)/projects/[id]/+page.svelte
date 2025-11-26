<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { user, capabilities } from '$lib/stores/auth';
  import { projectsApi, tasksApi } from '$lib/services/api';
  import type { Project, Task } from '$lib/types';
  import { 
    ArrowLeft, 
    Calendar, 
    DollarSign, 
    Users,
    Clock,
    AlertTriangle,
    CheckCircle,
    XCircle,
    Plus,
    BarChart3,
    TrendingUp,
    Target,
    FileText
  } from 'lucide-svelte';

  let project: Project | null = null;
  let tasks: Task[] = [];
  let loading = true;
  let error = '';
  let pickingUp = false;
  let showCreateTask = false;

  // New task form
  let newTask = {
    title: '',
    description: '',
    dollar_value: 100,
    required_level: 1,
    deadline: ''
  };
  let creatingTask = false;

  $: projectId = $page.params.id;
  $: isPM = project?.pm_id === $user?.id;
  $: canPickUp = $capabilities.canManageProjects && project?.status === 'pending_pm';
  $: canCreateTasks = isPM || $capabilities.canCreateTasks;
  $: budgetUsed = project ? (project.spent / project.total_value) * 100 : 0;
  $: budgetColor = budgetUsed > 90 ? 'red' : budgetUsed > 70 ? 'amber' : 'green';

  onMount(async () => {
    await loadProject();
  });

  async function loadProject() {
    loading = true;
    error = '';
    try {
      project = await projectsApi.getById(projectId);
      if (project) {
        tasks = await tasksApi.listByProject(projectId);
      } else {
        error = 'Project not found';
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load project';
    } finally {
      loading = false;
    }
  }

  async function pickUpProject() {
    if (!project || !$user) return;
    
    pickingUp = true;
    try {
      const updated = await projectsApi.assignPM(project.id, $user.id);
      if (updated) {
        project = { ...project, ...updated };
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to pick up project';
    } finally {
      pickingUp = false;
    }
  }

  async function createTask() {
    if (!project || !$user) return;
    
    creatingTask = true;
    try {
      const task = await tasksApi.create({
        org_id: $user.org_id,
        project_id: project.id,
        title: newTask.title,
        description: newTask.description,
        dollar_value: newTask.dollar_value,
        required_level: newTask.required_level,
        deadline: newTask.deadline || null,
        status: 'open',
        urgency_multiplier: 1
      });
      
      if (task) {
        tasks = [...tasks, task];
        showCreateTask = false;
        newTask = { title: '', description: '', dollar_value: 100, required_level: 1, deadline: '' };
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to create task';
    } finally {
      creatingTask = false;
    }
  }

  function getStatusBadge(status: string) {
    const badges: Record<string, { bg: string; text: string; label: string }> = {
      draft: { bg: 'bg-slate-100', text: 'text-slate-800', label: 'Draft' },
      pending_pm: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Awaiting PM' },
      active: { bg: 'bg-green-100', text: 'text-green-800', label: 'Active' },
      completed: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Completed' },
      cancelled: { bg: 'bg-red-100', text: 'text-red-800', label: 'Cancelled' }
    };
    return badges[status] || { bg: 'bg-gray-100', text: 'text-gray-800', label: status };
  }

  function getTaskStatusBadge(status: string) {
    const badges: Record<string, { bg: string; text: string }> = {
      open: { bg: 'bg-blue-100', text: 'text-blue-800' },
      assigned: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
      in_progress: { bg: 'bg-purple-100', text: 'text-purple-800' },
      completed: { bg: 'bg-indigo-100', text: 'text-indigo-800' },
      under_review: { bg: 'bg-orange-100', text: 'text-orange-800' },
      approved: { bg: 'bg-green-100', text: 'text-green-800' },
      rejected: { bg: 'bg-red-100', text: 'text-red-800' },
      paid: { bg: 'bg-emerald-100', text: 'text-emerald-800' }
    };
    return badges[status] || { bg: 'bg-gray-100', text: 'text-gray-800' };
  }

  function formatDate(date: string | null) {
    if (!date) return 'Not set';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  function formatCurrency(amount: number) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  }

  $: taskStats = {
    total: tasks.length,
    open: tasks.filter(t => t.status === 'open').length,
    inProgress: tasks.filter(t => ['assigned', 'in_progress'].includes(t.status)).length,
    completed: tasks.filter(t => ['completed', 'under_review', 'approved', 'paid'].includes(t.status)).length
  };
</script>

<svelte:head>
  <title>{project?.name || 'Project'} - Orbit</title>
</svelte:head>

<div class="max-w-6xl mx-auto">
  <!-- Back button -->
  <a 
    href="/projects" 
    class="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-6 transition-colors"
  >
    <ArrowLeft size={18} />
    Back to projects
  </a>

  {#if loading}
    <div class="flex items-center justify-center py-20">
      <div class="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
    </div>
  {:else if error}
    <div class="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
      <XCircle class="mx-auto text-red-500 mb-2" size={32} />
      <p class="text-red-800">{error}</p>
      <button 
        class="mt-4 text-red-600 hover:text-red-800 underline"
        on:click={loadProject}
      >
        Try again
      </button>
    </div>
  {:else if project}
    <!-- Header -->
    <div class="bg-white rounded-xl border border-slate-200 p-6 mb-6">
      <div class="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <div class="flex items-center gap-3 mb-2">
            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium {getStatusBadge(project.status).bg} {getStatusBadge(project.status).text}">
              {getStatusBadge(project.status).label}
            </span>
            {#if project.pm_bonus > 0}
              <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                <TrendingUp size={12} />
                Bonus available
              </span>
            {/if}
          </div>
          <h1 class="text-2xl font-bold text-slate-900">{project.name}</h1>
          {#if project.description}
            <p class="text-slate-600 mt-2">{project.description}</p>
          {/if}
        </div>

        <div class="flex flex-wrap gap-3">
          {#if canPickUp}
            <button
              on:click={pickUpProject}
              disabled={pickingUp}
              class="px-6 py-2.5 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {#if pickingUp}
                <div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              {/if}
              Pick Up Project
            </button>
          {/if}

          {#if canCreateTasks && project.status === 'active'}
            <button
              on:click={() => showCreateTask = true}
              class="px-6 py-2.5 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
            >
              <Plus size={18} />
              Add Task
            </button>
          {/if}
        </div>
      </div>
    </div>

    <!-- Stats grid -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <div class="bg-white rounded-xl border border-slate-200 p-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
            <DollarSign class="text-green-600" size={20} />
          </div>
          <div>
            <p class="text-xs text-slate-500 uppercase tracking-wider">Budget</p>
            <p class="text-xl font-bold text-slate-900">{formatCurrency(project.total_value)}</p>
          </div>
        </div>
      </div>

      <div class="bg-white rounded-xl border border-slate-200 p-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-{budgetColor}-100 rounded-lg flex items-center justify-center">
            <BarChart3 class="text-{budgetColor}-600" size={20} />
          </div>
          <div>
            <p class="text-xs text-slate-500 uppercase tracking-wider">Spent</p>
            <p class="text-xl font-bold text-slate-900">{formatCurrency(project.spent)}</p>
          </div>
        </div>
      </div>

      <div class="bg-white rounded-xl border border-slate-200 p-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
            <Target class="text-blue-600" size={20} />
          </div>
          <div>
            <p class="text-xs text-slate-500 uppercase tracking-wider">Tasks</p>
            <p class="text-xl font-bold text-slate-900">{taskStats.completed}/{taskStats.total}</p>
          </div>
        </div>
      </div>

      <div class="bg-white rounded-xl border border-slate-200 p-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
            <Clock class="text-purple-600" size={20} />
          </div>
          <div>
            <p class="text-xs text-slate-500 uppercase tracking-wider">Days Left</p>
            <p class="text-xl font-bold text-slate-900 {project.days_left <= 7 ? 'text-red-600' : ''}">
              {project.days_left > 0 ? project.days_left : 'Overdue'}
            </p>
          </div>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Tasks list -->
      <div class="lg:col-span-2">
        <div class="bg-white rounded-xl border border-slate-200">
          <div class="p-4 border-b border-slate-200 flex items-center justify-between">
            <h2 class="text-lg font-semibold text-slate-900">Tasks</h2>
            <div class="flex items-center gap-2 text-sm text-slate-500">
              <span class="flex items-center gap-1">
                <span class="w-2 h-2 rounded-full bg-blue-500"></span>
                {taskStats.open} open
              </span>
              <span class="flex items-center gap-1">
                <span class="w-2 h-2 rounded-full bg-purple-500"></span>
                {taskStats.inProgress} in progress
              </span>
              <span class="flex items-center gap-1">
                <span class="w-2 h-2 rounded-full bg-green-500"></span>
                {taskStats.completed} done
              </span>
            </div>
          </div>

          {#if tasks.length === 0}
            <div class="p-8 text-center">
              <FileText class="mx-auto text-slate-300 mb-3" size={48} />
              <p class="text-slate-500">No tasks yet</p>
              {#if canCreateTasks}
                <button
                  on:click={() => showCreateTask = true}
                  class="mt-4 text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  Create the first task
                </button>
              {/if}
            </div>
          {:else}
            <div class="divide-y divide-slate-100">
              {#each tasks as task}
                <a 
                  href="/tasks/{task.id}" 
                  class="block p-4 hover:bg-slate-50 transition-colors"
                >
                  <div class="flex items-start justify-between">
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2 mb-1">
                        <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium {getTaskStatusBadge(task.status).bg} {getTaskStatusBadge(task.status).text}">
                          {task.status.replace('_', ' ')}
                        </span>
                        {#if task.urgency_multiplier > 1}
                          <span class="text-xs text-amber-600 font-medium">
                            {task.urgency_multiplier.toFixed(1)}x
                          </span>
                        {/if}
                      </div>
                      <h3 class="font-medium text-slate-900 truncate">{task.title}</h3>
                      {#if task.assignee}
                        <p class="text-sm text-slate-500 mt-1">
                          Assigned to {task.assignee.full_name}
                        </p>
                      {/if}
                    </div>
                    <div class="text-right ml-4">
                      <p class="font-semibold text-green-600">${task.dollar_value}</p>
                      {#if task.deadline}
                        <p class="text-xs text-slate-400 mt-1">
                          {formatDate(task.deadline)}
                        </p>
                      {/if}
                    </div>
                  </div>
                </a>
              {/each}
            </div>
          {/if}
        </div>
      </div>

      <!-- Sidebar -->
      <div class="space-y-6">
        <!-- Budget breakdown -->
        <div class="bg-white rounded-xl border border-slate-200 p-6">
          <h3 class="text-sm font-semibold text-slate-900 uppercase tracking-wider mb-4">Budget Usage</h3>
          
          <div class="mb-4">
            <div class="flex justify-between text-sm mb-2">
              <span class="text-slate-600">Used</span>
              <span class="font-medium text-slate-900">{budgetUsed.toFixed(1)}%</span>
            </div>
            <div class="w-full bg-slate-200 rounded-full h-3">
              <div 
                class="h-3 rounded-full transition-all duration-500 {budgetUsed > 100 ? 'bg-red-500' : budgetUsed > 90 ? 'bg-red-500' : budgetUsed > 70 ? 'bg-amber-500' : 'bg-green-500'}"
                style="width: {Math.min(budgetUsed, 100)}%"
              ></div>
            </div>
          </div>

          <dl class="space-y-3 text-sm">
            <div class="flex justify-between">
              <dt class="text-slate-500">Total budget</dt>
              <dd class="font-medium text-slate-900">{formatCurrency(project.total_value)}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-slate-500">Spent</dt>
              <dd class="font-medium text-slate-900">{formatCurrency(project.spent)}</dd>
            </div>
            <div class="flex justify-between border-t border-slate-100 pt-3">
              <dt class="text-slate-500">Remaining</dt>
              <dd class="font-medium {project.total_value - project.spent < 0 ? 'text-red-600' : 'text-green-600'}">
                {formatCurrency(project.total_value - project.spent)}
              </dd>
            </div>
          </dl>

          {#if project.total_value - project.spent < 0}
            <div class="mt-4 p-3 bg-red-50 rounded-lg flex items-center gap-2 text-sm text-red-700">
              <AlertTriangle size={16} />
              <span>Budget overdraft!</span>
            </div>
          {/if}
        </div>

        <!-- Team -->
        <div class="bg-white rounded-xl border border-slate-200 p-6">
          <h3 class="text-sm font-semibold text-slate-900 uppercase tracking-wider mb-4">Team</h3>
          
          <dl class="space-y-4">
            <div>
              <dt class="text-xs text-slate-500 uppercase tracking-wider">Sales</dt>
              <dd class="mt-1 flex items-center gap-2">
                {#if project.sales}
                  <div class="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                    <span class="text-sm font-medium text-green-700">
                      {project.sales.full_name?.charAt(0) || '?'}
                    </span>
                  </div>
                  <span class="text-slate-700">{project.sales.full_name}</span>
                {:else}
                  <span class="text-slate-400">Not assigned</span>
                {/if}
              </dd>
            </div>

            <div>
              <dt class="text-xs text-slate-500 uppercase tracking-wider">Project Manager</dt>
              <dd class="mt-1 flex items-center gap-2">
                {#if project.pm}
                  <div class="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                    <span class="text-sm font-medium text-blue-700">
                      {project.pm.full_name?.charAt(0) || '?'}
                    </span>
                  </div>
                  <span class="text-slate-700">{project.pm.full_name}</span>
                {:else}
                  <span class="text-slate-400">Awaiting PM</span>
                {/if}
              </dd>
            </div>
          </dl>
        </div>

        <!-- Timeline -->
        <div class="bg-white rounded-xl border border-slate-200 p-6">
          <h3 class="text-sm font-semibold text-slate-900 uppercase tracking-wider mb-4">Timeline</h3>
          
          <dl class="space-y-3 text-sm">
            <div class="flex justify-between">
              <dt class="text-slate-500">Created</dt>
              <dd class="text-slate-900">{formatDate(project.created_at)}</dd>
            </div>
            {#if project.picked_up_at}
              <div class="flex justify-between">
                <dt class="text-slate-500">PM assigned</dt>
                <dd class="text-slate-900">{formatDate(project.picked_up_at)}</dd>
              </div>
            {/if}
            <div class="flex justify-between">
              <dt class="text-slate-500">Deadline</dt>
              <dd class="text-slate-900 {project.days_left <= 7 ? 'text-red-600 font-medium' : ''}">
                {formatDate(project.deadline)}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  {/if}
</div>

<!-- Create task modal -->
{#if showCreateTask}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <button 
      class="absolute inset-0 bg-black/50"
      on:click={() => showCreateTask = false}
    ></button>
    
    <div class="relative bg-white rounded-xl shadow-xl max-w-lg w-full p-6">
      <h2 class="text-xl font-bold text-slate-900 mb-6">Create New Task</h2>
      
      <form on:submit|preventDefault={createTask} class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1" for="task-title">
            Title
          </label>
          <input
            id="task-title"
            type="text"
            bind:value={newTask.title}
            placeholder="Task title"
            class="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            required
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1" for="task-desc">
            Description
          </label>
          <textarea
            id="task-desc"
            bind:value={newTask.description}
            rows="3"
            placeholder="Task description..."
            class="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
          ></textarea>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1" for="task-value">
              Value ($)
            </label>
            <input
              id="task-value"
              type="number"
              bind:value={newTask.dollar_value}
              min="1"
              class="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              required
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1" for="task-level">
              Required Level
            </label>
            <input
              id="task-level"
              type="number"
              bind:value={newTask.required_level}
              min="1"
              max="10"
              class="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              required
            />
          </div>
        </div>

        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1" for="task-deadline">
            Deadline (optional)
          </label>
          <input
            id="task-deadline"
            type="datetime-local"
            bind:value={newTask.deadline}
            class="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        <div class="flex justify-end gap-3 pt-4">
          <button
            type="button"
            on:click={() => showCreateTask = false}
            class="px-4 py-2 text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={creatingTask || !newTask.title}
            class="px-6 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {#if creatingTask}
              <div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            {/if}
            Create Task
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

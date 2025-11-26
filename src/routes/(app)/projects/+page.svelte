<script lang="ts">
  import { onMount } from 'svelte';
  import { user, capabilities } from '$lib/stores/auth';
  import { projects, projectsByStatus } from '$lib/stores/projects';
  import { formatCurrency, calculatePMPayout } from '$lib/utils/payout';
  import type { Project } from '$lib/types';
  import {
    FolderKanban,
    Plus,
    Clock,
    DollarSign,
    Users,
    AlertTriangle,
    CheckCircle,
    TrendingUp,
    Calendar,
    ChevronRight
  } from 'lucide-svelte';

  let showCreateModal = false;
  let viewMode: 'all' | 'pending' | 'active' = 'all';

  $: filteredProjects = (() => {
    switch (viewMode) {
      case 'pending':
        return $projectsByStatus.pending_pm;
      case 'active':
        return $projectsByStatus.active;
      default:
        return $projects.items;
    }
  })();

  onMount(async () => {
    if ($user?.role === 'pm') {
      await projects.loadByPM($user.id);
    } else if ($user?.role === 'sales') {
      await projects.loadBySales($user.id);
    } else {
      await projects.load();
    }
    
    projects.subscribeToChanges();
  });

  async function handlePickUpProject(project: Project) {
    if (!$user) return;
    await projects.assignPM(project.id, $user.id);
  }

  function getBudgetStatus(project: Project): { color: string; label: string } {
    const utilization = project.spent / project.total_value;
    
    if (utilization > 1) {
      return { color: 'text-red-600 bg-red-100', label: 'Overdraft' };
    }
    if (utilization > 0.9) {
      return { color: 'text-red-600 bg-red-50', label: 'Critical' };
    }
    if (utilization > 0.7) {
      return { color: 'text-amber-600 bg-amber-50', label: 'Warning' };
    }
    return { color: 'text-green-600 bg-green-50', label: 'Healthy' };
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

  function getStatusColor(status: string): string {
    const colors: Record<string, string> = {
      draft: 'bg-slate-100 text-slate-800',
      pending_pm: 'bg-amber-100 text-amber-800',
      active: 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800'
    };
    return colors[status] || colors.draft;
  }
</script>

<div class="space-y-8">
  <!-- Header -->
  <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
    <div>
      <h1 class="text-2xl font-bold text-slate-900">Projects</h1>
      <p class="mt-1 text-slate-600">
        {#if $user?.role === 'pm'}
          Manage your projects and track budgets
        {:else if $user?.role === 'sales'}
          Track your sold projects
        {:else}
          All organization projects
        {/if}
      </p>
    </div>

    <div class="flex items-center gap-3">
      <!-- View toggle -->
      <div class="flex bg-slate-100 rounded-lg p-1">
        <button
          class="px-4 py-2 text-sm font-medium rounded-md transition-colors
            {viewMode === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}"
          on:click={() => viewMode = 'all'}
        >
          All
        </button>
        {#if $user?.role === 'pm'}
          <button
            class="px-4 py-2 text-sm font-medium rounded-md transition-colors
              {viewMode === 'pending' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}"
            on:click={() => viewMode = 'pending'}
          >
            Available
          </button>
        {/if}
        <button
          class="px-4 py-2 text-sm font-medium rounded-md transition-colors
            {viewMode === 'active' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}"
          on:click={() => viewMode = 'active'}
        >
          Active
        </button>
      </div>

      {#if $capabilities.canCreateProjects}
        <button
          class="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          on:click={() => showCreateModal = true}
        >
          <Plus size={18} />
          New Project
        </button>
      {/if}
    </div>
  </div>

  <!-- Stats for PM -->
  {#if $user?.role === 'pm'}
    <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
      <div class="bg-white rounded-xl border border-slate-200 p-6">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-slate-600">Active Projects</p>
            <p class="text-3xl font-bold text-slate-900 mt-1">{$projectsByStatus.active.length}</p>
          </div>
          <div class="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
            <FolderKanban class="text-blue-600" size={24} />
          </div>
        </div>
      </div>

      <div class="bg-white rounded-xl border border-slate-200 p-6">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-slate-600">Available to Pick Up</p>
            <p class="text-3xl font-bold text-slate-900 mt-1">{$projectsByStatus.pending_pm.length}</p>
          </div>
          <div class="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center">
            <Clock class="text-amber-600" size={24} />
          </div>
        </div>
      </div>

      <div class="bg-white rounded-xl border border-slate-200 p-6">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-slate-600">Total Budget</p>
            <p class="text-3xl font-bold text-slate-900 mt-1">
              {formatCurrency($projectsByStatus.active.reduce((sum, p) => sum + p.total_value, 0))}
            </p>
          </div>
          <div class="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
            <DollarSign class="text-green-600" size={24} />
          </div>
        </div>
      </div>

      <div class="bg-white rounded-xl border border-slate-200 p-6">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-slate-600">At Risk</p>
            <p class="text-3xl font-bold text-slate-900 mt-1">
              {$projectsByStatus.active.filter(p => (p.spent / p.total_value) > 0.9).length}
            </p>
          </div>
          <div class="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center">
            <AlertTriangle class="text-red-600" size={24} />
          </div>
        </div>
      </div>
    </div>
  {/if}

  <!-- Projects List -->
  {#if $projects.loading}
    <div class="flex justify-center py-12">
      <div class="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
    </div>
  {:else if filteredProjects.length === 0}
    <div class="bg-white rounded-xl border border-slate-200 p-12 text-center">
      <FolderKanban class="mx-auto text-slate-300 mb-4" size={48} />
      <p class="text-slate-500">No projects found</p>
      {#if viewMode === 'pending' && $user?.role === 'pm'}
        <p class="text-sm text-slate-400 mt-1">No projects waiting to be picked up</p>
      {/if}
    </div>
  {:else}
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {#each filteredProjects as project}
        {@const budgetStatus = getBudgetStatus(project)}
        {@const utilization = (project.spent / project.total_value) * 100}
        
        <a 
          href="/projects/{project.id}"
          class="bg-white rounded-xl border border-slate-200 p-6 hover:shadow-lg transition-shadow"
        >
          <!-- Header -->
          <div class="flex items-start justify-between mb-4">
            <div>
              <h3 class="font-semibold text-slate-900 text-lg">{project.name}</h3>
              <div class="flex items-center gap-2 mt-1">
                <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium {getStatusColor(project.status)}">
                  {project.status.replace('_', ' ')}
                </span>
                {#if project.deadline}
                  <span class="text-sm text-slate-500 flex items-center gap-1">
                    <Calendar size={14} />
                    {formatDeadline(project.deadline)}
                  </span>
                {/if}
              </div>
            </div>
            <ChevronRight class="text-slate-400" size={20} />
          </div>

          <!-- Budget Progress -->
          <div class="mb-4">
            <div class="flex items-center justify-between mb-2">
              <span class="text-sm text-slate-600">Budget</span>
              <div class="flex items-center gap-2">
                <span class="text-sm font-medium text-slate-900">
                  {formatCurrency(project.spent)} / {formatCurrency(project.total_value)}
                </span>
                <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium {budgetStatus.color}">
                  {budgetStatus.label}
                </span>
              </div>
            </div>
            <div class="w-full bg-slate-100 rounded-full h-2">
              <div 
                class="h-2 rounded-full transition-all
                  {utilization > 100 ? 'bg-red-500' : ''}
                  {utilization > 90 && utilization <= 100 ? 'bg-amber-500' : ''}
                  {utilization <= 90 ? 'bg-green-500' : ''}
                "
                style="width: {Math.min(utilization, 100)}%"
              ></div>
            </div>
          </div>

          <!-- Meta -->
          <div class="flex items-center justify-between text-sm">
            <div class="flex items-center gap-4">
              {#if project.pm}
                <span class="flex items-center gap-1 text-slate-600">
                  <Users size={14} />
                  {project.pm.full_name || 'Unassigned PM'}
                </span>
              {/if}
              {#if project.sales}
                <span class="text-slate-400">
                  Sold by {project.sales.full_name}
                </span>
              {/if}
            </div>
            
            {#if project.status === 'pending_pm' && $user?.role === 'pm'}
              <button
                class="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                on:click|preventDefault|stopPropagation={() => handlePickUpProject(project)}
              >
                Pick Up Project
              </button>
            {/if}
          </div>

          <!-- PM Bonus indicator for pending projects -->
          {#if project.status === 'pending_pm' && project.pm_bonus > 0}
            <div class="mt-4 pt-4 border-t border-slate-100">
              <div class="flex items-center gap-2 text-green-600">
                <TrendingUp size={16} />
                <span class="text-sm font-medium">
                  +{formatCurrency(project.pm_bonus)} pickup bonus available
                </span>
              </div>
            </div>
          {/if}
        </a>
      {/each}
    </div>
  {/if}
</div>

<!-- Create Project Modal (placeholder) -->
{#if showCreateModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center">
    <button 
      class="absolute inset-0 bg-black/50" 
      on:click={() => showCreateModal = false}
      aria-label="Close modal"
    />
    <div class="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6">
      <h2 class="text-xl font-bold text-slate-900 mb-4">Create New Project</h2>
      <p class="text-slate-600">Project creation form would go here...</p>
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
          Create Project
        </button>
      </div>
    </div>
  </div>
{/if}

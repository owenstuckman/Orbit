<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { guestProjectsApi } from '$lib/services/api';
  import {
    Rocket,
    Plus,
    Trash2,
    Edit3,
    DollarSign,
    Clock,
    Tag,
    CheckCircle,
    ArrowRight,
    Sparkles,
    Save,
    LayoutGrid
  } from 'lucide-svelte';
  import type { GuestProject, GuestTask } from '$lib/types';

  let project: GuestProject | null = null;
  let loading = true;
  let saving = false;

  // Form state for new task
  let showTaskForm = false;
  let editingTask: GuestTask | null = null;
  let taskTitle = '';
  let taskDescription = '';
  let taskValue = 50;
  let taskTags: string[] = [];
  let newTag = '';

  // Project name editing
  let editingProjectName = false;
  let projectName = 'My Project';
  let projectDescription = '';

  const tagSuggestions = ['bug', 'feature', 'urgent', 'design', 'backend', 'frontend', 'documentation'];

  onMount(async () => {
    project = await guestProjectsApi.getCurrent();
    if (project) {
      projectName = project.name;
      projectDescription = project.description || '';
    }
    loading = false;
  });

  async function saveProject() {
    saving = true;
    project = await guestProjectsApi.save({
      name: projectName,
      description: projectDescription || undefined
    });
    editingProjectName = false;
    saving = false;
  }

  async function addTask() {
    if (!taskTitle.trim()) return;

    saving = true;
    project = await guestProjectsApi.addTask({
      title: taskTitle.trim(),
      description: taskDescription.trim() || undefined,
      dollar_value: taskValue,
      tags: taskTags,
      status: 'open'
    });

    // Reset form
    taskTitle = '';
    taskDescription = '';
    taskValue = 50;
    taskTags = [];
    showTaskForm = false;
    saving = false;
  }

  async function updateTask() {
    if (!editingTask || !taskTitle.trim()) return;

    saving = true;
    project = await guestProjectsApi.updateTask(editingTask.id, {
      title: taskTitle.trim(),
      description: taskDescription.trim() || undefined,
      dollar_value: taskValue,
      tags: taskTags
    });

    // Reset form
    editingTask = null;
    taskTitle = '';
    taskDescription = '';
    taskValue = 50;
    taskTags = [];
    showTaskForm = false;
    saving = false;
  }

  async function removeTask(taskId: string) {
    saving = true;
    project = await guestProjectsApi.removeTask(taskId);
    saving = false;
  }

  function startEditing(task: GuestTask) {
    editingTask = task;
    taskTitle = task.title;
    taskDescription = task.description || '';
    taskValue = task.dollar_value;
    taskTags = [...task.tags];
    showTaskForm = true;
  }

  function cancelEdit() {
    editingTask = null;
    taskTitle = '';
    taskDescription = '';
    taskValue = 50;
    taskTags = [];
    showTaskForm = false;
  }

  function addTag() {
    if (newTag.trim() && !taskTags.includes(newTag.trim().toLowerCase())) {
      taskTags = [...taskTags, newTag.trim().toLowerCase()];
      newTag = '';
    }
  }

  function removeTag(tag: string) {
    taskTags = taskTags.filter(t => t !== tag);
  }

  function handleTagKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag();
    }
  }

  function signUpToSave() {
    // Store that we have a guest project to import
    localStorage.setItem('orbit_import_pending', 'true');
    goto('/auth/register');
  }

  $: totalValue = project?.tasks.reduce((sum, t) => sum + t.dollar_value, 0) || 0;
  $: taskCount = project?.tasks.length || 0;
</script>

<svelte:head>
  <title>Try Orbit - Free Project Setup</title>
</svelte:head>

<div class="min-h-screen bg-gradient-to-br from-indigo-900 via-slate-900 to-slate-900">
  <!-- Header -->
  <header class="border-b border-white/10">
    <div class="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
      <a href="/" class="flex items-center gap-2">
        <div class="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center">
          <Rocket class="text-white" size={20} />
        </div>
        <span class="text-xl font-bold text-white">Orbit</span>
      </a>
      <div class="flex items-center gap-4">
        <a href="/auth/login" class="text-slate-300 hover:text-white transition-colors">
          Sign In
        </a>
        <button
          on:click={signUpToSave}
          class="px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2"
        >
          <Save size={16} />
          Sign Up to Save
        </button>
      </div>
    </div>
  </header>

  <main class="max-w-6xl mx-auto px-4 py-8">
    {#if loading}
      <div class="flex items-center justify-center py-20">
        <div class="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    {:else}
      <!-- Hero Section -->
      <div class="text-center mb-12">
        <div class="inline-flex items-center gap-2 px-4 py-2 bg-indigo-500/20 rounded-full text-indigo-300 text-sm mb-6">
          <Sparkles size={16} />
          No account required
        </div>
        <h1 class="text-4xl md:text-5xl font-bold text-white mb-4">
          Try Orbit Free
        </h1>
        <p class="text-xl text-slate-400 max-w-2xl mx-auto">
          Set up your project and tasks right now. Sign up later to save your work and unlock all features.
        </p>
      </div>

      <!-- Project Card -->
      <div class="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 overflow-hidden">
        <!-- Project Header -->
        <div class="p-6 border-b border-white/10">
          {#if editingProjectName}
            <div class="space-y-4">
              <input
                type="text"
                bind:value={projectName}
                placeholder="Project name"
                class="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <textarea
                bind:value={projectDescription}
                placeholder="Project description (optional)"
                rows="2"
                class="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              ></textarea>
              <div class="flex gap-2">
                <button
                  on:click={saveProject}
                  disabled={saving}
                  class="px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  on:click={() => editingProjectName = false}
                  class="px-4 py-2 text-slate-300 hover:text-white"
                >
                  Cancel
                </button>
              </div>
            </div>
          {:else}
            <div class="flex items-start justify-between">
              <div>
                <h2 class="text-2xl font-bold text-white flex items-center gap-2">
                  <LayoutGrid size={24} class="text-indigo-400" />
                  {project?.name || projectName}
                </h2>
                {#if project?.description}
                  <p class="mt-1 text-slate-400">{project.description}</p>
                {/if}
              </div>
              <button
                on:click={() => editingProjectName = true}
                class="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              >
                <Edit3 size={18} />
              </button>
            </div>
          {/if}
        </div>

        <!-- Stats -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 p-6 border-b border-white/10 bg-white/5">
          <div class="text-center">
            <div class="text-3xl font-bold text-white">{taskCount}</div>
            <div class="text-sm text-slate-400">Tasks</div>
          </div>
          <div class="text-center">
            <div class="text-3xl font-bold text-green-400">${totalValue.toFixed(0)}</div>
            <div class="text-sm text-slate-400">Total Value</div>
          </div>
          <div class="text-center">
            <div class="text-3xl font-bold text-indigo-400">0</div>
            <div class="text-sm text-slate-400">Completed</div>
          </div>
          <div class="text-center">
            <div class="text-3xl font-bold text-amber-400">0</div>
            <div class="text-sm text-slate-400">In Progress</div>
          </div>
        </div>

        <!-- Tasks List -->
        <div class="p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold text-white">Tasks</h3>
            {#if !showTaskForm}
              <button
                on:click={() => showTaskForm = true}
                class="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors"
              >
                <Plus size={18} />
                Add Task
              </button>
            {/if}
          </div>

          <!-- Task Form -->
          {#if showTaskForm}
            <div class="bg-white/10 rounded-xl p-6 mb-6 border border-white/20">
              <h4 class="text-lg font-medium text-white mb-4">
                {editingTask ? 'Edit Task' : 'New Task'}
              </h4>
              <div class="space-y-4">
                <div>
                  <label for="try-task-title" class="block text-sm font-medium text-slate-300 mb-1">Title *</label>
                  <input
                    type="text"
                    id="try-task-title"
                    bind:value={taskTitle}
                    placeholder="Enter task title"
                    class="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label for="try-task-description" class="block text-sm font-medium text-slate-300 mb-1">Description</label>
                  <textarea
                    id="try-task-description"
                    bind:value={taskDescription}
                    placeholder="Describe the task"
                    rows="2"
                    class="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  ></textarea>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label for="try-task-value" class="block text-sm font-medium text-slate-300 mb-1">Value ($)</label>
                    <div class="relative">
                      <DollarSign class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input
                        type="number"
                        id="try-task-value"
                        bind:value={taskValue}
                        min="1"
                        class="w-full pl-10 pr-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label for="try-task-tag-input" class="block text-sm font-medium text-slate-300 mb-1">Tags</label>
                    <div class="flex flex-wrap gap-2 mb-2">
                      {#each taskTags as tag}
                        <span class="inline-flex items-center gap-1 px-2 py-1 bg-indigo-500/30 text-indigo-300 rounded text-sm">
                          {tag}
                          <button on:click={() => removeTag(tag)} class="hover:text-white">
                            &times;
                          </button>
                        </span>
                      {/each}
                    </div>
                    <input
                      type="text"
                      id="try-task-tag-input"
                      bind:value={newTag}
                      on:keydown={handleTagKeydown}
                      placeholder="Add tag..."
                      class="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    />
                    <div class="flex flex-wrap gap-1 mt-2">
                      {#each tagSuggestions.filter(s => !taskTags.includes(s)) as suggestion}
                        <button
                          on:click={() => { taskTags = [...taskTags, suggestion]; }}
                          class="px-2 py-0.5 text-xs bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white rounded transition-colors"
                        >
                          +{suggestion}
                        </button>
                      {/each}
                    </div>
                  </div>
                </div>

                <div class="flex gap-3 pt-2">
                  <button
                    on:click={editingTask ? updateTask : addTask}
                    disabled={!taskTitle.trim() || saving}
                    class="px-6 py-2.5 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {editingTask ? 'Update Task' : 'Add Task'}
                  </button>
                  <button
                    on:click={cancelEdit}
                    class="px-6 py-2.5 text-slate-300 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          {/if}

          <!-- Task List -->
          {#if project?.tasks && project.tasks.length > 0}
            <div class="space-y-3">
              {#each project.tasks as task (task.id)}
                <div class="group bg-white/5 hover:bg-white/10 rounded-xl p-4 border border-white/10 hover:border-white/20 transition-all">
                  <div class="flex items-start justify-between gap-4">
                    <div class="flex-1">
                      <h4 class="font-medium text-white">{task.title}</h4>
                      {#if task.description}
                        <p class="text-sm text-slate-400 mt-1">{task.description}</p>
                      {/if}
                      {#if task.tags.length > 0}
                        <div class="flex flex-wrap gap-1 mt-2">
                          {#each task.tags as tag}
                            <span class="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 rounded text-xs">
                              {tag}
                            </span>
                          {/each}
                        </div>
                      {/if}
                    </div>
                    <div class="flex items-center gap-3">
                      <span class="text-lg font-semibold text-green-400">${task.dollar_value}</span>
                      <div class="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                        <button
                          on:click={() => startEditing(task)}
                          class="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded transition-colors"
                        >
                          <Edit3 size={16} />
                        </button>
                        <button
                          on:click={() => removeTask(task.id)}
                          class="p-1.5 text-slate-400 hover:text-red-400 hover:bg-white/10 rounded transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          {:else if !showTaskForm}
            <div class="text-center py-12">
              <div class="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
                <Plus size={24} class="text-slate-400" />
              </div>
              <h4 class="text-lg font-medium text-white mb-2">No tasks yet</h4>
              <p class="text-slate-400 mb-4">Add your first task to get started</p>
              <button
                on:click={() => showTaskForm = true}
                class="px-6 py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors inline-flex items-center gap-2"
              >
                <Plus size={18} />
                Add Your First Task
              </button>
            </div>
          {/if}
        </div>
      </div>

      <!-- CTA Section -->
      {#if taskCount > 0}
        <div class="mt-8 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-8 text-center">
          <h3 class="text-2xl font-bold text-white mb-2">Ready to save your project?</h3>
          <p class="text-indigo-100 mb-6">
            Sign up to save your work, invite team members, and unlock all Orbit features.
          </p>
          <button
            on:click={signUpToSave}
            class="px-8 py-3 bg-white text-indigo-600 font-semibold rounded-lg hover:bg-indigo-50 transition-colors inline-flex items-center gap-2"
          >
            Create Account
            <ArrowRight size={18} />
          </button>
        </div>
      {/if}

      <!-- Features Preview -->
      <div class="mt-12 grid md:grid-cols-3 gap-6">
        <div class="bg-white/5 rounded-xl p-6 border border-white/10">
          <div class="w-12 h-12 bg-green-500/20 rounded-lg flex items-center justify-center mb-4">
            <DollarSign size={24} class="text-green-400" />
          </div>
          <h4 class="text-lg font-semibold text-white mb-2">Fair Compensation</h4>
          <p class="text-slate-400">Shapley value-based payouts ensure everyone gets paid fairly for their contributions.</p>
        </div>
        <div class="bg-white/5 rounded-xl p-6 border border-white/10">
          <div class="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center mb-4">
            <CheckCircle size={24} class="text-purple-400" />
          </div>
          <h4 class="text-lg font-semibold text-white mb-2">Quality Control</h4>
          <p class="text-slate-400">AI-powered reviews and peer QC ensure high-quality deliverables every time.</p>
        </div>
        <div class="bg-white/5 rounded-xl p-6 border border-white/10">
          <div class="w-12 h-12 bg-amber-500/20 rounded-lg flex items-center justify-center mb-4">
            <Sparkles size={24} class="text-amber-400" />
          </div>
          <h4 class="text-lg font-semibold text-white mb-2">Gamification</h4>
          <p class="text-slate-400">Level up, earn badges, and unlock new opportunities as you complete tasks.</p>
        </div>
      </div>
    {/if}
  </main>
</div>

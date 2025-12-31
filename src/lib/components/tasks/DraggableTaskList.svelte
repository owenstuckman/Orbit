<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { flip } from 'svelte/animate';
  import { TaskCard } from '$lib/components/tasks';
  import type { Task, TaskStatus } from '$lib/types';

  export let tasks: Task[] = [];
  export let status: TaskStatus;
  export let showAcceptButton = false;
  export let canReorder = true;

  const dispatch = createEventDispatcher<{
    click: Task;
    accept: Task;
    reorder: { taskIds: string[]; status: TaskStatus };
    move: { task: Task; newStatus: TaskStatus };
  }>();

  let draggedTask: Task | null = null;
  let dragOverIndex: number | null = null;

  function handleDragStart(e: DragEvent, task: Task) {
    if (!canReorder) return;
    draggedTask = task;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', task.id);
    }
  }

  function handleDragEnd() {
    draggedTask = null;
    dragOverIndex = null;
  }

  function handleDragOver(e: DragEvent, index: number) {
    if (!canReorder || !draggedTask) return;
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
    dragOverIndex = index;
  }

  function handleDragLeave() {
    dragOverIndex = null;
  }

  function handleDrop(e: DragEvent, dropIndex: number) {
    if (!canReorder || !draggedTask) return;
    e.preventDefault();

    const dragIndex = tasks.findIndex(t => t.id === draggedTask?.id);
    if (dragIndex === -1 || dragIndex === dropIndex) {
      draggedTask = null;
      dragOverIndex = null;
      return;
    }

    // Reorder tasks
    const newTasks = [...tasks];
    const [removed] = newTasks.splice(dragIndex, 1);
    newTasks.splice(dropIndex, 0, removed);

    // Dispatch reorder event with new order
    dispatch('reorder', {
      taskIds: newTasks.map(t => t.id),
      status
    });

    draggedTask = null;
    dragOverIndex = null;
  }

  function handleTaskClick(task: Task) {
    dispatch('click', task);
  }

  function handleTaskAccept(task: Task) {
    dispatch('accept', task);
  }
</script>

<div class="space-y-3 min-h-[100px]" role="list" aria-label="Task list">
  {#each tasks as task, index (task.id)}
    <div
      animate:flip={{ duration: 200 }}
      draggable={canReorder}
      on:dragstart={(e) => handleDragStart(e, task)}
      on:dragend={handleDragEnd}
      on:dragover={(e) => handleDragOver(e, index)}
      on:dragleave={handleDragLeave}
      on:drop={(e) => handleDrop(e, index)}
      role="listitem"
      aria-grabbed={draggedTask?.id === task.id}
      class="relative transition-transform duration-150"
      class:opacity-50={draggedTask?.id === task.id}
      class:cursor-grab={canReorder}
      class:cursor-grabbing={draggedTask?.id === task.id}
    >
      {#if dragOverIndex === index && draggedTask?.id !== task.id}
        <div class="absolute -top-1.5 left-0 right-0 h-1 bg-indigo-500 rounded-full z-10"></div>
      {/if}
      <TaskCard
        {task}
        {showAcceptButton}
        on:click={() => handleTaskClick(task)}
        on:accept={() => handleTaskAccept(task)}
      />
    </div>
  {:else}
    <div class="flex items-center justify-center h-24 text-slate-400 text-sm">
      No tasks
    </div>
  {/each}
</div>

<style>
  [draggable="true"] {
    user-select: none;
    -webkit-user-select: none;
  }
</style>

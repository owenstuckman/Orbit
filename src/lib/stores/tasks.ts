/**
 * @fileoverview Task State Management
 *
 * This module provides Svelte stores for managing task state,
 * including filtering, real-time updates, and derived views.
 *
 * @module stores/tasks
 *
 * Exported Stores:
 * - tasks - Main task list with CRUD operations
 * - tasksByStatus - Tasks grouped by status (for Kanban)
 * - tasksPendingReview - Tasks awaiting QC review
 * - taskCounts - Count of tasks per status
 * - currentTask - Single task detail view
 *
 * Features:
 * - Real-time subscription support via Supabase
 * - Flexible filtering by status, project, assignee
 * - Optimistic updates on task actions
 *
 * @example
 * ```svelte
 * <script>
 *   import { tasks, tasksByStatus } from '$lib/stores/tasks';
 *
 *   onMount(() => {
 *     tasks.load({ projectId: currentProjectId });
 *     tasks.subscribeToProject(currentProjectId);
 *   });
 *
 *   onDestroy(() => tasks.unsubscribe());
 * </script>
 *
 * {#each $tasksByStatus.open as task}
 *   <TaskCard {task} />
 * {/each}
 * ```
 */

import { writable, derived, get } from 'svelte/store';
import type { Task, TaskStatus } from '$lib/types';
import { tasksApi } from '$lib/services/api';
import { subscribeToTable } from '$lib/services/supabase';

// ============================================================================
// Tasks Store - Main Task List
// ============================================================================

/**
 * Tasks store state interface.
 * Tracks items, loading state, errors, and active filters.
 */
interface TasksState {
  items: Task[];
  loading: boolean;
  error: string | null;
  filter: TaskFilter;
}

/**
 * Filter configuration for task queries.
 */
interface TaskFilter {
  /** Filter by task statuses */
  status?: TaskStatus[];
  /** Filter by project ID */
  projectId?: string;
  /** Filter by assigned user ID */
  assigneeId?: string;
  /** Search text (not currently implemented) */
  search?: string;
}

/**
 * Creates the main tasks store with filtering and real-time support.
 * Provides methods for loading, filtering, and manipulating tasks.
 *
 * @returns Tasks store with load, subscribe, accept, submit, create, and update methods
 */
function createTasksStore() {
  const { subscribe, set, update } = writable<TasksState>({
    items: [],
    loading: false,
    error: null,
    filter: {}
  });

  /** Real-time subscription cleanup function */
  let unsubscribe: (() => void) | null = null;

  return {
    subscribe,

    /**
     * Loads tasks with optional filtering.
     * Replaces current items with filtered results.
     * @param filter - Optional filter configuration
     */
    async load(filter?: TaskFilter) {
      update(state => ({ ...state, loading: true, error: null, filter: filter || {} }));

      try {
        const filters: Record<string, unknown> = {};
        const eqFilters: Record<string, unknown> = {};

        if (filter?.projectId) {
          eqFilters.project_id = filter.projectId;
        }
        if (filter?.assigneeId) {
          eqFilters.assignee_id = filter.assigneeId;
        }
        if (Object.keys(eqFilters).length > 0) {
          filters.eq = eqFilters;
        }
        if (filter?.status && filter.status.length > 0) {
          filters.in = { status: filter.status };
        }

        const tasks = await tasksApi.list(filters);
        update(state => ({ ...state, items: tasks, loading: false }));
      } catch (error) {
        update(state => ({ 
          ...state, 
          loading: false, 
          error: error instanceof Error ? error.message : 'Failed to load tasks' 
        }));
      }
    },

    /** Loads tasks for a specific project */
    async loadByProject(projectId: string) {
      await this.load({ projectId });
    },

    /** Loads tasks assigned to a specific user */
    async loadByAssignee(userId: string) {
      await this.load({ assigneeId: userId });
    },

    /**
     * Loads open tasks available for the given user level.
     * Used for the task board showing tasks a user can accept.
     * @param userLevel - User's current level
     */
    async loadAvailable(userLevel: number) {
      update(state => ({ ...state, loading: true, error: null }));
      
      try {
        const tasks = await tasksApi.listAvailable(userLevel);
        update(state => ({ ...state, items: tasks, loading: false }));
      } catch (error) {
        update(state => ({ 
          ...state, 
          loading: false, 
          error: error instanceof Error ? error.message : 'Failed to load tasks' 
        }));
      }
    },

    /**
     * Subscribes to real-time updates for a project's tasks.
     * Automatically handles INSERT, UPDATE, and DELETE events.
     * Only one subscription active at a time - previous is cleaned up.
     *
     * @param projectId - Project to subscribe to
     */
    subscribeToProject(projectId: string) {
      // Clean up existing subscription
      if (unsubscribe) {
        unsubscribe();
      }

      const { unsubscribe: unsub } = subscribeToTable<Task>(
        'tasks',
        { column: 'project_id', value: projectId },
        (payload) => {
          update(state => {
            const items = [...state.items];
            
            if (payload.eventType === 'INSERT') {
              items.push(payload.new);
            } else if (payload.eventType === 'UPDATE') {
              const index = items.findIndex(t => t.id === payload.new.id);
              if (index >= 0) {
                items[index] = payload.new;
              }
            } else if (payload.eventType === 'DELETE') {
              const index = items.findIndex(t => t.id === payload.old.id);
              if (index >= 0) {
                items.splice(index, 1);
              }
            }
            
            return { ...state, items };
          });
        }
      );

      unsubscribe = unsub;
    },

    /** Cleans up real-time subscription */
    unsubscribe() {
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
    },

    /**
     * Accepts a task for a user with optimistic update.
     * @param taskId - Task to accept
     * @param userId - User accepting the task
     * @returns Updated task or null
     */
    async accept(taskId: string, userId: string) {
      const task = await tasksApi.accept(taskId, userId);
      if (task) {
        update(state => ({
          ...state,
          items: state.items.map(t => t.id === taskId ? task : t)
        }));
      }
      return task;
    },

    /**
     * Submits completed work for a task.
     * Triggers AI QC review automatically.
     *
     * @param taskId - Task to submit
     * @param data - Submission data object
     * @param files - Optional array of file URLs
     * @returns Updated task or null
     */
    async submit(taskId: string, data: Record<string, unknown>, files?: string[]) {
      const task = await tasksApi.submit(taskId, data, files);
      if (task) {
        update(state => ({
          ...state,
          items: state.items.map(t => t.id === taskId ? task : t)
        }));
      }
      return task;
    },

    /**
     * Creates a new task and adds to store.
     * @param task - Task data to create
     * @returns Created task or null
     */
    async create(task: Partial<Task>) {
      const created = await tasksApi.create(task);
      if (created) {
        update(state => ({
          ...state,
          items: [...state.items, created]
        }));
      }
      return created;
    },

    /**
     * Updates a task and reflects change in store.
     * @param taskId - Task to update
     * @param updates - Fields to update
     * @returns Updated task or null
     */
    async updateTask(taskId: string, updates: Partial<Task>) {
      const updated = await tasksApi.update(taskId, updates);
      if (updated) {
        update(state => ({
          ...state,
          items: state.items.map(t => t.id === taskId ? updated : t)
        }));
      }
      return updated;
    },

    /** Clears store state and unsubscribes from real-time */
    clear() {
      this.unsubscribe();
      set({ items: [], loading: false, error: null, filter: {} });
    }
  };
}

export const tasks = createTasksStore();

// ============================================================================
// Derived Stores - Computed Task Views
// ============================================================================

/**
 * Tasks grouped by status for Kanban board display.
 * Returns a record with all possible statuses as keys.
 */
export const tasksByStatus = derived(tasks, ($tasks) => {
  const grouped: Record<TaskStatus, Task[]> = {
    open: [],
    assigned: [],
    in_progress: [],
    completed: [],
    under_review: [],
    approved: [],
    rejected: [],
    paid: []
  };

  $tasks.items.forEach(task => {
    if (grouped[task.status]) {
      grouped[task.status].push(task);
    }
  });

  return grouped;
});

/** Tasks pending QC review (completed or under_review status) */
export const tasksPendingReview = derived(tasks, ($tasks) =>
  $tasks.items.filter(t => t.status === 'completed' || t.status === 'under_review')
);

/** Count of tasks per status for badges/summaries */
export const taskCounts = derived(tasksByStatus, ($grouped) => {
  const counts: Record<TaskStatus, number> = {} as Record<TaskStatus, number>;
  for (const [status, items] of Object.entries($grouped)) {
    counts[status as TaskStatus] = items.length;
  }
  return counts;
});

// ============================================================================
// Current Task Store - Single Task Detail View
// ============================================================================

/**
 * State for the current/selected task detail view.
 */
interface CurrentTaskState {
  task: Task | null;
  loading: boolean;
  error: string | null;
}

/**
 * Creates a store for managing single task detail view.
 * Used when viewing/editing a specific task.
 *
 * @returns CurrentTask store with load, update, and clear methods
 */
function createCurrentTaskStore() {
  const { subscribe, set, update } = writable<CurrentTaskState>({
    task: null,
    loading: false,
    error: null
  });

  return {
    subscribe,

    async load(taskId: string) {
      update(state => ({ ...state, loading: true, error: null }));
      
      try {
        const task = await tasksApi.getById(taskId);
        set({ task, loading: false, error: null });
      } catch (error) {
        set({ 
          task: null, 
          loading: false, 
          error: error instanceof Error ? error.message : 'Failed to load task'
        });
      }
    },

    update(updates: Partial<Task>) {
      update(state => {
        if (!state.task) return state;
        return { ...state, task: { ...state.task, ...updates } };
      });
    },

    clear() {
      set({ task: null, loading: false, error: null });
    }
  };
}

export const currentTask = createCurrentTaskStore();

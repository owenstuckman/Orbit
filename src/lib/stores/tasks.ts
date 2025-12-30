import { writable, derived, get } from 'svelte/store';
import type { Task, TaskStatus } from '$lib/types';
import { tasksApi } from '$lib/services/api';
import { subscribeToTable } from '$lib/services/supabase';

// ============================================================================
// Tasks Store
// ============================================================================

interface TasksState {
  items: Task[];
  loading: boolean;
  error: string | null;
  filter: TaskFilter;
}

interface TaskFilter {
  status?: TaskStatus[];
  projectId?: string;
  assigneeId?: string;
  search?: string;
}

function createTasksStore() {
  const { subscribe, set, update } = writable<TasksState>({
    items: [],
    loading: false,
    error: null,
    filter: {}
  });

  let unsubscribe: (() => void) | null = null;

  return {
    subscribe,

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

    async loadByProject(projectId: string) {
      await this.load({ projectId });
    },

    async loadByAssignee(userId: string) {
      await this.load({ assigneeId: userId });
    },

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

    unsubscribe() {
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
    },

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

    clear() {
      this.unsubscribe();
      set({ items: [], loading: false, error: null, filter: {} });
    }
  };
}

export const tasks = createTasksStore();

// ============================================================================
// Derived Stores
// ============================================================================

// Tasks grouped by status (for Kanban board)
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

// Tasks pending QC review
export const tasksPendingReview = derived(tasks, ($tasks) => 
  $tasks.items.filter(t => t.status === 'completed' || t.status === 'under_review')
);

// Task counts by status
export const taskCounts = derived(tasksByStatus, ($grouped) => {
  const counts: Record<TaskStatus, number> = {} as Record<TaskStatus, number>;
  for (const [status, items] of Object.entries($grouped)) {
    counts[status as TaskStatus] = items.length;
  }
  return counts;
});

// ============================================================================
// Current Task Store (for detail view)
// ============================================================================

interface CurrentTaskState {
  task: Task | null;
  loading: boolean;
  error: string | null;
}

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

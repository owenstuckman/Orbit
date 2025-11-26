import { writable, derived } from 'svelte/store';
import type { Project, ProjectStatus } from '$lib/types';
import { projectsApi } from '$lib/services/api';
import { subscribeToTable } from '$lib/services/supabase';

// ============================================================================
// Projects Store
// ============================================================================

interface ProjectsState {
  items: Project[];
  loading: boolean;
  error: string | null;
}

function createProjectsStore() {
  const { subscribe, set, update } = writable<ProjectsState>({
    items: [],
    loading: false,
    error: null
  });

  let unsubscribe: (() => void) | null = null;

  return {
    subscribe,

    async load(filters?: { status?: ProjectStatus[]; pmId?: string; salesId?: string }) {
      update(state => ({ ...state, loading: true, error: null }));

      try {
        const queryFilters: Record<string, unknown> = {};
        
        if (filters?.status && filters.status.length > 0) {
          queryFilters.in = { status: filters.status };
        }
        if (filters?.pmId) {
          queryFilters.eq = { ...queryFilters.eq, pm_id: filters.pmId };
        }
        if (filters?.salesId) {
          queryFilters.eq = { ...queryFilters.eq, sales_id: filters.salesId };
        }

        const projects = await projectsApi.list(queryFilters);
        update(state => ({ ...state, items: projects, loading: false }));
      } catch (error) {
        update(state => ({ 
          ...state, 
          loading: false, 
          error: error instanceof Error ? error.message : 'Failed to load projects' 
        }));
      }
    },

    async loadPendingForPM() {
      // Load projects waiting for a PM to pick them up
      await this.load({ status: ['pending_pm'] });
    },

    async loadByPM(pmId: string) {
      await this.load({ pmId });
    },

    async loadBySales(salesId: string) {
      await this.load({ salesId });
    },

    subscribeToChanges() {
      if (unsubscribe) {
        unsubscribe();
      }

      const { unsubscribe: unsub } = subscribeToTable<Project>(
        'projects',
        undefined,
        (payload) => {
          update(state => {
            const items = [...state.items];
            
            if (payload.eventType === 'INSERT') {
              items.push(payload.new);
            } else if (payload.eventType === 'UPDATE') {
              const index = items.findIndex(p => p.id === payload.new.id);
              if (index >= 0) {
                items[index] = payload.new;
              }
            } else if (payload.eventType === 'DELETE') {
              const index = items.findIndex(p => p.id === payload.old.id);
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

    async create(project: Partial<Project>) {
      const created = await projectsApi.create(project);
      if (created) {
        update(state => ({
          ...state,
          items: [...state.items, created]
        }));
      }
      return created;
    },

    async assignPM(projectId: string, pmId: string) {
      const updated = await projectsApi.assignPM(projectId, pmId);
      if (updated) {
        update(state => ({
          ...state,
          items: state.items.map(p => p.id === projectId ? updated : p)
        }));
      }
      return updated;
    },

    async updateProject(projectId: string, updates: Partial<Project>) {
      const updated = await projectsApi.update(projectId, updates);
      if (updated) {
        update(state => ({
          ...state,
          items: state.items.map(p => p.id === projectId ? updated : p)
        }));
      }
      return updated;
    },

    clear() {
      this.unsubscribe();
      set({ items: [], loading: false, error: null });
    }
  };
}

export const projects = createProjectsStore();

// ============================================================================
// Derived Stores
// ============================================================================

// Projects by status
export const projectsByStatus = derived(projects, ($projects) => {
  const grouped: Record<ProjectStatus, Project[]> = {
    draft: [],
    pending_pm: [],
    active: [],
    completed: [],
    cancelled: []
  };

  $projects.items.forEach(project => {
    if (grouped[project.status]) {
      grouped[project.status].push(project);
    }
  });

  return grouped;
});

// Projects with budget warnings (over 80% spent)
export const projectsWithBudgetWarning = derived(projects, ($projects) =>
  $projects.items.filter(p => {
    if (p.total_value === 0) return false;
    return (p.spent / p.total_value) >= 0.8;
  })
);

// Projects in overdraft
export const projectsInOverdraft = derived(projects, ($projects) =>
  $projects.items.filter(p => p.spent > p.total_value)
);

// ============================================================================
// Current Project Store
// ============================================================================

interface CurrentProjectState {
  project: Project | null;
  loading: boolean;
  error: string | null;
}

function createCurrentProjectStore() {
  const { subscribe, set, update } = writable<CurrentProjectState>({
    project: null,
    loading: false,
    error: null
  });

  return {
    subscribe,

    async load(projectId: string) {
      update(state => ({ ...state, loading: true, error: null }));
      
      try {
        const project = await projectsApi.getById(projectId);
        set({ project, loading: false, error: null });
      } catch (error) {
        set({ 
          project: null, 
          loading: false, 
          error: error instanceof Error ? error.message : 'Failed to load project'
        });
      }
    },

    update(updates: Partial<Project>) {
      update(state => {
        if (!state.project) return state;
        return { ...state, project: { ...state.project, ...updates } };
      });
    },

    clear() {
      set({ project: null, loading: false, error: null });
    }
  };
}

export const currentProject = createCurrentProjectStore();

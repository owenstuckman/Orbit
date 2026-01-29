/**
 * @fileoverview Project State Management
 *
 * This module provides Svelte stores for managing project state,
 * including filtering, real-time updates, and derived views.
 *
 * @module stores/projects
 *
 * Exported Stores:
 * - projects - Main project list with CRUD operations
 * - projectsByStatus - Projects grouped by status
 * - projectsWithBudgetWarning - Projects over 80% budget
 * - projectsInOverdraft - Projects exceeding budget
 * - currentProject - Single project detail view
 *
 * Features:
 * - Real-time subscription for project changes
 * - Budget tracking and warning derivations
 * - PM assignment workflow
 *
 * @example
 * ```svelte
 * <script>
 *   import { projects, projectsWithBudgetWarning } from '$lib/stores/projects';
 *
 *   onMount(() => {
 *     projects.load({ status: ['active'] });
 *     projects.subscribeToChanges();
 *   });
 * </script>
 *
 * {#if $projectsWithBudgetWarning.length > 0}
 *   <BudgetWarningBanner count={$projectsWithBudgetWarning.length} />
 * {/if}
 * ```
 */

import { writable, derived } from 'svelte/store';
import type { Project, ProjectStatus } from '$lib/types';
import { projectsApi } from '$lib/services/api';
import { subscribeToTable } from '$lib/services/supabase';

// ============================================================================
// Projects Store - Main Project List
// ============================================================================

/**
 * Projects store state interface.
 */
interface ProjectsState {
  items: Project[];
  loading: boolean;
  error: string | null;
}

/**
 * Creates the main projects store with filtering and real-time support.
 * Provides methods for loading, filtering, and manipulating projects.
 *
 * @returns Projects store with load, subscribe, create, and update methods
 */
function createProjectsStore() {
  const { subscribe, set, update } = writable<ProjectsState>({
    items: [],
    loading: false,
    error: null
  });

  /** Real-time subscription cleanup function */
  let unsubscribe: (() => void) | null = null;

  return {
    subscribe,

    /**
     * Loads projects with optional filtering.
     * @param filters - Optional filter by status, pmId, or salesId
     */
    async load(filters?: { status?: ProjectStatus[]; pmId?: string; salesId?: string }) {
      update(state => ({ ...state, loading: true, error: null }));

      try {
        const queryFilters: Record<string, unknown> = {};
        const eqFilters: Record<string, unknown> = {};

        if (filters?.status && filters.status.length > 0) {
          queryFilters.in = { status: filters.status };
        }
        if (filters?.pmId) {
          eqFilters.pm_id = filters.pmId;
        }
        if (filters?.salesId) {
          eqFilters.sales_id = filters.salesId;
        }
        if (Object.keys(eqFilters).length > 0) {
          queryFilters.eq = eqFilters;
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

    /** Loads projects waiting for PM assignment */
    async loadPendingForPM() {
      // Load projects waiting for a PM to pick them up
      await this.load({ status: ['pending_pm'] });
    },

    /** Loads projects managed by a specific PM */
    async loadByPM(pmId: string) {
      await this.load({ pmId });
    },

    /** Loads projects created by a specific sales rep */
    async loadBySales(salesId: string) {
      await this.load({ salesId });
    },

    /**
     * Subscribes to real-time project updates.
     * Handles INSERT, UPDATE, DELETE events for all org projects.
     */
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

    /** Cleans up real-time subscription */
    unsubscribe() {
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
    },

    /**
     * Creates a new project and adds to store.
     * @param project - Project data to create
     * @returns Created project or null
     */
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

    /**
     * Assigns a PM to a project (PM pickup workflow).
     * Sets project to active status.
     *
     * @param projectId - Project to assign
     * @param pmId - PM user's UUID
     * @returns Updated project or null
     */
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

    /**
     * Updates project fields and reflects in store.
     * @param projectId - Project to update
     * @param updates - Fields to update
     * @returns Updated project or null
     */
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

    /** Clears store state and unsubscribes from real-time */
    clear() {
      this.unsubscribe();
      set({ items: [], loading: false, error: null });
    }
  };
}

export const projects = createProjectsStore();

// ============================================================================
// Derived Stores - Computed Project Views
// ============================================================================

/**
 * Projects grouped by status.
 * Returns a record with all possible statuses as keys.
 */
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

/**
 * Projects with budget warnings (over 80% spent).
 * Used for PM dashboard alerts.
 */
export const projectsWithBudgetWarning = derived(projects, ($projects) =>
  $projects.items.filter(p => {
    if (p.total_value === 0) return false;
    return (p.spent / p.total_value) >= 0.8;
  })
);

/**
 * Projects in overdraft (spent exceeds budget).
 * Triggers overdraft penalty calculations.
 */
export const projectsInOverdraft = derived(projects, ($projects) =>
  $projects.items.filter(p => p.spent > p.total_value)
);

// ============================================================================
// Current Project Store - Single Project Detail View
// ============================================================================

/**
 * State for the current/selected project detail view.
 */
interface CurrentProjectState {
  project: Project | null;
  loading: boolean;
  error: string | null;
}

/**
 * Creates a store for managing single project detail view.
 * Used when viewing/editing a specific project.
 *
 * @returns CurrentProject store with load, update, and clear methods
 */
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

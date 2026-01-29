/**
 * @fileoverview Authentication and User State Management
 *
 * This module provides Svelte stores for managing authentication state,
 * user profiles, organization context, and role-based capabilities.
 *
 * @module stores/auth
 *
 * Exported Stores:
 * - auth - Authentication session state
 * - user - Current user profile
 * - organization - Current organization
 * - userOrganizations - Multi-org memberships
 * - currentOrgRole - Derived role for current org
 * - capabilities - Derived role permissions
 * - isAuthenticated - Derived auth check
 * - isLoading - Derived loading state
 *
 * @example
 * ```svelte
 * <script>
 *   import { user, capabilities, isAuthenticated } from '$lib/stores/auth';
 *
 *   $: if ($isAuthenticated && $capabilities.canCreateTasks) {
 *     // Show create task button
 *   }
 * </script>
 * ```
 */

import { writable, derived, get } from 'svelte/store';
import type { User, Organization, RoleCapabilities, UserOrgMembership } from '$lib/types';
import { supabase } from '$lib/services/supabase';
import { usersApi, organizationsApi } from '$lib/services/api';

// ============================================================================
// Auth Store - Session Management
// ============================================================================

/**
 * Authentication state interface.
 * Tracks session initialization and loading state.
 */
interface AuthState {
  initialized: boolean;
  session: unknown | null;
  loading: boolean;
}

/**
 * Creates the auth store for session management.
 * Handles Supabase Auth initialization and state changes.
 *
 * @returns Auth store with initialize, setLoading, and signOut methods
 */
function createAuthStore() {
  const { subscribe, set, update } = writable<AuthState>({
    initialized: false,
    session: null,
    loading: true
  });

  return {
    subscribe,

    /**
     * Initializes auth state from Supabase session.
     * Sets up listener for auth state changes (sign in/out, token refresh).
     * Should be called once on app startup.
     */
    async initialize() {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        // If there's an auth error (like invalid refresh token), clear the session
        if (error) {
          console.error('Auth initialization error:', error);
          await supabase.auth.signOut();
          set({ initialized: true, session: null, loading: false });
          return;
        }
        
        set({ initialized: true, session, loading: false });
      } catch (err) {
        console.error('Failed to initialize auth:', err);
        set({ initialized: true, session: null, loading: false });
      }
      
      // Listen for auth changes
      supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
          update(state => ({ ...state, session }));
        }
        // Handle invalid refresh token
        if (event === 'SIGNED_OUT' || (event === 'TOKEN_REFRESHED' && !session)) {
          update(state => ({ ...state, session: null }));
        }
      });
    },

    setLoading(loading: boolean) {
      update(state => ({ ...state, loading }));
    },

    async signOut() {
      await supabase.auth.signOut();
      set({ initialized: true, session: null, loading: false });
    }
  };
}

export const auth = createAuthStore();

// ============================================================================
// User Store - Current User Profile
// ============================================================================

/**
 * Creates the user store for current user profile management.
 * Stores the authenticated user's profile data from the database.
 *
 * @returns User store with load, updateR, and clear methods
 */
function createUserStore() {
  const { subscribe, set, update } = writable<User | null>(null);

  return {
    subscribe,

    /**
     * Loads the current user's profile from the database.
     * Called after successful authentication.
     * @returns Loaded user or null if not found
     */
    async load() {
      const user = await usersApi.getCurrent();
      set(user);
      return user;
    },

    set,

    update,

    /**
     * Updates the user's salary/task ratio (Salary Mixer feature).
     * @param newR - New ratio value (typically 0.5-0.9)
     */
    async updateR(newR: number) {
      const currentUser = get({ subscribe });
      if (!currentUser) return;

      const updated = await usersApi.updateSalaryMix(currentUser.id, newR);
      if (updated) {
        set(updated);
      }
    },

    /** Clears the user store (e.g., on sign out) */
    clear() {
      set(null);
    }
  };
}

export const user = createUserStore();

// ============================================================================
// Organization Store - Current Organization
// ============================================================================

/**
 * Creates the organization store for current org context.
 * Stores the user's active organization data including settings.
 *
 * @returns Organization store with load and clear methods
 */
function createOrgStore() {
  const { subscribe, set } = writable<Organization | null>(null);

  return {
    subscribe,

    /**
     * Loads the current user's active organization.
     * @returns Loaded organization or null
     */
    async load() {
      const org = await organizationsApi.getCurrent();
      set(org);
      return org;
    },

    set,

    /** Clears the organization store */
    clear() {
      set(null);
    }
  };
}

export const organization = createOrgStore();

// ============================================================================
// User Organizations Store (Multi-org Support)
// ============================================================================

/**
 * Creates the user organizations store for multi-org membership.
 * Tracks all organizations a user belongs to with their role in each.
 * Enables organization switching for users in multiple orgs.
 *
 * @returns UserOrgs store with load, switchOrg, and clear methods
 */
function createUserOrgsStore() {
  const { subscribe, set, update } = writable<UserOrgMembership[]>([]);

  return {
    subscribe,

    /**
     * Loads all organization memberships for the current user.
     * @returns Array of memberships with organization details
     */
    async load() {
      const memberships = await usersApi.listUserOrganizations();
      set(memberships);
      return memberships;
    },

    set,

    /** Clears all memberships */
    clear() {
      set([]);
    },

    /**
     * Switches to a different organization.
     * Updates user's active org_id and reloads all related stores
     * to ensure role and permissions are current.
     *
     * @param orgId - Organization UUID to switch to
     * @returns true if switch was successful
     */
    async switchOrg(orgId: string): Promise<boolean> {
      const success = await usersApi.switchOrganization(orgId);
      if (success) {
        // Reload all stores in the correct order
        // 1. User first (to get the new org_id)
        await user.load();
        // 2. Organization (to get the new org data)
        await organization.load();
        // 3. Reload memberships to ensure role is current
        await this.load();
        return true;
      }
      return false;
    }
  };
}

export const userOrganizations = createUserOrgsStore();

// ============================================================================
// Current Organization Role (derived from user_organization_memberships)
// ============================================================================

// Derived store that gets the user's role in their current organization
export const currentOrgRole = derived(
  [user, userOrganizations],
  ([$user, $userOrganizations]): string => {
    if (!$user || !$userOrganizations.length) {
      return $user?.role || 'employee'; // Fallback to user.role or employee
    }

    // Find the membership for the current organization
    const currentMembership = $userOrganizations.find(
      membership => membership.org_id === $user.org_id
    );

    if (currentMembership) {
      return currentMembership.role;
    }

    // Fallback to user.role if no membership found
    return $user.role || 'employee';
  }
);

// ============================================================================
// Role Capabilities Configuration
// ============================================================================

/**
 * Role-based capability matrix defining permissions for each user role.
 *
 * Capability Types:
 * - Boolean: true/false for simple permissions
 * - String: 'all', 'team', 'self', 'own', 'org' for scoped access
 *
 * Roles:
 * - admin: Full access to organization features
 * - sales: Project creation, own payouts/contracts
 * - pm: Task/project management, team visibility
 * - qc: Quality control reviews, task viewing
 * - employee: Task acceptance, own data access
 * - contractor: Same as employee, external workers
 */
const ROLE_CAPABILITIES: Record<string, RoleCapabilities> = {
  admin: {
    canViewTasks: true,
    canCreateTasks: true,
    canAssignTasks: true,
    canAcceptTasks: false,
    canReviewQC: true,
    canViewPayouts: 'all',
    canCreateProjects: true,
    canManageProjects: true,
    canViewContracts: 'all',
    canSignContracts: true,
    canAccessSettings: 'org'
  },
  sales: {
    canViewTasks: false,
    canCreateTasks: false,
    canAssignTasks: false,
    canAcceptTasks: false,
    canReviewQC: false,
    canViewPayouts: 'self',
    canCreateProjects: true,
    canManageProjects: false,
    canViewContracts: 'own',
    canSignContracts: true,
    canAccessSettings: 'own'
  },
  pm: {
    canViewTasks: true,
    canCreateTasks: true,
    canAssignTasks: true,
    canAcceptTasks: false,
    canReviewQC: false,
    canViewPayouts: 'team',
    canCreateProjects: false,
    canManageProjects: true,
    canViewContracts: 'team',
    canSignContracts: true,
    canAccessSettings: 'own'
  },
  qc: {
    canViewTasks: true,
    canCreateTasks: false,
    canAssignTasks: false,
    canAcceptTasks: false,
    canReviewQC: true,
    canViewPayouts: 'self',
    canCreateProjects: false,
    canManageProjects: false,
    canViewContracts: 'own',
    canSignContracts: false,
    canAccessSettings: 'own'
  },
  employee: {
    canViewTasks: true,
    canCreateTasks: false,
    canAssignTasks: false,
    canAcceptTasks: true,
    canReviewQC: false,
    canViewPayouts: 'self',
    canCreateProjects: false,
    canManageProjects: false,
    canViewContracts: 'own',
    canSignContracts: true,
    canAccessSettings: 'own'
  },
  contractor: {
    canViewTasks: true,
    canCreateTasks: false,
    canAssignTasks: false,
    canAcceptTasks: true,
    canReviewQC: false,
    canViewPayouts: 'self',
    canCreateProjects: false,
    canManageProjects: false,
    canViewContracts: 'own',
    canSignContracts: true,
    canAccessSettings: 'own'
  }
};

/**
 * Derived store for current user's role-based capabilities.
 * Uses the org-specific role from currentOrgRole for permission lookup.
 * Returns default restricted capabilities if user is not authenticated.
 */
export const capabilities = derived(
  [user, currentOrgRole],
  ([$user, $currentOrgRole]): RoleCapabilities => {
    if (!$user) {
      return {
        canViewTasks: false,
        canCreateTasks: false,
        canAssignTasks: false,
        canAcceptTasks: false,
        canReviewQC: false,
        canViewPayouts: 'self',
        canCreateProjects: false,
        canManageProjects: false,
        canViewContracts: 'own',
        canSignContracts: false,
        canAccessSettings: 'own'
      };
    }
    // Use the org-specific role for capabilities
    return ROLE_CAPABILITIES[$currentOrgRole] || ROLE_CAPABILITIES.employee;
  }
);

/**
 * Derived store for checking if user is authenticated.
 * True when a valid session exists.
 */
export const isAuthenticated = derived(auth, ($auth) => !!$auth.session);

/**
 * Derived store for combined loading state.
 * True when auth is loading OR when session exists but user profile not yet loaded.
 */
export const isLoading = derived(
  [auth, user],
  ([$auth, $user]) => $auth.loading || ($auth.session && !$user)
);

import { writable, derived, get } from 'svelte/store';
import type { User, Organization, RoleCapabilities, UserOrgMembership } from '$lib/types';
import { supabase } from '$lib/services/supabase';
import { usersApi, organizationsApi } from '$lib/services/api';

// ============================================================================
// Auth Store
// ============================================================================

interface AuthState {
  initialized: boolean;
  session: unknown | null;
  loading: boolean;
}

function createAuthStore() {
  const { subscribe, set, update } = writable<AuthState>({
    initialized: false,
    session: null,
    loading: true
  });

  return {
    subscribe,
    
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
// User Store
// ============================================================================

function createUserStore() {
  const { subscribe, set, update } = writable<User | null>(null);

  return {
    subscribe,
    
    async load() {
      const user = await usersApi.getCurrent();
      set(user);
      return user;
    },

    set,

    update,

    async updateR(newR: number) {
      const currentUser = get({ subscribe });
      if (!currentUser) return;

      const updated = await usersApi.updateSalaryMix(currentUser.id, newR);
      if (updated) {
        set(updated);
      }
    },

    clear() {
      set(null);
    }
  };
}

export const user = createUserStore();

// ============================================================================
// Organization Store
// ============================================================================

function createOrgStore() {
  const { subscribe, set } = writable<Organization | null>(null);

  return {
    subscribe,

    async load() {
      const org = await organizationsApi.getCurrent();
      set(org);
      return org;
    },

    set,

    clear() {
      set(null);
    }
  };
}

export const organization = createOrgStore();

// ============================================================================
// User Organizations Store (for multi-org support)
// ============================================================================

function createUserOrgsStore() {
  const { subscribe, set, update } = writable<UserOrgMembership[]>([]);

  return {
    subscribe,

    async load() {
      const memberships = await usersApi.listUserOrganizations();
      set(memberships);
      return memberships;
    },

    set,

    clear() {
      set([]);
    },

    /**
     * Switch to a different organization
     * Updates the user's active org_id and reloads the organization store
     * Also reloads memberships so the role updates properly
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
// Role Capabilities
// ============================================================================

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

// Derived store for current user's capabilities (based on org-specific role)
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

// Derived store for checking if user is authenticated
export const isAuthenticated = derived(auth, ($auth) => !!$auth.session);

// Derived store for loading state
export const isLoading = derived(
  [auth, user],
  ([$auth, $user]) => $auth.loading || ($auth.session && !$user)
);

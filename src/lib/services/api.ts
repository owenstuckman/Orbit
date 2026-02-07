/**
 * @fileoverview API Service Layer for Orbit Platform
 *
 * This module provides typed API interfaces for all database operations.
 * Each API object corresponds to a database table and provides CRUD operations
 * plus domain-specific methods.
 *
 * @module api
 *
 * API Objects:
 * - usersApi - User management, invitations, org memberships, role management
 * - projectsApi - Project CRUD, PM assignment, bonus calculations
 * - tasksApi - Task lifecycle, assignments, submissions, external work
 * - qcApi - Quality control reviews, Shapley value calculations
 * - contractsApi - Contract generation, e-signatures, PDF management
 * - payoutsApi - Payout tracking, summaries by period
 * - organizationsApi - Organization settings, feature flags
 * - guestProjectsApi - Trial/demo projects for unauthenticated users
 *
 * All operations use Supabase client with RLS (Row Level Security) enforcement.
 * Multi-tenant isolation is handled via org_id foreign keys.
 *
 * @example
 * ```typescript
 * import { usersApi, tasksApi } from '$lib/services/api';
 *
 * // Get current user
 * const user = await usersApi.getCurrent();
 *
 * // List available tasks for user's level
 * const tasks = await tasksApi.listAvailable(user.level);
 * ```
 */

import { supabase, functions } from './supabase';
import type {
  User,
  Project,
  Task,
  QCReview,
  Contract,
  Payout,
  Organization,
  OrganizationSettings,
  FeatureFlags,
  FeatureFlagPreset,
  TaskStatus,
  ProjectStatus,
  UserRole,
  UserInvitation,
  UserOrgMembership,
  ExternalAssignment,
  ExternalAssignmentResult,
  TaskSubmissionData,
  GuestProject,
  GuestTask
} from '$lib/types';
import { getPreset } from '$lib/config/featureFlags';

// ============================================================================
// Query Builder Helpers
// ============================================================================

/**
 * Generic query filter configuration for Supabase queries.
 * Supports common SQL operations mapped to Supabase PostgREST filters.
 *
 * @example
 * ```typescript
 * const filters: QueryFilters = {
 *   eq: { status: 'active', org_id: '123' },
 *   gte: { created_at: '2024-01-01' },
 *   order: { column: 'created_at', ascending: false },
 *   limit: 10
 * };
 * ```
 */
type QueryFilters = {
  /** Equality filters - WHERE column = value */
  eq?: Record<string, unknown>;
  /** IN filters - WHERE column IN (values) */
  in?: Record<string, unknown[]>;
  /** Greater than or equal - WHERE column >= value */
  gte?: Record<string, unknown>;
  /** Less than or equal - WHERE column <= value */
  lte?: Record<string, unknown>;
  /** Case-insensitive LIKE search - WHERE column ILIKE %value% */
  like?: Record<string, string>;
  /** ORDER BY configuration */
  order?: { column: string; ascending?: boolean };
  /** LIMIT clause */
  limit?: number;
  /** OFFSET for pagination (uses range under the hood) */
  offset?: number;
};

/**
 * Applies QueryFilters to a Supabase query builder.
 * Chains filter methods in sequence to build the final query.
 *
 * @param query - Supabase query builder instance
 * @param filters - Optional filter configuration
 * @returns Modified query with filters applied
 */
function applyFilters<T>(query: T, filters?: QueryFilters): T {
  if (!filters) return query;
  
  let q = query as any;
  
  if (filters.eq) {
    Object.entries(filters.eq).forEach(([key, value]) => {
      q = q.eq(key, value);
    });
  }
  if (filters.in) {
    Object.entries(filters.in).forEach(([key, values]) => {
      q = q.in(key, values);
    });
  }
  if (filters.gte) {
    Object.entries(filters.gte).forEach(([key, value]) => {
      q = q.gte(key, value);
    });
  }
  if (filters.lte) {
    Object.entries(filters.lte).forEach(([key, value]) => {
      q = q.lte(key, value);
    });
  }
  if (filters.like) {
    Object.entries(filters.like).forEach(([key, value]) => {
      q = q.ilike(key, `%${value}%`);
    });
  }
  if (filters.order) {
    q = q.order(filters.order.column, { ascending: filters.order.ascending ?? true });
  }
  if (filters.limit) {
    q = q.limit(filters.limit);
  }
  if (filters.offset) {
    q = q.range(filters.offset, filters.offset + (filters.limit || 10) - 1);
  }
  
  return q;
}

// ============================================================================
// Users API
// ============================================================================

/**
 * User management API providing CRUD operations, invitations, and role management.
 *
 * Key Features:
 * - Current user retrieval with organization data
 * - User invitations with 7-day expiring tokens
 * - Multi-organization membership management
 * - Role-based permission updates (owner/admin restricted)
 *
 * @example
 * ```typescript
 * // Get current authenticated user
 * const user = await usersApi.getCurrent();
 *
 * // Invite a new team member
 * const invite = await usersApi.invite('newuser@example.com', 'employee');
 *
 * // Update user's salary mix ratio
 * await usersApi.updateSalaryMix(user.id, 0.75);
 * ```
 */
export const usersApi = {
  /**
   * Retrieves the currently authenticated user with their organization.
   * Fetches auth user from Supabase Auth, then loads profile from users table.
   * Organization is fetched separately to handle RLS edge cases.
   *
   * @returns User object with organization, or null if not authenticated
   */
  async getCurrent(): Promise<User | null> {
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
    if (authError) {
      console.error('[usersApi.getCurrent] Auth error:', authError);
      return null;
    }
    if (!authUser) {
      return null;
    }

    // First get just the user record (without organization join to avoid RLS issues)
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('auth_id', authUser.id)
      .maybeSingle();

    if (error) {
      console.error('[usersApi.getCurrent] Error fetching user profile:', error);
      return null;
    }

    if (!data) {
      return null;
    }

    // Now try to fetch organization separately if user has org_id
    let organization = null;
    if (data.org_id) {
      const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', data.org_id)
        .maybeSingle();

      if (orgError) {
        console.warn('[usersApi.getCurrent] Could not fetch organization:', orgError.message);
        // Continue without organization - user can still sign in
      } else {
        organization = orgData;
      }
    }

    return { ...data, organization };
  },

  /**
   * Fetches a user by their database ID with organization join.
   * @param id - User's UUID
   * @returns User with organization data, or null if not found
   */
  async getById(id: string): Promise<User | null> {
    const { data, error } = await supabase
      .from('users')
      .select('*, organization:organizations(*)')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching user:', error);
      return null;
    }
    return data;
  },

  /**
   * Lists users with optional filtering.
   * Filtered by RLS to current organization's users.
   * @param filters - Optional query filters
   * @returns Array of users matching filters
   */
  async list(filters?: QueryFilters): Promise<User[]> {
    let query = supabase
      .from('users')
      .select('*');

    query = applyFilters(query, filters);

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching users:', error);
      return [];
    }
    return data ?? [];
  },

  /**
   * Updates a user's profile data.
   * @param id - User's UUID
   * @param updates - Partial user object with fields to update
   * @returns Updated user, or null on error
   */
  async update(id: string, updates: Partial<User>): Promise<User | null> {
    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating user:', error);
      return null;
    }
    return data;
  },

  /**
   * Updates a user's salary/task compensation ratio (Salary Mixer feature).
   * The 'r' value determines the split: salary = base * r + task_value * (1 - r)
   * @param id - User's UUID
   * @param r - Salary ratio, typically between 0.5 and 0.9
   * @returns Updated user, or null on error
   */
  async updateSalaryMix(id: string, r: number): Promise<User | null> {
    return this.update(id, { r });
  },

  // ============================================================================
  // User Invitations
  // ============================================================================

  /**
   * Creates an invitation for a new user to join the current organization.
   * Generates a 6-character alphanumeric token valid for 7 days.
   *
   * @param email - Email address to invite
   * @param role - Role to assign when invitation is accepted
   * @returns Created invitation with organization and inviter details
   */
  async invite(email: string, role: UserRole): Promise<UserInvitation | null> {
    const user = await this.getCurrent();
    if (!user?.org_id) return null;

    // Generate a random invite token (6 characters, uppercase alphanumeric)
    const token = Array.from(crypto.getRandomValues(new Uint8Array(4)))
      .map(b => b.toString(36).toUpperCase())
      .join('')
      .slice(0, 6);

    // Set expiration to 7 days from now
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const { data, error } = await supabase
      .from('user_invitations')
      .insert({
        org_id: user.org_id,
        email,
        role,
        invited_by: user.id,
        token,
        status: 'pending',
        expires_at: expiresAt.toISOString()
      })
      .select(`
        *,
        organization:organizations(*),
        inviter:users!user_invitations_invited_by_fkey(id, full_name, email)
      `)
      .single();

    if (error) {
      console.error('Error creating invitation:', error);
      return null;
    }
    return data;
  },

  /**
   * Lists all invitations for the current user's organization.
   * Includes pending, accepted, and cancelled invitations.
   * @returns Array of invitations with inviter details
   */
  async listInvitations(): Promise<UserInvitation[]> {
    const user = await this.getCurrent();
    if (!user?.org_id) return [];

    const { data, error } = await supabase
      .from('user_invitations')
      .select(`
        *,
        inviter:users!user_invitations_invited_by_fkey(id, full_name, email)
      `)
      .eq('org_id', user.org_id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching invitations:', error);
      return [];
    }
    return data ?? [];
  },

  /**
   * Cancels a pending invitation.
   * @param inviteId - Invitation UUID
   * @returns true if cancelled successfully
   */
  async cancelInvitation(inviteId: string): Promise<boolean> {
    const { error } = await supabase
      .from('user_invitations')
      .update({ status: 'cancelled' })
      .eq('id', inviteId);

    if (error) {
      console.error('Error cancelling invitation:', error);
      return false;
    }
    return true;
  },

  /**
   * Accept an invitation to join an organization (for existing users)
   * @param inviteCode The 6-character invite code
   * @returns Object with success status, org_id, role, or error message
   */
  async acceptInvitation(inviteCode: string): Promise<{ success: boolean; org_id?: string; role?: string; error?: string }> {
    const { data, error } = await supabase.rpc('accept_organization_invite', {
      p_invite_code: inviteCode
    });

    if (error) {
      console.error('Error accepting invitation:', error);
      return { success: false, error: error.message };
    }

    if (!data?.success) {
      return { success: false, error: data?.error || 'Failed to accept invitation' };
    }

    return {
      success: true,
      org_id: data.org_id,
      role: data.role
    };
  },

  // ============================================================================
  // Organization Memberships (Multi-org support)
  // ============================================================================

  /**
   * Lists all organizations the current user belongs to.
   * Supports multi-organization feature for users in multiple orgs.
   * @returns Array of memberships with organization details, primary org first
   */
  async listUserOrganizations(): Promise<UserOrgMembership[]> {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return [];

    // First get the user record to get user.id
    const user = await this.getCurrent();
    if (!user) return [];

    const { data, error } = await supabase
      .from('user_organization_memberships')
      .select(`
        *,
        organization:organizations(*)
      `)
      .eq('user_id', user.id)
      .order('is_primary', { ascending: false });

    if (error) {
      console.error('Error fetching user organizations:', error);
      return [];
    }
    return data ?? [];
  },

  /**
   * Switches the current user's active organization.
   * Updates the user's org_id to the specified organization.
   * User must be a member of the target organization.
   *
   * @param orgId - Organization UUID to switch to
   * @returns true if switch was successful
   */
  async switchOrganization(orgId: string): Promise<boolean> {
    const user = await this.getCurrent();
    if (!user) return false;

    // Update the user's active org_id
    const { error } = await supabase
      .from('users')
      .update({ org_id: orgId })
      .eq('id', user.id);

    if (error) {
      console.error('Error switching organization:', error);
      return false;
    }
    return true;
  },

  // ============================================================================
  // Role Management
  // ============================================================================

  /**
   * Update a user's role with proper permission checks
   * - Owner can change any role
   * - Admins can change any role except other admins
   */
  async updateRole(userId: string, newRole: UserRole): Promise<{ success: boolean; error?: string }> {
    const { data, error } = await supabase.rpc('update_user_role', {
      p_target_user_id: userId,
      p_new_role: newRole
    });

    if (error) {
      console.error('Error updating user role:', error);
      return { success: false, error: error.message };
    }

    if (!data?.success) {
      return { success: false, error: data?.error || 'Failed to update role' };
    }

    return { success: true };
  },

  /**
   * Check if the current user is the organization owner
   */
  async isOrgOwner(): Promise<boolean> {
    const user = await this.getCurrent();
    if (!user?.org_id) return false;

    const { data, error } = await supabase
      .from('organizations')
      .select('owner_id')
      .eq('id', user.org_id)
      .single();

    if (error) {
      console.error('Error checking org owner:', error);
      return false;
    }

    return data?.owner_id === user.id;
  }
};

// ============================================================================
// Projects API
// ============================================================================

/**
 * Project management API for creating and managing projects.
 *
 * Project Lifecycle:
 * 1. Sales creates project (status: draft → pending_pm)
 * 2. PM picks up project (status: active, pm_id assigned)
 * 3. Tasks are created and completed
 * 4. Project completed when all tasks approved
 *
 * PM Compensation:
 * - Profit share based on budget management
 * - Bonus calculation via edge function
 * - Overdraft penalties if budget exceeded
 *
 * @example
 * ```typescript
 * // Create a new project
 * const project = await projectsApi.create({
 *   name: 'Website Redesign',
 *   budget: 5000,
 *   sales_id: currentUser.id
 * });
 *
 * // Assign a PM
 * await projectsApi.assignPM(project.id, pmUserId);
 * ```
 */
export const projectsApi = {
  /**
   * Fetches a project by ID with related data.
   * Includes sales rep, PM, and all tasks.
   * @param id - Project UUID
   * @returns Project with relations, or null if not found
   */
  async getById(id: string): Promise<Project | null> {
    const { data, error } = await supabase
      .from('projects')
      .select(`
        *,
        sales:users!projects_sales_id_fkey(*),
        pm:users!projects_pm_id_fkey(*),
        tasks(*)
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching project:', error);
      return null;
    }
    return data;
  },

  /**
   * Lists projects with optional filtering.
   * Includes sales rep and PM names for display.
   * @param filters - Optional query filters
   * @returns Array of projects with relations
   */
  async list(filters?: QueryFilters): Promise<Project[]> {
    let query = supabase
      .from('projects')
      .select(`
        *,
        sales:users!projects_sales_id_fkey(id, full_name),
        pm:users!projects_pm_id_fkey(id, full_name)
      `);

    query = applyFilters(query, filters);

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching projects:', error);
      return [];
    }
    return data ?? [];
  },

  /**
   * Creates a new project.
   * Typically called by sales role with initial budget and client info.
   * @param project - Project data (name, budget, client_name, etc.)
   * @returns Created project, or null on error
   */
  async create(project: Partial<Project>): Promise<Project | null> {
    const { data, error } = await supabase
      .from('projects')
      .insert(project)
      .select()
      .single();

    if (error) {
      console.error('Error creating project:', error);
      return null;
    }
    return data;
  },

  /**
   * Updates project fields.
   * @param id - Project UUID
   * @param updates - Partial project with fields to update
   * @returns Updated project, or null on error
   */
  async update(id: string, updates: Partial<Project>): Promise<Project | null> {
    const { data, error } = await supabase
      .from('projects')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating project:', error);
      return null;
    }
    return data;
  },

  /**
   * Assigns a project manager to a project.
   * Sets status to 'active' and records pickup timestamp.
   * Sales commission decay is calculated from this timestamp.
   *
   * @param projectId - Project UUID
   * @param pmId - PM user's UUID
   * @returns Updated project
   */
  async assignPM(projectId: string, pmId: string): Promise<Project | null> {
    return this.update(projectId, {
      pm_id: pmId,
      status: 'active' as ProjectStatus,
      picked_up_at: new Date().toISOString()
    });
  },

  /**
   * Calculates PM bonus for a completed project.
   * Formula: (budget - spent) * X - overdraft * (penalty * X) + bonus
   * Calls edge function for accurate calculation.
   *
   * @param projectId - Project UUID
   * @returns Calculated bonus amount
   */
  async calculatePMBonus(projectId: string): Promise<number> {
    const { data } = await functions.invoke<{ bonus: number }>('calculate-payout', {
      body: { project_id: projectId, calculation_type: 'pm_bonus' }
    });
    return data?.bonus ?? 0;
  }
};

// ============================================================================
// Tasks API
// ============================================================================

/**
 * Task management API for the core task workflow.
 *
 * Task Lifecycle:
 * 1. PM creates task (status: open)
 * 2. Employee accepts task (status: assigned)
 * 3. Employee works on task (status: in_progress)
 * 4. Employee submits work (status: completed)
 * 5. QC reviews submission (status: under_review)
 * 6. Approved/Rejected (status: approved/rejected)
 * 7. Payout processed (status: paid)
 *
 * Gamification:
 * - required_level gates task access
 * - urgency_multiplier affects rewards
 * - story_points for estimation
 *
 * External Assignments:
 * - Tasks can be assigned to external contractors
 * - Guest submission links for unauthenticated work
 *
 * @example
 * ```typescript
 * // List available tasks for user
 * const tasks = await tasksApi.listAvailable(user.level);
 *
 * // Accept a task
 * await tasksApi.accept(taskId, user.id);
 *
 * // Submit completed work
 * await tasksApi.submit(taskId, submissionData, fileUrls);
 * ```
 */
export const tasksApi = {
  /**
   * Fetches a task by ID with full relations.
   * Includes project, assignee, and all QC reviews with reviewers.
   * @param id - Task UUID
   * @returns Task with relations, or null if not found
   */
  async getById(id: string): Promise<Task | null> {
    const { data, error } = await supabase
      .from('tasks')
      .select(`
        *,
        project:projects(*),
        assignee:users(*),
        qc_reviews(*, reviewer:users(*))
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching task:', error);
      return null;
    }
    return data;
  },

  /**
   * Lists tasks with optional filtering.
   * Includes assignee info and QC review summaries.
   * @param filters - Optional query filters
   * @returns Array of tasks with relations
   */
  async list(filters?: QueryFilters): Promise<Task[]> {
    let query = supabase
      .from('tasks')
      .select(`
        *,
        assignee:users(id, full_name, level),
        qc_reviews(id, passed, confidence, review_type)
      `);

    query = applyFilters(query, filters);

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching tasks:', error);
      return [];
    }
    return data ?? [];
  },

  /**
   * Lists all tasks for a specific project.
   * @param projectId - Project UUID
   */
  async listByProject(projectId: string): Promise<Task[]> {
    return this.list({ eq: { project_id: projectId } });
  },

  /**
   * Lists all tasks assigned to a specific user.
   * @param userId - User UUID
   */
  async listByAssignee(userId: string): Promise<Task[]> {
    return this.list({ eq: { assignee_id: userId } });
  },

  /**
   * Lists open tasks available for the user's level.
   * Filters to status=open and required_level <= userLevel.
   * Ordered by urgency_multiplier (highest first).
   *
   * @param userLevel - User's current level
   * @returns Available tasks the user can accept
   */
  async listAvailable(userLevel: number): Promise<Task[]> {
    const { data, error } = await supabase
      .from('tasks')
      .select('*, project:projects(id, name)')
      .eq('status', 'open')
      .lte('required_level', userLevel)
      .order('urgency_multiplier', { ascending: false });

    if (error) {
      console.error('Error fetching available tasks:', error);
      return [];
    }
    return data ?? [];
  },

  /**
   * Creates a new task within a project.
   * Typically called by PM or admin roles.
   *
   * @param task - Task data (title, description, dollar_value, etc.)
   * @returns Created task, or null on error
   */
  async create(task: Partial<Task>): Promise<Task | null> {
    const { data, error } = await supabase
      .from('tasks')
      .insert(task)
      .select()
      .single();

    if (error) {
      console.error('Error creating task:', error);
      return null;
    }
    return data;
  },

  /**
   * Updates task fields.
   * @param id - Task UUID
   * @param updates - Partial task with fields to update
   * @returns Updated task, or null on error
   */
  async update(id: string, updates: Partial<Task>): Promise<Task | null> {
    const { data, error } = await supabase
      .from('tasks')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating task:', error);
      return null;
    }
    return data;
  },

  /**
   * Accepts an open task for the current user.
   * Uses RPC function that validates user level requirements.
   * Sets status to 'assigned' and records assignment timestamp.
   *
   * @param taskId - Task UUID
   * @param userId - User UUID accepting the task
   * @returns Assigned task, or null on error
   */
  async accept(taskId: string, userId: string): Promise<Task | null> {
    // Use RPC function which validates user level and handles the assignment atomically
    const { data, error } = await supabase.rpc('accept_task', {
      p_task_id: taskId,
      p_user_id: userId
    });

    if (error) {
      console.error('Error accepting task:', error);
      // Fallback to direct update if RPC not available
      return this.update(taskId, {
        assignee_id: userId,
        assigned_at: new Date().toISOString(),
        status: 'assigned' as TaskStatus
      });
    }

    return data;
  },

  /**
   * Submits completed work for a task.
   * Triggers AI QC review automatically after submission.
   *
   * @param taskId - Task UUID
   * @param submissionData - JSON object with submission details
   * @param files - Optional array of uploaded file URLs
   * @returns Updated task, or null on error
   */
  async submit(
    taskId: string,
    submissionData: Record<string, unknown>,
    files?: string[]
  ): Promise<Task | null> {
    const task = await this.update(taskId, {
      status: 'completed' as TaskStatus,
      completed_at: new Date().toISOString(),
      submission_data: submissionData,
      submission_files: files
    });

    if (task) {
      // Trigger AI QC review
      await functions.invoke('qc-ai-review', {
        body: { task_id: taskId }
      });
    }

    return task;
  },

  /**
   * Calculates employee payout for a completed task.
   * Uses hybrid formula: salary * r + task_value * (1 - r)
   * Calls edge function for accurate calculation with all factors.
   *
   * @param taskId - Task UUID
   * @returns Payout amount and calculation details
   */
  async calculatePayout(taskId: string): Promise<{ payout: number; details: unknown }> {
    const { data } = await functions.invoke<{ payout: number; details: unknown }>(
      'calculate-payout',
      { body: { task_id: taskId, calculation_type: 'employee' } }
    );
    return data ?? { payout: 0, details: {} };
  },

  // ============================================================================
  // External Work Assignment
  // ============================================================================

  /**
   * Assign a task to an external contractor
   * Auto-generates a contract and optionally a guest submission link
   */
  async assignExternal(
    taskId: string,
    assignment: ExternalAssignment
  ): Promise<ExternalAssignmentResult> {
    const { data, error } = await supabase.rpc('assign_task_externally', {
      p_task_id: taskId,
      p_contractor_name: assignment.contractor_name,
      p_contractor_email: assignment.contractor_email,
      p_use_guest_link: assignment.use_guest_link
    });

    if (error) {
      console.error('Error assigning task externally:', error);
      return { success: false, error: error.message };
    }

    if (!data?.success) {
      return { success: false, error: data?.error || 'Failed to assign task externally' };
    }

    return {
      success: true,
      contract_id: data.contract_id,
      submission_token: data.submission_token,
      task_id: data.task_id
    };
  },

  /**
   * Get task details by guest submission token (for external contractors)
   * The RPC returns the task object directly as JSONB, not wrapped in a success object
   */
  async getBySubmissionToken(token: string): Promise<Task | null> {
    const { data, error } = await supabase.rpc('get_task_by_submission_token', {
      p_token: token
    });

    if (error) {
      console.error('Error fetching task by token:', error);
      return null;
    }

    // RPC returns the task directly as JSONB, or null if not found
    if (!data) {
      return null;
    }

    return data as Task;
  },

  /**
   * Submit work for an externally assigned task (guest submission)
   */
  async submitExternal(
    token: string,
    submissionData: TaskSubmissionData
  ): Promise<{ success: boolean; error?: string; task_id?: string }> {
    const { data, error } = await supabase.rpc('submit_external_work', {
      p_submission_token: token,
      p_submission_data: submissionData
    });

    if (error) {
      console.error('Error submitting external work:', error);
      return { success: false, error: error.message };
    }

    if (!data?.success) {
      return { success: false, error: data?.error || 'Failed to submit work' };
    }

    return {
      success: true,
      task_id: data.task_id
    };
  },

  // ============================================================================
  // Task Reordering
  // ============================================================================

  /**
   * Reorder tasks within a status column
   * Updates sort_order for all tasks in the provided order
   */
  async reorderTasks(
    taskIds: string[],
    status: TaskStatus
  ): Promise<boolean> {
    const { data, error } = await supabase.rpc('reorder_tasks', {
      p_task_ids: taskIds,
      p_status: status
    });

    if (error) {
      console.error('Error reordering tasks:', error);
      return false;
    }

    return data?.success ?? false;
  }
};

// ============================================================================
// QC Reviews API
// ============================================================================

/**
 * Quality Control review API for the QC workflow.
 *
 * QC Flow:
 * 1. Task submitted → triggers AI review (review_type: 'ai')
 * 2. Human review if AI confidence < threshold (review_type: 'peer' or 'independent')
 * 3. Multiple passes allowed with geometric decay in Shapley value
 *
 * Shapley Value Calculations:
 * - d_1 = β * p_0 * V (first-pass marginal, confidence-scaled)
 * - d_k = d_1 * γ^(k-1) (geometric decay for successive passes)
 * - Review weights: peer=1.0, independent=2.0
 *
 * See FORMULAS.md for detailed calculation documentation.
 *
 * @example
 * ```typescript
 * // Get tasks pending QC review
 * const pendingTasks = await qcApi.listPending();
 *
 * // Submit a review
 * await qcApi.submitReview(taskId, reviewerId, true, 'Good work!', 'peer');
 * ```
 */
export const qcApi = {
  /**
   * Fetches a QC review by ID with task and reviewer details.
   * @param id - Review UUID
   * @returns Review with relations, or null if not found
   */
  async getById(id: string): Promise<QCReview | null> {
    const { data, error } = await supabase
      .from('qc_reviews')
      .select(`
        *,
        task:tasks(*),
        reviewer:users(*)
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching QC review:', error);
      return null;
    }
    return data;
  },

  /**
   * Lists tasks pending QC review.
   * Returns tasks with status 'completed' or 'under_review'.
   * Ordered by completion time (oldest first for FIFO processing).
   *
   * @returns Tasks needing QC review with assignee and existing reviews
   */
  async listPending(): Promise<Task[]> {
    const { data, error } = await supabase
      .from('tasks')
      .select(`
        *,
        assignee:users(id, full_name),
        qc_reviews(*)
      `)
      .in('status', ['completed', 'under_review'])
      .order('completed_at', { ascending: true });

    if (error) {
      console.error('Error fetching pending reviews:', error);
      return [];
    }
    return data ?? [];
  },

  /**
   * Creates a new QC review record.
   * Automatically updates task status based on review result.
   *
   * @param review - Review data (task_id, passed, feedback, etc.)
   * @returns Created review, or null on error
   */
  async create(review: Partial<QCReview>): Promise<QCReview | null> {
    const { data, error } = await supabase
      .from('qc_reviews')
      .insert(review)
      .select()
      .single();

    if (error) {
      console.error('Error creating QC review:', error);
      return null;
    }

    // Update task status based on review
    if (data) {
      const newStatus: TaskStatus = data.passed ? 'approved' : 'rejected';
      await tasksApi.update(data.task_id, { status: newStatus });
    }

    return data;
  },

  /**
   * Submits a human QC review for a task.
   * Calculates pass number and weight automatically.
   * Updates task status to approved/rejected based on result.
   *
   * Shapley value fields (v0, d_k) are simplified here;
   * actual payout calculation uses edge function.
   *
   * @param taskId - Task UUID
   * @param reviewerId - Reviewer user's UUID
   * @param passed - Whether the submission passed QC
   * @param feedback - Review comments/feedback
   * @param reviewType - 'peer' (weight 1.0) or 'independent' (weight 2.0)
   * @returns Created review, or null on error
   */
  async submitReview(
    taskId: string,
    reviewerId: string,
    passed: boolean,
    feedback: string,
    reviewType: 'peer' | 'independent' = 'independent'
  ): Promise<QCReview | null> {
    // Get task and previous reviews for pass number calculation
    const task = await tasksApi.getById(taskId);
    if (!task) return null;

    const passNumber = (task.qc_reviews?.length ?? 0) + 1;
    const weight = reviewType === 'peer' ? 1.0 : 2.0;

    return this.create({
      task_id: taskId,
      reviewer_id: reviewerId,
      review_type: reviewType,
      passed,
      feedback,
      pass_number: passNumber,
      weight,
      v0: task.dollar_value * 0.7,
      d_k: task.dollar_value * 0.1 // Simplified; real calc in edge function
    });
  }
};

// ============================================================================
// Contracts API
// ============================================================================

/**
 * Contract management API for e-signature workflows.
 *
 * Quick Contract Flow:
 * 1. Generate contract from template (edge function)
 * 2. Party A (employer) signs
 * 3. Party B (contractor) reviews and signs
 * 4. Contract becomes active on dual signature
 *
 * PDF Management:
 * - PDFs stored in Supabase Storage 'contracts' bucket
 * - Path format: org_id/contract_id/filename (matches RLS policy)
 *
 * External Contractor Support:
 * - Token-based access for unauthenticated contractors
 * - Sign contracts via submission token
 *
 * @example
 * ```typescript
 * // Create a new contract
 * const contract = await contractsApi.create(
 *   'contractor_agreement',
 *   employerId,
 *   { rate: 50, duration: '3 months' },
 *   { taskId, partyBEmail: 'contractor@example.com' }
 * );
 *
 * // Sign as party A
 * await contractsApi.sign(contract.id, 'a');
 * ```
 */
export const contractsApi = {
  /**
   * Fetches a contract by ID with all relations.
   * Includes party A, party B, task, and project details.
   * @param id - Contract UUID
   * @returns Contract with relations, or null if not found
   */
  async getById(id: string): Promise<Contract | null> {
    const { data, error } = await supabase
      .from('contracts')
      .select(`
        *,
        party_a:users!contracts_party_a_id_fkey(*),
        party_b:users!contracts_party_b_id_fkey(*),
        task:tasks(*),
        project:projects(*)
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching contract:', error);
      return null;
    }
    return data;
  },

  /**
   * Lists contracts with optional filtering.
   * Includes party names, task, and project info.
   * @param filters - Optional query filters
   * @returns Array of contracts with relations
   */
  async list(filters?: QueryFilters): Promise<Contract[]> {
    let query = supabase
      .from('contracts')
      .select(`
        *,
        party_a:users!contracts_party_a_id_fkey(id, full_name, email),
        party_b:users!contracts_party_b_id_fkey(id, full_name, email),
        task:tasks(id, title),
        project:projects(id, name)
      `);

    query = applyFilters(query, filters);

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching contracts:', error);
      return [];
    }
    return data ?? [];
  },

  /**
   * Creates a new contract from a template via edge function.
   * Generates PDF and stores it in Supabase Storage.
   *
   * @param templateType - Contract template identifier
   * @param partyAId - Party A (employer) user UUID
   * @param terms - Contract terms object
   * @param options - Additional options (taskId, projectId, partyBId, partyBEmail)
   * @returns Created contract, or null on error
   */
  async create(
    templateType: string,
    partyAId: string,
    terms: Record<string, unknown>,
    options?: { taskId?: string; projectId?: string; partyBId?: string; partyBEmail?: string }
  ): Promise<Contract | null> {
    const { data } = await functions.invoke<{ contract: Contract }>('generate-contract', {
      body: {
        template_type: templateType,
        party_a_id: partyAId,
        party_b_id: options?.partyBId,
        task_id: options?.taskId,
        project_id: options?.projectId,
        terms: {
          ...terms,
          contractor_email: options?.partyBEmail
        }
      }
    });

    return data?.contract ?? null;
  },

  /**
   * Signs a contract as party A or party B.
   * Automatically activates contract when both parties have signed.
   *
   * @param contractId - Contract UUID
   * @param partyType - 'a' for employer, 'b' for contractor
   * @returns Updated contract, or null on error
   */
  async sign(contractId: string, partyType: 'a' | 'b'): Promise<Contract | null> {
    const field = partyType === 'a' ? 'party_a_signed_at' : 'party_b_signed_at';

    const { data, error } = await supabase
      .from('contracts')
      .update({ [field]: new Date().toISOString() })
      .eq('id', contractId)
      .select()
      .single();

    if (error) {
      console.error('Error signing contract:', error);
      return null;
    }

    // Check if both parties have signed
    if (data.party_a_signed_at && data.party_b_signed_at) {
      await supabase
        .from('contracts')
        .update({ status: 'active' })
        .eq('id', contractId);
    }

    return data;
  },

  /**
   * Upload a PDF blob to storage and update the contract record
   * Storage path: org_id/contract_id/filename (matches RLS policy)
   */
  async uploadPdf(contractId: string, pdfBlob: Blob, filename: string): Promise<string | null> {
    try {
      // Get org_id from contract for storage path (RLS policy requires org_id prefix)
      const { data: contract, error: fetchError } = await supabase
        .from('contracts')
        .select('org_id')
        .eq('id', contractId)
        .single();

      if (fetchError || !contract?.org_id) {
        console.error('Error fetching contract org_id:', fetchError);
        return null;
      }

      // Upload to Supabase Storage with org_id prefix
      const pdfPath = `${contract.org_id}/${contractId}/${filename}`;
      const { error: uploadError } = await supabase.storage
        .from('contracts')
        .upload(pdfPath, pdfBlob, {
          contentType: 'application/pdf',
          upsert: true
        });

      if (uploadError) {
        console.error('Error uploading PDF:', uploadError);
        return null;
      }

      // Update contract record with pdf_path
      const { error: updateError } = await supabase
        .from('contracts')
        .update({ pdf_path: pdfPath })
        .eq('id', contractId);

      if (updateError) {
        console.error('Error updating contract pdf_path:', updateError);
        return null;
      }

      return pdfPath;
    } catch (error) {
      console.error('Error in uploadPdf:', error);
      return null;
    }
  },

  /**
   * Get the public URL for a contract PDF
   */
  getPdfUrl(pdfPath: string): string {
    const { data } = supabase.storage
      .from('contracts')
      .getPublicUrl(pdfPath);
    return data.publicUrl;
  },

  /**
   * Download a contract PDF
   */
  async downloadPdf(pdfPath: string): Promise<Blob | null> {
    const { data, error } = await supabase.storage
      .from('contracts')
      .download(pdfPath);

    if (error) {
      console.error('Error downloading PDF:', error);
      return null;
    }

    return data;
  },

  /**
   * Get contract by submission token (for external contractors)
   * No authentication required - uses the token for authorization
   */
  async getBySubmissionToken(token: string): Promise<Contract | null> {
    const { data, error } = await supabase.rpc('get_contract_by_submission_token', {
      p_token: token
    });

    if (error) {
      console.error('Error fetching contract by token:', error);
      return null;
    }

    return data as Contract | null;
  },

  /**
   * Sign contract as external contractor using submission token
   * No authentication required - uses the token for authorization
   */
  async signExternal(token: string): Promise<{ success: boolean; error?: string; contract_id?: string; is_active?: boolean }> {
    const { data, error } = await supabase.rpc('sign_contract_external', {
      p_token: token
    });

    if (error) {
      console.error('Error signing contract externally:', error);
      return { success: false, error: error.message };
    }

    if (!data?.success) {
      return { success: false, error: data?.error || 'Failed to sign contract' };
    }

    return {
      success: true,
      contract_id: data.contract_id,
      is_active: data.is_active
    };
  }
};

// ============================================================================
// Payouts API
// ============================================================================

/**
 * Payout tracking API for compensation records.
 *
 * Payout Types:
 * - task_completion: Employee task payouts
 * - qc_review: QC reviewer Shapley value payouts
 * - pm_bonus: PM project completion bonuses
 * - sales_commission: Sales rep commissions
 *
 * Status Flow:
 * pending → paid (or cancelled)
 *
 * @example
 * ```typescript
 * // Get user's payout summary for the month
 * const summary = await payoutsApi.getSummary(userId, 'month');
 * console.log(`Total paid: $${summary.total}`);
 * ```
 */
export const payoutsApi = {
  /**
   * Fetches a payout by ID with relations.
   * @param id - Payout UUID
   * @returns Payout with user, task, and project details
   */
  async getById(id: string): Promise<Payout | null> {
    const { data, error } = await supabase
      .from('payouts')
      .select(`
        *,
        user:users(*),
        task:tasks(*),
        project:projects(*)
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching payout:', error);
      return null;
    }
    return data;
  },

  /**
   * Lists payouts for a specific user.
   * Ordered by created_at descending by default.
   *
   * @param userId - User UUID
   * @param filters - Optional additional filters
   * @returns Array of payouts with task info
   */
  async listByUser(userId: string, filters?: QueryFilters): Promise<Payout[]> {
    let query = supabase
      .from('payouts')
      .select('*, task:tasks(id, title)')
      .eq('user_id', userId);

    query = applyFilters(query, {
      ...filters,
      order: filters?.order ?? { column: 'created_at', ascending: false }
    });

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching payouts:', error);
      return [];
    }
    return data ?? [];
  },

  /**
   * Gets aggregated payout summary for a user.
   * Calculates totals by status and payout type.
   *
   * @param userId - User UUID
   * @param period - Optional time period filter ('week', 'month', 'year')
   * @returns Summary with total paid, pending, and breakdown by type
   */
  async getSummary(userId: string, period?: 'week' | 'month' | 'year'): Promise<{
    total: number;
    pending: number;
    byType: Record<string, number>;
  }> {
    let query = supabase
      .from('payouts')
      .select('payout_type, net_amount, status')
      .eq('user_id', userId);

    if (period) {
      const now = new Date();
      let startDate: Date;
      switch (period) {
        case 'week':
          startDate = new Date(now.setDate(now.getDate() - 7));
          break;
        case 'month':
          startDate = new Date(now.setMonth(now.getMonth() - 1));
          break;
        case 'year':
          startDate = new Date(now.setFullYear(now.getFullYear() - 1));
          break;
      }
      query = query.gte('created_at', startDate.toISOString());
    }

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching payout summary:', error);
      return { total: 0, pending: 0, byType: {} };
    }

    const payouts = data ?? [];
    const total = payouts
      .filter(p => p.status === 'paid')
      .reduce((sum, p) => sum + p.net_amount, 0);
    const pending = payouts
      .filter(p => p.status === 'pending')
      .reduce((sum, p) => sum + p.net_amount, 0);
    
    const byType: Record<string, number> = {};
    payouts.forEach(p => {
      byType[p.payout_type] = (byType[p.payout_type] ?? 0) + p.net_amount;
    });

    return { total, pending, byType };
  }
};

// ============================================================================
// Organizations API
// ============================================================================

/**
 * Organization management API for settings and configuration.
 *
 * Organization Settings:
 * - Payout parameters: default_r, r_bounds, qc_beta, qc_gamma, pm_x
 * - Feature flags: Enable/disable platform features
 * - Branding: Organization name and customization
 *
 * Feature Flag Presets:
 * - all_features: Everything enabled (17/17)
 * - standard: Recommended default (15/17)
 * - minimal: Basic task management (7/17)
 * - none: Start from scratch (0/17)
 *
 * @example
 * ```typescript
 * // Get current organization
 * const org = await organizationsApi.getCurrent();
 *
 * // Enable a feature
 * await organizationsApi.updateFeatureFlags(org.id, { analytics: true });
 *
 * // Apply a preset
 * await organizationsApi.applyFeatureFlagPreset(org.id, 'standard');
 * ```
 */
export const organizationsApi = {
  /**
   * Gets the current user's active organization.
   * @returns Organization, or null if not authenticated/no org
   */
  async getCurrent(): Promise<Organization | null> {
    const user = await usersApi.getCurrent();
    if (!user?.org_id) return null;

    const { data, error } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', user.org_id)
      .single();

    if (error) {
      console.error('Error fetching organization:', error);
      return null;
    }
    return data;
  },

  /**
   * Updates organization-level settings.
   * Includes payout parameters, branding, etc.
   *
   * @param orgId - Organization UUID
   * @param settings - Partial organization with fields to update
   * @returns Updated organization, or null on error
   */
  async updateSettings(orgId: string, settings: Partial<Organization>): Promise<Organization | null> {
    const { data, error } = await supabase
      .from('organizations')
      .update(settings)
      .eq('id', orgId)
      .select()
      .single();

    if (error) {
      console.error('Error updating organization:', error);
      return null;
    }
    return data;
  },

  /**
   * Update feature flags for an organization
   * Merges the provided flags with existing settings
   */
  async updateFeatureFlags(orgId: string, flags: Partial<FeatureFlags>): Promise<Organization | null> {
    // Get current settings first
    const { data: current, error: fetchError } = await supabase
      .from('organizations')
      .select('settings')
      .eq('id', orgId)
      .single();

    if (fetchError) {
      console.error('Error fetching organization settings:', fetchError);
      return null;
    }

    const currentSettings = (current?.settings || {}) as OrganizationSettings;
    const updatedSettings: OrganizationSettings = {
      ...currentSettings,
      feature_flags: {
        ...currentSettings.feature_flags,
        ...flags
      }
    };

    const { data, error } = await supabase
      .from('organizations')
      .update({ settings: updatedSettings })
      .eq('id', orgId)
      .select()
      .single();

    if (error) {
      console.error('Error updating feature flags:', error);
      return null;
    }
    return data;
  },

  /**
   * Apply a feature flag preset to an organization
   */
  async applyFeatureFlagPreset(orgId: string, preset: FeatureFlagPreset): Promise<Organization | null> {
    const presetFlags = getPreset(preset);
    return this.updateFeatureFlags(orgId, presetFlags);
  }
};

// ============================================================================
// Guest Projects API (for anonymous users trying Orbit)
// ============================================================================

/**
 * Guest project API for the "Try Orbit" demo experience.
 *
 * Allows unauthenticated users to:
 * - Create a sample project
 * - Add/edit/remove tasks
 * - Experience the UI without signing up
 *
 * Session Management:
 * - Uses localStorage session ID for persistence
 * - Projects stored in guest_projects table
 * - Can be imported to real org after signup
 *
 * @example
 * ```typescript
 * // Add a task to guest project
 * await guestProjectsApi.addTask({
 *   title: 'My first task',
 *   description: 'Test the demo',
 *   status: 'open'
 * });
 *
 * // After signup, import to real organization
 * await guestProjectsApi.importToOrganization(orgId);
 * ```
 */

/**
 * Generates or retrieves a persistent session ID for guest users.
 * Stored in localStorage for cross-page persistence.
 * @returns Session UUID, or empty string if not in browser
 */
function getGuestSessionId(): string {
  if (typeof window === 'undefined') return '';

  let sessionId = localStorage.getItem('orbit_guest_session');
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem('orbit_guest_session', sessionId);
  }
  return sessionId;
}

export const guestProjectsApi = {
  /**
   * Get the current guest project for this session
   */
  async getCurrent(): Promise<GuestProject | null> {
    const sessionId = getGuestSessionId();
    if (!sessionId) return null;

    const { data, error } = await supabase
      .from('guest_projects')
      .select('*')
      .eq('session_id', sessionId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching guest project:', error);
      return null;
    }
    return data;
  },

  /**
   * Create or update a guest project
   */
  async save(project: Partial<GuestProject>): Promise<GuestProject | null> {
    const sessionId = getGuestSessionId();
    if (!sessionId) return null;

    // Check if project exists
    const existing = await this.getCurrent();

    if (existing) {
      // Update existing project
      const { data, error } = await supabase
        .from('guest_projects')
        .update({
          name: project.name ?? existing.name,
          description: project.description ?? existing.description,
          tasks: project.tasks ?? existing.tasks,
          settings: project.settings ?? existing.settings,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) {
        console.error('Error updating guest project:', error);
        return null;
      }
      return data;
    } else {
      // Create new project
      const { data, error } = await supabase
        .from('guest_projects')
        .insert({
          session_id: sessionId,
          name: project.name || 'My Project',
          description: project.description || null,
          tasks: project.tasks || [],
          settings: project.settings || {}
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating guest project:', error);
        return null;
      }
      return data;
    }
  },

  /**
   * Add a task to the guest project
   */
  async addTask(task: Omit<GuestTask, 'id' | 'sort_order'>): Promise<GuestProject | null> {
    const project = await this.getCurrent();
    if (!project) {
      // Create project with first task
      return this.save({
        name: 'My Project',
        tasks: [{
          id: crypto.randomUUID(),
          ...task,
          sort_order: 0
        }]
      });
    }

    const newTask: GuestTask = {
      id: crypto.randomUUID(),
      ...task,
      sort_order: project.tasks.length
    };

    return this.save({
      tasks: [...project.tasks, newTask]
    });
  },

  /**
   * Update a task in the guest project
   */
  async updateTask(taskId: string, updates: Partial<GuestTask>): Promise<GuestProject | null> {
    const project = await this.getCurrent();
    if (!project) return null;

    const tasks = project.tasks.map(t =>
      t.id === taskId ? { ...t, ...updates } : t
    );

    return this.save({ tasks });
  },

  /**
   * Remove a task from the guest project
   */
  async removeTask(taskId: string): Promise<GuestProject | null> {
    const project = await this.getCurrent();
    if (!project) return null;

    const tasks = project.tasks.filter(t => t.id !== taskId);
    return this.save({ tasks });
  },

  /**
   * Import guest project into a real organization after sign-in
   */
  async importToOrganization(orgId: string, projectId?: string): Promise<{ success: boolean; project_id?: string; error?: string }> {
    const sessionId = getGuestSessionId();
    if (!sessionId) {
      return { success: false, error: 'No guest session found' };
    }

    const { data, error } = await supabase.rpc('import_guest_project', {
      p_session_id: sessionId,
      p_org_id: orgId,
      p_pm_id: null // Will be set to current user in the function
    });

    if (error) {
      console.error('Error importing guest project:', error);
      return { success: false, error: error.message };
    }

    if (!data?.success) {
      return { success: false, error: data?.error || 'Failed to import project' };
    }

    // Clear the guest session after successful import
    localStorage.removeItem('orbit_guest_session');

    return {
      success: true,
      project_id: data.project_id
    };
  },

  /**
   * Clear the guest project and session
   */
  async clear(): Promise<void> {
    const sessionId = getGuestSessionId();
    if (!sessionId) return;

    await supabase
      .from('guest_projects')
      .delete()
      .eq('session_id', sessionId);

    localStorage.removeItem('orbit_guest_session');
  }
};

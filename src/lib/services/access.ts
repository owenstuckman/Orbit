import { supabase } from './supabase';
import type {
  User,
  Project,
  Task,
  PermissionLevel,
  ProjectAccess,
  TaskAccess,
  TeamMember,
  PermissionCheck,
  UserRole
} from '$lib/types';

// Permission level hierarchy (higher index = more access)
const PERMISSION_HIERARCHY: PermissionLevel[] = ['none', 'view', 'work', 'manage', 'admin'];

function hasPermission(userLevel: PermissionLevel, requiredLevel: PermissionLevel): boolean {
  return PERMISSION_HIERARCHY.indexOf(userLevel) >= PERMISSION_HIERARCHY.indexOf(requiredLevel);
}

// Role-based default permissions for projects
const ROLE_PROJECT_PERMISSIONS: Record<UserRole, PermissionLevel> = {
  admin: 'admin',
  sales: 'view',  // Can view projects they created
  pm: 'manage',   // Can manage their projects
  qc: 'view',     // Can view projects with tasks to review
  employee: 'none',
  contractor: 'none'
};

// Role-based default permissions for tasks
const ROLE_TASK_PERMISSIONS: Record<UserRole, PermissionLevel> = {
  admin: 'admin',
  sales: 'none',
  pm: 'manage',
  qc: 'view',      // Can view tasks for QC
  employee: 'work', // Can work on assigned tasks
  contractor: 'work'
};

export const accessApi = {
  // ============================================================================
  // Permission Checking
  // ============================================================================

  /**
   * Check if a user has a specific permission level for a project
   */
  async checkProjectAccess(
    userId: string,
    projectId: string,
    requiredLevel: PermissionLevel = 'view'
  ): Promise<PermissionCheck> {
    // Get user info
    const { data: user } = await supabase
      .from('users')
      .select('id, role, org_id')
      .eq('id', userId)
      .single();

    if (!user) {
      return { allowed: false, level: 'none', reason: 'User not found' };
    }

    // Admin has full access
    if (user.role === 'admin') {
      return { allowed: true, level: 'admin' };
    }

    // Get project info
    const { data: project } = await supabase
      .from('projects')
      .select('id, org_id, sales_id, pm_id')
      .eq('id', projectId)
      .single();

    if (!project) {
      return { allowed: false, level: 'none', reason: 'Project not found' };
    }

    // Check org membership
    if (project.org_id !== user.org_id) {
      return { allowed: false, level: 'none', reason: 'Not in same organization' };
    }

    // Check explicit project access
    const { data: explicitAccess } = await supabase
      .from('project_access')
      .select('permission_level, expires_at')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .single();

    if (explicitAccess) {
      // Check if access has expired
      if (explicitAccess.expires_at && new Date(explicitAccess.expires_at) < new Date()) {
        // Access expired, remove it
        await supabase.from('project_access').delete()
          .eq('project_id', projectId)
          .eq('user_id', userId);
      } else {
        const level = explicitAccess.permission_level as PermissionLevel;
        return {
          allowed: hasPermission(level, requiredLevel),
          level,
          reason: hasPermission(level, requiredLevel) ? undefined : 'Insufficient permission level'
        };
      }
    }

    // Check team membership
    const { data: teamMember } = await supabase
      .from('team_members')
      .select('role')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .single();

    if (teamMember) {
      // Team members get 'work' level by default, leads get 'manage'
      const level = teamMember.role === 'lead' ? 'manage' : 'work';
      return {
        allowed: hasPermission(level, requiredLevel),
        level,
        reason: hasPermission(level, requiredLevel) ? undefined : 'Insufficient permission level'
      };
    }

    // Check if user is the sales rep or PM
    if (project.sales_id === userId) {
      return { allowed: hasPermission('view', requiredLevel), level: 'view' };
    }
    if (project.pm_id === userId) {
      return { allowed: hasPermission('manage', requiredLevel), level: 'manage' };
    }

    // Fall back to role-based default
    const roleLevel = ROLE_PROJECT_PERMISSIONS[user.role as UserRole] || 'none';
    return {
      allowed: hasPermission(roleLevel, requiredLevel),
      level: roleLevel,
      reason: hasPermission(roleLevel, requiredLevel) ? undefined : 'No access to this project'
    };
  },

  /**
   * Check if a user has a specific permission level for a task
   */
  async checkTaskAccess(
    userId: string,
    taskId: string,
    requiredLevel: PermissionLevel = 'view'
  ): Promise<PermissionCheck> {
    // Get user info
    const { data: user } = await supabase
      .from('users')
      .select('id, role, org_id, training_level')
      .eq('id', userId)
      .single();

    if (!user) {
      return { allowed: false, level: 'none', reason: 'User not found' };
    }

    // Admin has full access
    if (user.role === 'admin') {
      return { allowed: true, level: 'admin' };
    }

    // Get task info
    const { data: task } = await supabase
      .from('tasks')
      .select('id, org_id, project_id, assignee_id, status, required_level')
      .eq('id', taskId)
      .single();

    if (!task) {
      return { allowed: false, level: 'none', reason: 'Task not found' };
    }

    // Check org membership
    if (task.org_id !== user.org_id) {
      return { allowed: false, level: 'none', reason: 'Not in same organization' };
    }

    // Check explicit task access
    const { data: explicitAccess } = await supabase
      .from('task_access')
      .select('permission_level, expires_at')
      .eq('task_id', taskId)
      .eq('user_id', userId)
      .single();

    if (explicitAccess) {
      // Check if access has expired
      if (explicitAccess.expires_at && new Date(explicitAccess.expires_at) < new Date()) {
        // Access expired, remove it
        await supabase.from('task_access').delete()
          .eq('task_id', taskId)
          .eq('user_id', userId);
      } else {
        const level = explicitAccess.permission_level as PermissionLevel;
        return {
          allowed: hasPermission(level, requiredLevel),
          level,
          reason: hasPermission(level, requiredLevel) ? undefined : 'Insufficient permission level'
        };
      }
    }

    // If user is the assignee, they have 'work' access
    if (task.assignee_id === userId) {
      return { allowed: hasPermission('work', requiredLevel), level: 'work' };
    }

    // Check project-level access (inherits from project)
    if (task.project_id) {
      const projectAccess = await this.checkProjectAccess(userId, task.project_id, 'view');
      if (projectAccess.allowed) {
        // Project access determines task access (with a cap at 'manage' for tasks)
        const cappedLevel = projectAccess.level === 'admin' ? 'manage' : projectAccess.level;
        return {
          allowed: hasPermission(cappedLevel, requiredLevel),
          level: cappedLevel,
          reason: hasPermission(cappedLevel, requiredLevel) ? undefined : 'Insufficient permission level'
        };
      }
    }

    // QC can view completed tasks for review
    if (user.role === 'qc' && ['completed', 'under_review'].includes(task.status)) {
      return { allowed: hasPermission('view', requiredLevel), level: 'view' };
    }

    // Workers can view open tasks at their level
    if ((user.role === 'employee' || user.role === 'contractor') &&
        task.status === 'open' &&
        task.required_level <= (user.training_level || 1)) {
      return { allowed: hasPermission('view', requiredLevel), level: 'view' };
    }

    // Fall back to role-based default
    const roleLevel = ROLE_TASK_PERMISSIONS[user.role as UserRole] || 'none';
    return {
      allowed: hasPermission(roleLevel, requiredLevel),
      level: roleLevel,
      reason: hasPermission(roleLevel, requiredLevel) ? undefined : 'No access to this task'
    };
  },

  // ============================================================================
  // Project Access Management
  // ============================================================================

  /**
   * Grant a user access to a project
   */
  async grantProjectAccess(
    projectId: string,
    userId: string,
    level: PermissionLevel,
    grantedBy: string,
    expiresAt?: string
  ): Promise<ProjectAccess | null> {
    const { data, error } = await supabase
      .from('project_access')
      .upsert({
        project_id: projectId,
        user_id: userId,
        permission_level: level,
        granted_by: grantedBy,
        granted_at: new Date().toISOString(),
        expires_at: expiresAt
      }, {
        onConflict: 'project_id,user_id'
      })
      .select()
      .single();

    if (error) {
      console.error('Error granting project access:', error);
      return null;
    }

    return data;
  },

  /**
   * Revoke a user's access to a project
   */
  async revokeProjectAccess(projectId: string, userId: string): Promise<boolean> {
    const { error } = await supabase
      .from('project_access')
      .delete()
      .eq('project_id', projectId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error revoking project access:', error);
      return false;
    }

    return true;
  },

  /**
   * Get all users with access to a project
   */
  async getProjectAccessList(projectId: string): Promise<ProjectAccess[]> {
    const { data, error } = await supabase
      .from('project_access')
      .select(`
        *,
        user:users(id, email, full_name, role)
      `)
      .eq('project_id', projectId);

    if (error) {
      console.error('Error fetching project access list:', error);
      return [];
    }

    return data || [];
  },

  // ============================================================================
  // Task Access Management
  // ============================================================================

  /**
   * Grant a user access to a task
   */
  async grantTaskAccess(
    taskId: string,
    userId: string,
    level: PermissionLevel,
    grantedBy: string,
    expiresAt?: string
  ): Promise<TaskAccess | null> {
    const { data, error } = await supabase
      .from('task_access')
      .upsert({
        task_id: taskId,
        user_id: userId,
        permission_level: level,
        granted_by: grantedBy,
        granted_at: new Date().toISOString(),
        expires_at: expiresAt
      }, {
        onConflict: 'task_id,user_id'
      })
      .select()
      .single();

    if (error) {
      console.error('Error granting task access:', error);
      return null;
    }

    return data;
  },

  /**
   * Revoke a user's access to a task
   */
  async revokeTaskAccess(taskId: string, userId: string): Promise<boolean> {
    const { error } = await supabase
      .from('task_access')
      .delete()
      .eq('task_id', taskId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error revoking task access:', error);
      return false;
    }

    return true;
  },

  /**
   * Get all users with access to a task
   */
  async getTaskAccessList(taskId: string): Promise<TaskAccess[]> {
    const { data, error } = await supabase
      .from('task_access')
      .select(`
        *,
        user:users(id, email, full_name, role)
      `)
      .eq('task_id', taskId);

    if (error) {
      console.error('Error fetching task access list:', error);
      return [];
    }

    return data || [];
  },

  // ============================================================================
  // Team Management
  // ============================================================================

  /**
   * Add a user to a project team
   */
  async addTeamMember(
    projectId: string,
    userId: string,
    role: 'member' | 'lead' | 'reviewer',
    addedBy: string
  ): Promise<TeamMember | null> {
    const { data, error } = await supabase
      .from('team_members')
      .upsert({
        project_id: projectId,
        user_id: userId,
        role,
        added_by: addedBy,
        added_at: new Date().toISOString()
      }, {
        onConflict: 'project_id,user_id'
      })
      .select(`
        *,
        user:users(id, email, full_name, role, level)
      `)
      .single();

    if (error) {
      console.error('Error adding team member:', error);
      return null;
    }

    return data;
  },

  /**
   * Remove a user from a project team
   */
  async removeTeamMember(projectId: string, userId: string): Promise<boolean> {
    const { error } = await supabase
      .from('team_members')
      .delete()
      .eq('project_id', projectId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error removing team member:', error);
      return false;
    }

    return true;
  },

  /**
   * Get all team members for a project
   */
  async getTeamMembers(projectId: string): Promise<TeamMember[]> {
    const { data, error } = await supabase
      .from('team_members')
      .select(`
        *,
        user:users(id, email, full_name, role, level)
      `)
      .eq('project_id', projectId)
      .order('added_at', { ascending: false });

    if (error) {
      console.error('Error fetching team members:', error);
      return [];
    }

    return data || [];
  },

  /**
   * Update a team member's role
   */
  async updateTeamMemberRole(
    projectId: string,
    userId: string,
    role: 'member' | 'lead' | 'reviewer'
  ): Promise<TeamMember | null> {
    const { data, error } = await supabase
      .from('team_members')
      .update({ role })
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .select(`
        *,
        user:users(id, email, full_name, role, level)
      `)
      .single();

    if (error) {
      console.error('Error updating team member role:', error);
      return null;
    }

    return data;
  },

  // ============================================================================
  // Bulk Operations
  // ============================================================================

  /**
   * Get all projects a user has access to
   */
  async getUserProjects(userId: string): Promise<string[]> {
    // Get explicit access
    const { data: explicitAccess } = await supabase
      .from('project_access')
      .select('project_id')
      .eq('user_id', userId);

    // Get team memberships
    const { data: teamAccess } = await supabase
      .from('team_members')
      .select('project_id')
      .eq('user_id', userId);

    // Get projects where user is PM or sales
    const { data: roleAccess } = await supabase
      .from('projects')
      .select('id')
      .or(`pm_id.eq.${userId},sales_id.eq.${userId}`);

    const projectIds = new Set<string>();

    explicitAccess?.forEach(a => projectIds.add(a.project_id));
    teamAccess?.forEach(t => projectIds.add(t.project_id));
    roleAccess?.forEach(p => projectIds.add(p.id));

    return Array.from(projectIds);
  },

  /**
   * Get all tasks a user has access to
   */
  async getUserTasks(userId: string): Promise<string[]> {
    // Get explicit access
    const { data: explicitAccess } = await supabase
      .from('task_access')
      .select('task_id')
      .eq('user_id', userId);

    // Get assigned tasks
    const { data: assignedTasks } = await supabase
      .from('tasks')
      .select('id')
      .eq('assignee_id', userId);

    const taskIds = new Set<string>();

    explicitAccess?.forEach(a => taskIds.add(a.task_id));
    assignedTasks?.forEach(t => taskIds.add(t.id));

    return Array.from(taskIds);
  }
};

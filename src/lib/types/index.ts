/**
 * @fileoverview TypeScript Type Definitions for Orbit Platform
 *
 * This module contains all TypeScript interfaces and type definitions
 * that mirror the Supabase PostgreSQL database schema.
 *
 * @module types
 *
 * Type Categories:
 * - Core Enums: UserRole, TaskStatus, ProjectStatus, etc.
 * - Artifact Types: File, GitHub PR, URL attachments
 * - Feature Flags: Organization feature toggles
 * - Entity Types: Organization, User, Project, Task, etc.
 * - Access Control: Permissions, team membership
 * - Analytics: Metrics and trend data structures
 * - Guest Types: Anonymous user demo data
 *
 * Naming Conventions:
 * - Interfaces match database table names (singular)
 * - Enums use PascalCase with string literal unions
 * - Joined fields are optional and marked with comments
 *
 * @example
 * ```typescript
 * import type { User, Task, TaskStatus } from '$lib/types';
 *
 * function filterByStatus(tasks: Task[], status: TaskStatus): Task[] {
 *   return tasks.filter(t => t.status === status);
 * }
 * ```
 */

// ============================================================================
// Core Enums - Database ENUM types
// ============================================================================

/**
 * User roles defining access levels and capabilities.
 * - admin: Full organization access
 * - sales: Project creation, commission tracking
 * - pm: Project management, task creation
 * - qc: Quality control reviews
 * - employee: Task acceptance and completion
 * - contractor: External worker, same as employee
 */
export type UserRole = 'admin' | 'sales' | 'pm' | 'qc' | 'employee' | 'contractor';

// ============================================================================
// Artifact Types - Task Submission Attachments
// ============================================================================

/** Types of artifacts that can be attached to task submissions */
export type ArtifactType = 'file' | 'github_pr' | 'url';

/** Base artifact interface with common fields */
export interface BaseArtifact {
  /** Client-generated UUID */
  id: string;
  /** Discriminator for artifact type */
  type: ArtifactType;
  /** ISO timestamp when artifact was added */
  added_at: string;
  /** Optional notes about the artifact */
  notes?: string;
}

/** File upload artifact stored in Supabase Storage */
export interface FileArtifact extends BaseArtifact {
  type: 'file';
  /** Storage bucket path */
  file_path: string;
  /** Original filename */
  file_name: string;
  /** File size in bytes */
  file_size: number;
  /** MIME type (e.g., 'application/pdf') */
  mime_type: string;
}

/** GitHub Pull Request reference */
export interface GitHubPRArtifact extends BaseArtifact {
  type: 'github_pr';
  /** Full PR URL */
  url: string;
  /** Repository owner */
  owner: string;
  /** Repository name */
  repo: string;
  /** PR number */
  pr_number: number;
  /** Optional metadata fetched from GitHub API */
  metadata?: {
    title: string;
    state: 'open' | 'closed' | 'merged';
    author: string;
  };
}

/** External URL reference */
export interface URLArtifact extends BaseArtifact {
  type: 'url';
  /** External URL */
  url: string;
  /** Optional display title */
  title?: string;
}

/** Union type of all artifact types */
export type Artifact = FileArtifact | GitHubPRArtifact | URLArtifact;

/** Structure for task submission data stored as JSONB */
export interface TaskSubmissionData {
  /** Submission notes/comments */
  notes?: string;
  /** When submission was finalized */
  submitted_at?: string;
  /** Array of attached artifacts */
  artifacts: Artifact[];
  /** When draft was last saved */
  draft_saved_at?: string;
  /** Whether this is a draft or final submission */
  is_draft: boolean;
}
/**
 * Task lifecycle status.
 * Flow: open → assigned → in_progress → completed → under_review → approved/rejected → paid
 */
export type TaskStatus = 'open' | 'assigned' | 'in_progress' | 'completed' | 'under_review' | 'approved' | 'rejected' | 'paid';

/**
 * Project lifecycle status.
 * Flow: draft → pending_pm → active → completed/cancelled
 */
export type ProjectStatus = 'draft' | 'pending_pm' | 'active' | 'completed' | 'cancelled';

/**
 * QC review types with different weights.
 * - ai: Automated ML review (confidence-based)
 * - peer: Review by same-level worker (weight: 1.0)
 * - independent: Review by QC specialist (weight: 2.0)
 */
export type QCReviewType = 'ai' | 'peer' | 'independent';

/**
 * Contract signing status.
 * Flow: draft → pending_signature → active → completed/disputed
 */
export type ContractStatus = 'draft' | 'pending_signature' | 'active' | 'completed' | 'disputed';

// ============================================================================
// Feature Flags Types
// ============================================================================

export type FeatureFlag =
  | 'tasks'                    // Task board and task management
  | 'projects'                 // Project management
  | 'qc_reviews'               // Quality control system
  | 'contracts'                // Contract generation/signing
  | 'payouts'                  // Payout tracking
  | 'achievements'             // Gamification badges
  | 'leaderboard'              // User rankings
  | 'analytics'                // Org-wide analytics
  | 'notifications_page'       // Dedicated notifications page
  | 'external_assignments'     // Assign to external contractors
  | 'salary_mixer'             // User-configurable r value
  | 'file_uploads'             // Submission artifacts/files
  | 'realtime_updates'         // WebSocket subscriptions
  | 'story_points'             // Story point tracking
  | 'urgency_multipliers'      // Task urgency bonuses
  | 'ai_qc_review'             // AI-powered QC confidence scoring
  | 'multi_org';               // Multiple organization support

export interface FeatureFlags {
  tasks: boolean;
  projects: boolean;
  qc_reviews: boolean;
  contracts: boolean;
  payouts: boolean;
  achievements: boolean;
  leaderboard: boolean;
  analytics: boolean;
  notifications_page: boolean;
  external_assignments: boolean;
  salary_mixer: boolean;
  file_uploads: boolean;
  realtime_updates: boolean;
  story_points: boolean;
  urgency_multipliers: boolean;
  ai_qc_review: boolean;
  multi_org: boolean;
}

export type FeatureFlagPreset = 'all_features' | 'standard' | 'minimal' | 'none';

export interface OrganizationSettings {
  feature_flags?: Partial<FeatureFlags>;
  [key: string]: unknown;
}

// ============================================================================
// Organization - Multi-tenant Root Entity
// ============================================================================

/**
 * Organization entity - root of multi-tenant data isolation.
 * Contains payout configuration and feature flag settings.
 */
export interface Organization {
  id: string;
  name: string;
  /** User ID of organization owner (can transfer ownership) */
  owner_id: string | null;
  /** JSON settings including feature_flags */
  settings: OrganizationSettings;
  /** Default salary/task ratio for new users (0.5-0.9) */
  default_r: number;
  /** Allowed range for user r values */
  r_bounds: { min: number; max: number };
  /** QC Shapley beta coefficient (confidence scaling) */
  qc_beta: number;
  /** QC Shapley gamma coefficient (geometric decay) */
  qc_gamma: number;
  /** PM profit share rate */
  pm_x: number;
  /** PM overdraft penalty multiplier */
  pm_overdraft_penalty: number;
  /** Whether external contractor assignments are allowed */
  allow_external_assignment: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * User entity - authenticated platform user.
 * Belongs to one active organization at a time.
 */
export interface User {
  id: string;
  /** Supabase Auth UUID (from auth.users) */
  auth_id: string;
  /** Current active organization */
  org_id: string;
  email: string;
  full_name: string | null;
  /** Role within current organization */
  role: UserRole;
  /** Monthly base salary (for hybrid compensation) */
  base_salary: number | null;
  /** Personal salary/task ratio (Salary Mixer) */
  r: number | null;
  /** Gamification level (affects task access) */
  level: number;
  /** Training completion level */
  training_level: number;
  /** Extensible metadata for gamification stats */
  metadata: UserMetadata;
  created_at: string;
  updated_at: string;
  // Joined fields (populated by API with select joins)
  organization?: Organization;
}

/** User metadata stored as JSONB for extensibility */
export interface UserMetadata {
  current_streak?: number;
  total_tasks_completed?: number;
  qc_pass_rate?: number;
  avg_task_time?: number;
  badges?: string[];
  avatar_path?: string;
  [key: string]: unknown;
}

// ============================================================================
// User Invitations
// ============================================================================

export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'cancelled';

export interface UserInvitation {
  id: string;
  org_id: string;
  email: string;
  role: UserRole;
  invited_by: string;
  token: string;
  status: InvitationStatus;
  expires_at: string;
  created_at: string;
  accepted_at?: string;
  // Joined fields
  organization?: Organization;
  inviter?: User;
}

// ============================================================================
// Multi-Organization Memberships
// ============================================================================

export interface UserOrgMembership {
  id: string;
  user_id: string;
  org_id: string;
  role: UserRole;
  is_primary: boolean;
  joined_at: string;
  // Joined fields
  organization?: Organization;
  user?: User;
}

/**
 * Project entity - container for related tasks.
 * Created by sales, managed by PM.
 */
export interface Project {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  /** Total budget for the project */
  total_value: number;
  /** Optional story points budget */
  story_points_budget: number | null;
  /** Amount spent on completed tasks */
  spent: number;
  /** Sales rep who created the project */
  sales_id: string | null;
  /** Project manager assigned */
  pm_id: string | null;
  deadline: string | null;
  /** Computed days until deadline */
  days_left: number;
  /** Calculated PM bonus (budget - spent) */
  pm_bonus: number;
  created_at: string;
  updated_at: string;
  /** When PM picked up the project */
  picked_up_at: string | null;
  // Joined fields
  sales?: User;
  pm?: User;
  tasks?: Task[];
}

/**
 * Task entity - unit of work within a project.
 * Core entity for the gamified task workflow.
 */
export interface Task {
  id: string;
  org_id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  /** T-shirt sizing / story points */
  story_points: number | null;
  /** Monetary value of task completion */
  dollar_value: number;
  /** User assigned to the task */
  assignee_id: string | null;
  assigned_at: string | null;
  deadline: string | null;
  completed_at: string | null;
  /** Time-based reward modifier (default: 1.0) */
  urgency_multiplier: number;
  /** Minimum user level to accept task (default: 1) */
  required_level: number;
  /** Submission data as JSONB (TaskSubmissionData) */
  submission_data: Record<string, unknown> | null;
  /** Legacy: array of file paths */
  submission_files: string[] | null;
  created_at: string;
  updated_at: string;
  /** Categorization tags */
  tags?: string[];
  /** Order within status column */
  sort_order?: number;
  // External work fields
  /** Whether assigned to external contractor */
  is_external?: boolean;
  external_contractor_name?: string | null;
  external_contractor_email?: string | null;
  /** Token for guest submission access */
  external_submission_token?: string | null;
  /** Associated contract for external work */
  contract_id?: string | null;
  // Joined fields
  project?: Project;
  assignee?: User;
  qc_reviews?: QCReview[];
  contract?: Contract;
}

// External assignment request
export interface ExternalAssignment {
  contractor_name: string;
  contractor_email: string;
  use_guest_link: boolean;
}

// External assignment result
export interface ExternalAssignmentResult {
  success: boolean;
  error?: string;
  contract_id?: string;
  submission_token?: string;
  task_id?: string;
}

/**
 * QC Review entity - quality control assessment of task submission.
 * Contains Shapley value fields for fair payout calculation.
 */
export interface QCReview {
  id: string;
  task_id: string;
  review_type: QCReviewType;
  /** Null for AI reviews */
  reviewer_id: string | null;
  /** Review outcome */
  passed: boolean | null;
  /** AI confidence score (p0) for Shapley calc */
  confidence: number | null;
  feedback: string | null;
  /** Worker baseline value (v0) */
  v0: number | null;
  /** Marginal value contribution (d_k) */
  d_k: number | null;
  /** Which review pass (1, 2, 3...) */
  pass_number: number;
  /** Review weight: peer=1.0, independent=2.0 */
  weight: number;
  created_at: string;
  // Joined fields
  task?: Task;
  reviewer?: User;
}

export interface Contract {
  id: string;
  org_id: string;
  task_id: string | null;
  project_id: string | null;
  template_type: string;
  status: ContractStatus;
  party_a_id: string;
  party_b_id: string | null;
  party_b_email: string | null;
  terms: ContractTerms | null;
  party_a_signed_at: string | null;
  party_b_signed_at: string | null;
  pdf_path: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  party_a?: User;
  party_b?: User;
  task?: Task;
  project?: Project;
}

export interface ContractTerms {
  template?: string;
  sections?: string[];
  party_a_name?: string;
  party_b_name?: string;
  contractor_name?: string;  // Alternative to party_b_name
  task_title?: string;
  task_description?: string;
  compensation?: number;
  timeline?: string;
  [key: string]: unknown;
}

export interface Payout {
  id: string;
  org_id: string;
  user_id: string;
  task_id: string | null;
  project_id: string | null;
  qc_review_id: string | null;
  payout_type: 'task' | 'qc' | 'pm_bonus' | 'sales_commission';
  gross_amount: number;
  deductions: number;
  net_amount: number;
  calculation_details: PayoutCalculation;
  status: 'pending' | 'approved' | 'paid';
  paid_at: string | null;
  created_at: string;
  // Joined fields
  user?: User;
  task?: Task;
  project?: Project;
}

export interface PayoutCalculation {
  formula: string;
  inputs: Record<string, number>;
  [key: string]: unknown;
}

export interface AuditLog {
  id: string;
  org_id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  created_at: string;
}

// Utility types for API responses
export interface PaginatedResponse<T> {
  data: T[];
  count: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// Role capabilities for authorization
export interface RoleCapabilities {
  canViewTasks: boolean;
  canCreateTasks: boolean;
  canAssignTasks: boolean;
  canAcceptTasks: boolean;
  canReviewQC: boolean;
  canViewPayouts: 'self' | 'team' | 'all';
  canCreateProjects: boolean;
  canManageProjects: boolean;
  canViewContracts: 'own' | 'team' | 'all';
  canSignContracts: boolean;
  canAccessSettings: 'own' | 'org';
}

// Shapley value calculation types
export interface ShapleyParams {
  V: number;       // Total task value
  v0: number;      // Worker baseline
  p0: number;      // Model confidence
  beta: number;    // Confidence scaling
  gamma: number;   // Geometric decay
  K: number;       // Number of QC passes
}

export interface SalaryBreakdown {
  base: number;
  tasks: number;
  total: number;
  r: number;
}

// Real-time subscription types
export interface RealtimePayload<T> {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: T;
  old: Partial<T>;
}

// Dashboard statistics
export interface DashboardStats {
  tasksCompleted: number;
  tasksInProgress: number;
  totalEarnings: number;
  pendingPayouts: number;
  qcPassRate: number;
  currentStreak: number;
}

export interface PMDashboardStats extends DashboardStats {
  projectsManaged: number;
  budgetUtilization: number;
  teamSize: number;
  overdraftRisk: number;
}

export interface QCDashboardStats extends DashboardStats {
  reviewsCompleted: number;
  avgConfidence: number;
  issuesFound: number;
  falsePositiveRate: number;
}

export interface SalesDashboardStats {
  projectsSold: number;
  totalSalesValue: number;
  avgProjectValue: number;
  conversionRate: number;
  pendingProjects: number;
  commissionEarned: number;
}

// ============================================================================
// Granular Access Control Types
// ============================================================================

export type PermissionLevel = 'none' | 'view' | 'work' | 'manage' | 'admin';

export interface ProjectAccess {
  id: string;
  project_id: string;
  user_id: string;
  permission_level: PermissionLevel;
  granted_by: string;
  granted_at: string;
  expires_at?: string | null;
  // Joined fields
  project?: Project;
  user?: User;
}

export interface TaskAccess {
  id: string;
  task_id: string;
  user_id: string;
  permission_level: PermissionLevel;
  granted_by: string;
  granted_at: string;
  expires_at?: string | null;
  // Joined fields
  task?: Task;
  user?: User;
}

export interface TeamMember {
  id: string;
  project_id: string;
  user_id: string;
  role: 'member' | 'lead' | 'reviewer';
  added_at: string;
  added_by: string;
  // Joined fields
  user?: User;
  project?: Project;
}

// Permission check result
export interface PermissionCheck {
  allowed: boolean;
  level: PermissionLevel;
  reason?: string;
}

// Analytics types
export interface AnalyticsData {
  period: 'week' | 'month' | 'quarter' | 'year';
  taskMetrics: TaskMetrics;
  payoutMetrics: PayoutMetrics;
  userMetrics: UserMetrics;
  trends: TrendData[];
}

export interface TaskMetrics {
  total: number;
  completed: number;
  inProgress: number;
  pending: number;
  completionRate: number;
  avgCompletionTime: number;
  byStatus: Record<TaskStatus, number>;
}

export interface PayoutMetrics {
  totalPaid: number;
  pendingPayouts: number;
  avgPayout: number;
  byType: Record<string, number>;
}

export interface UserMetrics {
  totalActive: number;
  topPerformers: User[];
  avgTasksPerUser: number;
  avgEarningsPerUser: number;
}

export interface TrendData {
  date: string;
  tasks: number;
  payouts: number;
  users: number;
}

// ============================================================================
// Guest Project Types (for anonymous users)
// ============================================================================

export interface GuestTask {
  id: string;
  title: string;
  description?: string;
  dollar_value: number;
  story_points?: number;
  tags: string[];
  sort_order: number;
  status: 'open';
}

export interface GuestProject {
  id: string;
  session_id: string;
  name: string;
  description?: string;
  tasks: GuestTask[];
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  expires_at: string;
}

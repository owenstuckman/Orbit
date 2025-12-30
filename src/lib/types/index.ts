// Core database types matching Supabase schema

export type UserRole = 'admin' | 'sales' | 'pm' | 'qc' | 'employee' | 'contractor';
export type TaskStatus = 'open' | 'assigned' | 'in_progress' | 'completed' | 'under_review' | 'approved' | 'rejected' | 'paid';
export type ProjectStatus = 'draft' | 'pending_pm' | 'active' | 'completed' | 'cancelled';
export type QCReviewType = 'ai' | 'peer' | 'independent';
export type ContractStatus = 'draft' | 'pending_signature' | 'active' | 'completed' | 'disputed';

export interface Organization {
  id: string;
  name: string;
  settings: Record<string, unknown>;
  default_r: number;
  r_bounds: { min: number; max: number };
  qc_beta: number;
  qc_gamma: number;
  pm_x: number;
  pm_overdraft_penalty: number;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  auth_id: string;
  org_id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  base_salary: number | null;
  r: number | null;
  level: number;
  training_level: number;
  metadata: UserMetadata;
  created_at: string;
  updated_at: string;
  // Joined fields
  organization?: Organization;
}

export interface UserMetadata {
  current_streak?: number;
  total_tasks_completed?: number;
  qc_pass_rate?: number;
  avg_task_time?: number;
  badges?: string[];
  [key: string]: unknown;
}

export interface Project {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  total_value: number;
  story_points_budget: number | null;
  spent: number;
  sales_id: string | null;
  pm_id: string | null;
  deadline: string | null;
  days_left: number;
  pm_bonus: number;
  created_at: string;
  updated_at: string;
  picked_up_at: string | null;
  // Joined fields
  sales?: User;
  pm?: User;
  tasks?: Task[];
}

export interface Task {
  id: string;
  org_id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  story_points: number | null;
  dollar_value: number;
  assignee_id: string | null;
  assigned_at: string | null;
  deadline: string | null;
  completed_at: string | null;
  urgency_multiplier: number;
  required_level: number;
  submission_data: Record<string, unknown> | null;
  submission_files: string[] | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  project?: Project;
  assignee?: User;
  qc_reviews?: QCReview[];
}

export interface QCReview {
  id: string;
  task_id: string;
  review_type: QCReviewType;
  reviewer_id: string | null;
  passed: boolean | null;
  confidence: number | null;
  feedback: string | null;
  v0: number | null;
  d_k: number | null;
  pass_number: number;
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
  terms: ContractTerms;
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
  template: string;
  sections: string[];
  party_a_name: string;
  party_b_name: string;
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

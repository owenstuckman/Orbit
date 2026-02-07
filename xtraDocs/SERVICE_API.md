# Service API Reference

Complete reference for all service modules in the Orbit platform. These services form the API layer between Svelte components/stores and the Supabase backend.

**Source Directory**: `src/lib/services/`

---

## Table of Contents

- [api.ts - Main API Layer](#apits---main-api-layer)
  - [usersApi](#usersapi)
  - [projectsApi](#projectsapi)
  - [tasksApi](#tasksapi)
  - [qcApi](#qcapi)
  - [contractsApi](#contractsapi)
  - [payoutsApi](#payoutsapi)
  - [organizationsApi](#organizationsapi)
  - [guestProjectsApi](#guestprojectsapi)
- [supabase.ts - Client & Helpers](#supabasets---client--helpers)
- [access.ts - Permission Checking](#accessts---permission-checking)
- [ml.ts - ML Model Integration](#mlts---ml-model-integration)
- [analytics.ts - Analytics & Metrics](#analyticsts---analytics--metrics)
- [artifacts.ts - Submission Artifacts](#artifactsts---submission-artifacts)
- [contractPdf.ts - PDF Generation](#contractpdfts---pdf-generation)
- [export.ts - Data Export](#exportts---data-export)

---

## api.ts - Main API Layer

**File**: `src/lib/services/api.ts`
**Import**: `import { usersApi, projectsApi, tasksApi, qcApi, contractsApi, payoutsApi, organizationsApi, guestProjectsApi } from '$lib/services/api';`

All database operations use Supabase client with RLS (Row Level Security) enforcement. Multi-tenant isolation is handled via `org_id` foreign keys.

### Internal Types

#### `QueryFilters`

Used across all `list()` methods for flexible filtering:

| Field | Type | Description |
|-------|------|-------------|
| `eq` | `Record<string, unknown>` | Equality filters (`WHERE col = value`) |
| `in` | `Record<string, unknown[]>` | IN filters (`WHERE col IN (values)`) |
| `gte` | `Record<string, unknown>` | Greater-than-or-equal filters |
| `lte` | `Record<string, unknown>` | Less-than-or-equal filters |
| `like` | `Record<string, string>` | Case-insensitive ILIKE search |
| `order` | `{ column: string; ascending?: boolean }` | ORDER BY configuration |
| `limit` | `number` | LIMIT clause |
| `offset` | `number` | OFFSET for pagination (uses Supabase range) |

---

### usersApi

User management, invitations, multi-org memberships, and role management.

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `getCurrent()` | _(none)_ | `Promise<User \| null>` | Gets the currently authenticated user with their organization. Fetches auth user, then loads profile and org separately to handle RLS edge cases. |
| `getById(id)` | `id: string` | `Promise<User \| null>` | Fetches a user by database UUID with organization join. |
| `list(filters?)` | `filters?: QueryFilters` | `Promise<User[]>` | Lists users with optional filtering. Scoped to current organization by RLS. |
| `update(id, updates)` | `id: string, updates: Partial<User>` | `Promise<User \| null>` | Updates a user's profile data. |
| `updateSalaryMix(id, r)` | `id: string, r: number` | `Promise<User \| null>` | Updates the salary/task compensation ratio. `r` is typically between 0.5 and 0.9. Formula: `salary = base * r + task_value * (1 - r)`. |
| `invite(email, role)` | `email: string, role: UserRole` | `Promise<UserInvitation \| null>` | Creates a 7-day invitation with a 6-char alphanumeric token. Returns invitation with org and inviter details. |
| `listInvitations()` | _(none)_ | `Promise<UserInvitation[]>` | Lists all invitations for the current user's organization (pending, accepted, cancelled). |
| `cancelInvitation(inviteId)` | `inviteId: string` | `Promise<boolean>` | Cancels a pending invitation. |
| `acceptInvitation(inviteCode)` | `inviteCode: string` | `Promise<{ success: boolean; org_id?: string; role?: string; error?: string }>` | Accepts an invitation via RPC. For existing users joining a new org. |
| `listUserOrganizations()` | _(none)_ | `Promise<UserOrgMembership[]>` | Lists all organizations the current user belongs to. Primary org is listed first. |
| `switchOrganization(orgId)` | `orgId: string` | `Promise<boolean>` | Switches the current user's active organization by updating their `org_id`. |
| `updateRole(userId, newRole)` | `userId: string, newRole: UserRole` | `Promise<{ success: boolean; error?: string }>` | Updates a user's role via RPC with permission checks. Owners can change any role; admins can change any role except other admins. |
| `isOrgOwner()` | _(none)_ | `Promise<boolean>` | Checks if the current user is the organization owner. |

---

### projectsApi

Project lifecycle management, PM assignment, and bonus calculations.

**Lifecycle**: draft --> pending_pm --> active --> completed / cancelled

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `getById(id)` | `id: string` | `Promise<Project \| null>` | Fetches a project by ID with sales rep, PM, and all tasks included. |
| `list(filters?)` | `filters?: QueryFilters` | `Promise<Project[]>` | Lists projects with optional filtering. Includes sales rep and PM name joins. |
| `create(project)` | `project: Partial<Project>` | `Promise<Project \| null>` | Creates a new project. Typically called by sales role with budget and client info. |
| `update(id, updates)` | `id: string, updates: Partial<Project>` | `Promise<Project \| null>` | Updates project fields. |
| `assignPM(projectId, pmId)` | `projectId: string, pmId: string` | `Promise<Project \| null>` | Assigns a PM to a project. Sets status to `active` and records `picked_up_at` timestamp for sales commission decay calculation. |
| `calculatePMBonus(projectId)` | `projectId: string` | `Promise<number>` | Calculates PM bonus via edge function. Formula: `(budget - spent) * X - overdraft * (penalty * X) + bonus`. |

---

### tasksApi

Core task workflow management including creation, assignment, submission, and external contractor support.

**Lifecycle**: open --> assigned --> in_progress --> completed --> under_review --> approved / rejected --> paid

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `getById(id)` | `id: string` | `Promise<Task \| null>` | Fetches a task by ID with project, assignee, and all QC reviews (with reviewers). |
| `list(filters?)` | `filters?: QueryFilters` | `Promise<Task[]>` | Lists tasks with assignee info and QC review summaries. |
| `listByProject(projectId)` | `projectId: string` | `Promise<Task[]>` | Lists all tasks for a specific project. Convenience wrapper around `list()`. |
| `listByAssignee(userId)` | `userId: string` | `Promise<Task[]>` | Lists all tasks assigned to a specific user. Convenience wrapper around `list()`. |
| `listAvailable(userLevel)` | `userLevel: number` | `Promise<Task[]>` | Lists open tasks available for the user's level. Filters `status=open` and `required_level <= userLevel`. Ordered by `urgency_multiplier` (highest first). |
| `create(task)` | `task: Partial<Task>` | `Promise<Task \| null>` | Creates a new task. Typically called by PM or admin roles. |
| `update(id, updates)` | `id: string, updates: Partial<Task>` | `Promise<Task \| null>` | Updates task fields. |
| `accept(taskId, userId)` | `taskId: string, userId: string` | `Promise<Task \| null>` | Accepts an open task via RPC (`accept_task`). Validates user level, sets status to `assigned`, records timestamp. Falls back to direct update if RPC unavailable. |
| `submit(taskId, submissionData, files?)` | `taskId: string, submissionData: Record<string, unknown>, files?: string[]` | `Promise<Task \| null>` | Submits completed work. Sets status to `completed`, records `completed_at`, stores submission data/files. Automatically triggers AI QC review via edge function. |
| `calculatePayout(taskId)` | `taskId: string` | `Promise<{ payout: number; details: unknown }>` | Calculates employee payout via edge function. Uses hybrid formula: `salary * r + task_value * (1 - r)`. |
| `assignExternal(taskId, assignment)` | `taskId: string, assignment: ExternalAssignment` | `Promise<ExternalAssignmentResult>` | Assigns a task to an external contractor via RPC. Auto-generates a contract and optionally a guest submission link. |
| `getBySubmissionToken(token)` | `token: string` | `Promise<Task \| null>` | Gets task details by guest submission token for external contractors. RPC returns task as JSONB. |
| `submitExternal(token, submissionData)` | `token: string, submissionData: TaskSubmissionData` | `Promise<{ success: boolean; error?: string; task_id?: string }>` | Submits work for an externally assigned task using a guest submission token. |
| `reorderTasks(taskIds, status)` | `taskIds: string[], status: TaskStatus` | `Promise<boolean>` | Reorders tasks within a status column by updating `sort_order` via RPC. |

---

### qcApi

Quality control review workflow with Shapley value calculations.

**QC Flow**: Task submitted --> AI review --> Human review (if needed) --> Approved/Rejected

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `getById(id)` | `id: string` | `Promise<QCReview \| null>` | Fetches a QC review by ID with task and reviewer details. |
| `listPending()` | _(none)_ | `Promise<Task[]>` | Lists tasks pending QC review (status `completed` or `under_review`). Ordered by `completed_at` ascending (FIFO). Includes assignee and existing reviews. |
| `create(review)` | `review: Partial<QCReview>` | `Promise<QCReview \| null>` | Creates a new QC review record. Automatically updates the task status to `approved` or `rejected` based on the review result. |
| `submitReview(taskId, reviewerId, passed, feedback, reviewType?)` | `taskId: string, reviewerId: string, passed: boolean, feedback: string, reviewType?: 'peer' \| 'independent'` | `Promise<QCReview \| null>` | Submits a human QC review. Auto-calculates `pass_number` from existing reviews. Sets `weight` (peer=1.0, independent=2.0). Computes simplified Shapley values (`v0 = dollar_value * 0.7`, `d_k = dollar_value * 0.1`); actual payout calculation uses edge function. Default `reviewType` is `'independent'`. |

---

### contractsApi

Contract generation, e-signatures, PDF management, and external contractor support.

**Quick Contract Flow**: Generate PDF --> Party A signs --> Party B signs --> Contract active

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `getById(id)` | `id: string` | `Promise<Contract \| null>` | Fetches a contract by ID with party A, party B, task, and project details. |
| `list(filters?)` | `filters?: QueryFilters` | `Promise<Contract[]>` | Lists contracts with party names, task, and project info. |
| `create(templateType, partyAId, terms, options?)` | `templateType: string, partyAId: string, terms: Record<string, unknown>, options?: { taskId?: string; projectId?: string; partyBId?: string; partyBEmail?: string }` | `Promise<Contract \| null>` | Creates a new contract via edge function (`generate-contract`). Generates PDF and stores in Supabase Storage. |
| `sign(contractId, partyType)` | `contractId: string, partyType: 'a' \| 'b'` | `Promise<Contract \| null>` | Signs a contract as party A or B. Sets the corresponding `_signed_at` timestamp. Automatically activates the contract when both parties have signed. |
| `uploadPdf(contractId, pdfBlob, filename)` | `contractId: string, pdfBlob: Blob, filename: string` | `Promise<string \| null>` | Uploads a PDF blob to Supabase Storage (`contracts` bucket). Path format: `org_id/contract_id/filename`. Updates contract record with `pdf_path`. Returns the storage path. |
| `getPdfUrl(pdfPath)` | `pdfPath: string` | `string` | Gets the public URL for a contract PDF from storage. Synchronous. |
| `downloadPdf(pdfPath)` | `pdfPath: string` | `Promise<Blob \| null>` | Downloads a contract PDF blob from storage. |
| `getBySubmissionToken(token)` | `token: string` | `Promise<Contract \| null>` | Gets contract by submission token for external contractors. No authentication required. |
| `signExternal(token)` | `token: string` | `Promise<{ success: boolean; error?: string; contract_id?: string; is_active?: boolean }>` | Signs a contract as an external contractor using a submission token. No authentication required. Returns whether the contract is now active (both signed). |

---

### payoutsApi

Payout tracking and summaries for all compensation types.

**Payout Types**: `task_completion`, `qc_review`, `pm_bonus`, `sales_commission`
**Status Flow**: pending --> paid (or cancelled)

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `getById(id)` | `id: string` | `Promise<Payout \| null>` | Fetches a payout by ID with user, task, and project details. |
| `listByUser(userId, filters?)` | `userId: string, filters?: QueryFilters` | `Promise<Payout[]>` | Lists payouts for a specific user. Ordered by `created_at` descending by default. Includes task info. |
| `getSummary(userId, period?)` | `userId: string, period?: 'week' \| 'month' \| 'year'` | `Promise<{ total: number; pending: number; byType: Record<string, number> }>` | Gets aggregated payout summary. Calculates totals for paid and pending amounts with breakdown by payout type. |

---

### organizationsApi

Organization settings, payout parameters, and feature flags management.

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `getCurrent()` | _(none)_ | `Promise<Organization \| null>` | Gets the current user's active organization. |
| `updateSettings(orgId, settings)` | `orgId: string, settings: Partial<Organization>` | `Promise<Organization \| null>` | Updates organization-level settings (payout parameters, branding, etc.). |
| `updateFeatureFlags(orgId, flags)` | `orgId: string, flags: Partial<FeatureFlags>` | `Promise<Organization \| null>` | Updates feature flags by merging provided flags with existing settings. Fetches current settings first to avoid overwriting. |
| `applyFeatureFlagPreset(orgId, preset)` | `orgId: string, preset: FeatureFlagPreset` | `Promise<Organization \| null>` | Applies a feature flag preset (`all_features`, `standard`, `minimal`, `none`). Uses `getPreset()` from `featureFlags` config. |

---

### guestProjectsApi

Trial/demo project management for unauthenticated users. Uses localStorage session ID for persistence.

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `getCurrent()` | _(none)_ | `Promise<GuestProject \| null>` | Gets the current guest project for this browser session. |
| `save(project)` | `project: Partial<GuestProject>` | `Promise<GuestProject \| null>` | Creates or updates a guest project. Auto-detects existing project and performs upsert. |
| `addTask(task)` | `task: Omit<GuestTask, 'id' \| 'sort_order'>` | `Promise<GuestProject \| null>` | Adds a task to the guest project. Creates the project if it does not exist. Auto-generates UUID and sort_order. |
| `updateTask(taskId, updates)` | `taskId: string, updates: Partial<GuestTask>` | `Promise<GuestProject \| null>` | Updates a task in the guest project by ID. |
| `removeTask(taskId)` | `taskId: string` | `Promise<GuestProject \| null>` | Removes a task from the guest project. |
| `importToOrganization(orgId, projectId?)` | `orgId: string, projectId?: string` | `Promise<{ success: boolean; project_id?: string; error?: string }>` | Imports guest project into a real organization via RPC after user signs up. Clears the guest session on success. |
| `clear()` | _(none)_ | `Promise<void>` | Deletes the guest project from the database and clears the localStorage session. |

---

## supabase.ts - Client & Helpers

**File**: `src/lib/services/supabase.ts`
**Import**: `import { supabase, auth, storage, functions, subscribeToTable, getSession, getCurrentUser } from '$lib/services/supabase';`

Core Supabase client initialization and helper modules. All other services depend on this module.

### Exports

#### `supabase` (SupabaseClient)

The primary Supabase client instance. Configured with:
- `auth.persistSession`: Only in browser (not SSR)
- `auth.autoRefreshToken`: Only in browser
- `auth.detectSessionInUrl`: Only in browser
- `realtime.eventsPerSecond`: 10

Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

#### `getSession()`

| Parameters | Returns | Description |
|-----------|---------|-------------|
| _(none)_ | `Promise<Session \| null>` | Gets the current auth session from Supabase. |

#### `getCurrentUser()`

| Parameters | Returns | Description |
|-----------|---------|-------------|
| _(none)_ | `Promise<User \| null>` | Gets the current Supabase Auth user (not the app's `users` table). |

#### `auth` Object

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `signUp(email, password, metadata?)` | `email: string, password: string, metadata?: Record<string, unknown>` | `Promise<{ data, error }>` | Signs up a new user with optional metadata. |
| `signIn(email, password)` | `email: string, password: string` | `Promise<{ data, error }>` | Signs in with email and password. |
| `signOut()` | _(none)_ | `Promise<{ error }>` | Signs out the current user. |
| `resetPassword(email)` | `email: string` | `Promise<{ data, error }>` | Sends a password reset email. |
| `updatePassword(newPassword)` | `newPassword: string` | `Promise<{ data, error }>` | Updates the current user's password. |
| `onAuthStateChange(callback)` | `callback: (event: string, session: unknown) => void` | `Subscription` | Listens for auth state changes (sign-in, sign-out, token refresh). |

#### `storage` Object

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `uploadFile(bucket, path, file, options?)` | `bucket: string, path: string, file: File, options?: { contentType?: string; upsert?: boolean }` | `Promise<{ data, error }>` | Uploads a file to Supabase Storage. Default `upsert` is `false`. |
| `downloadFile(bucket, path)` | `bucket: string, path: string` | `Promise<{ data: Blob, error }>` | Downloads a file from storage as a Blob. |
| `getPublicUrl(bucket, path)` | `bucket: string, path: string` | `string` | Gets the public URL for a file. Synchronous. |
| `deleteFile(bucket, paths)` | `bucket: string, paths: string[]` | `Promise<{ data, error }>` | Deletes one or more files from storage. |

#### `functions` Object

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `invoke<T>(functionName, options?)` | `functionName: string, options?: { body?: Record<string, unknown>; headers?: Record<string, string> }` | `Promise<{ data: T \| null; error: Error \| null }>` | Invokes a Supabase Edge Function with optional body and headers. Generic return type. |

#### `subscribeToTable<T>()`

| Parameters | Returns | Description |
|-----------|---------|-------------|
| `table: string, filter?: { column: string; value: string }, callback?: (payload: { eventType: string; new: T; old: Partial<T> }) => void` | `{ subscription, unsubscribe: () => void }` | Subscribes to real-time PostgreSQL changes on a table. Optional column-value filter. Returns an object with an `unsubscribe()` cleanup function. |

---

## access.ts - Permission Checking

**File**: `src/lib/services/access.ts`
**Import**: `import { accessApi } from '$lib/services/access';`

Hierarchical permission system with role-based defaults, explicit access grants, team memberships, and project/task ownership. Permission levels from lowest to highest: `none` < `view` < `work` < `manage` < `admin`.

### Permission Defaults

**Project permissions by role**: admin=`admin`, sales=`view`, pm=`manage`, qc=`view`, employee=`none`, contractor=`none`

**Task permissions by role**: admin=`admin`, sales=`none`, pm=`manage`, qc=`view`, employee=`work`, contractor=`work`

### accessApi

#### Permission Checking

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `checkProjectAccess(userId, projectId, requiredLevel?)` | `userId: string, projectId: string, requiredLevel?: PermissionLevel` | `Promise<PermissionCheck>` | Checks user's permission for a project. Evaluates in order: admin role, org membership, explicit access grants (with expiry), team membership (lead=`manage`, member=`work`), sales/PM ownership, then role defaults. Default `requiredLevel` is `'view'`. |
| `checkTaskAccess(userId, taskId, requiredLevel?)` | `userId: string, taskId: string, requiredLevel?: PermissionLevel` | `Promise<PermissionCheck>` | Checks user's permission for a task. Evaluates: admin role, org membership, explicit task access, assignee status, inherited project access (capped at `manage`), QC role for completed tasks, worker role for open tasks at level. Default `requiredLevel` is `'view'`. |

#### Project Access Management

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `grantProjectAccess(projectId, userId, level, grantedBy, expiresAt?)` | `projectId: string, userId: string, level: PermissionLevel, grantedBy: string, expiresAt?: string` | `Promise<ProjectAccess \| null>` | Grants explicit project access. Upserts on `(project_id, user_id)` conflict. Optional expiration date. |
| `revokeProjectAccess(projectId, userId)` | `projectId: string, userId: string` | `Promise<boolean>` | Revokes a user's explicit project access. |
| `getProjectAccessList(projectId)` | `projectId: string` | `Promise<ProjectAccess[]>` | Gets all users with explicit access to a project, including user details. |

#### Task Access Management

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `grantTaskAccess(taskId, userId, level, grantedBy, expiresAt?)` | `taskId: string, userId: string, level: PermissionLevel, grantedBy: string, expiresAt?: string` | `Promise<TaskAccess \| null>` | Grants explicit task access. Upserts on `(task_id, user_id)` conflict. Optional expiration date. |
| `revokeTaskAccess(taskId, userId)` | `taskId: string, userId: string` | `Promise<boolean>` | Revokes a user's explicit task access. |
| `getTaskAccessList(taskId)` | `taskId: string` | `Promise<TaskAccess[]>` | Gets all users with explicit access to a task, including user details. |

#### Team Management

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `addTeamMember(projectId, userId, role, addedBy)` | `projectId: string, userId: string, role: 'member' \| 'lead' \| 'reviewer', addedBy: string` | `Promise<TeamMember \| null>` | Adds a user to a project team. Upserts on conflict. Returns member with user details. |
| `removeTeamMember(projectId, userId)` | `projectId: string, userId: string` | `Promise<boolean>` | Removes a user from a project team. |
| `getTeamMembers(projectId)` | `projectId: string` | `Promise<TeamMember[]>` | Gets all team members for a project with user details. Ordered by `added_at` descending. |
| `updateTeamMemberRole(projectId, userId, role)` | `projectId: string, userId: string, role: 'member' \| 'lead' \| 'reviewer'` | `Promise<TeamMember \| null>` | Updates a team member's role. Returns member with user details. |

#### Bulk Operations

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `getUserProjects(userId)` | `userId: string` | `Promise<string[]>` | Gets all project IDs a user has access to. Aggregates: explicit access, team memberships, and PM/sales role ownership. |
| `getUserTasks(userId)` | `userId: string` | `Promise<string[]>` | Gets all task IDs a user has access to. Aggregates: explicit access and assigned tasks. |

---

## ml.ts - ML Model Integration

**File**: `src/lib/services/ml.ts`
**Import**: `import { mlApi } from '$lib/services/ml';`

Communicates with the external ML model server for QC confidence scoring, task complexity analysis, and quality assessments. All methods gracefully fall back to default values when the ML service is unavailable.

**Environment variables**: `VITE_ML_API_URL` (default: `http://localhost:8000`), `VITE_ML_API_KEY`

### Exported Types

| Type | Description |
|------|-------------|
| `MLSubmissionRequest` | Input for submission confidence: `task_id`, `submission_data` (notes + artifacts), `task_context` (title, description, requirements, story_points). |
| `MLSubmissionResponse` | AI confidence output: `pass_probability` (0-1, becomes p0 in Shapley), `confidence_breakdown` (completeness, quality, requirements_met), `summary`, `issues[]`, `recommendations[]`. |
| `MLTaskComplexityResponse` | Complexity analysis: `suggested_story_points`, `complexity_score`, `reasoning`. |
| `MLQualityAssessmentResponse` | Quality assessment: `overall_quality`, `areas_of_concern[]`, `strengths[]`, `comparison_to_similar`. |

### mlApi

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `isConfigured()` | _(none)_ | `boolean` | Checks if the ML service is configured (URL is not the default localhost). |
| `getSubmissionConfidence(request)` | `request: MLSubmissionRequest` | `Promise<MLSubmissionResponse>` | Gets AI confidence score for a task submission. The `pass_probability` becomes `p0` in Shapley calculations. Falls back to `pass_probability: 0.8` if unavailable. |
| `analyzeTaskComplexity(task)` | `task: { title: string; description: string }` | `Promise<MLTaskComplexityResponse>` | Analyzes task requirements for complexity scoring. Used to suggest story points during task creation. Falls back to `suggested_story_points: 5`. |
| `getQualityAssessment(taskId)` | `taskId: string` | `Promise<MLQualityAssessmentResponse>` | Gets quality assessment for QC decision support. Called when a QC reviewer views a task. Falls back to `overall_quality: 0.8`. |
| `getDefaultConfidence()` | _(none)_ | `number` | Returns the default p0 value (0.8) for when ML is unavailable. Used as fallback in Shapley calculations. |

---

## analytics.ts - Analytics & Metrics

**File**: `src/lib/services/analytics.ts`
**Import**: `import { analyticsApi } from '$lib/services/analytics';`

Organization and user analytics with time-period filtering. Supports `week`, `month`, `quarter`, and `year` periods.

### analyticsApi

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `getTaskMetrics(orgId, period)` | `orgId: string, period: 'week' \| 'month' \| 'quarter' \| 'year'` | `Promise<TaskMetrics>` | Calculates task metrics: total count, completed/in-progress/pending counts, completion rate (%), average completion time (hours), and status breakdown. |
| `getPayoutMetrics(orgId, period)` | `orgId: string, period: Period` | `Promise<PayoutMetrics>` | Calculates payout metrics: total paid, pending payouts, average payout amount, and breakdown by payout type. |
| `getUserMetrics(orgId, period)` | `orgId: string, period: Period` | `Promise<UserMetrics>` | Calculates user metrics: active user count, top 5 performers (by tasks completed), average tasks per user, average earnings per user. |
| `getTrends(orgId, period)` | `orgId: string, period: Period` | `Promise<TrendData[]>` | Generates time-series trend data for charts. Interval: week=daily (7 points), month=weekly (4 points), quarter=biweekly (6 points), year=monthly (12 points). Each point has `date`, `tasks`, `payouts`, `users`. |
| `getFullAnalytics(orgId, period)` | `orgId: string, period: Period` | `Promise<AnalyticsData>` | Fetches all analytics in parallel (task, payout, user metrics, and trends). Returns combined `AnalyticsData` object. |
| `getUserAnalytics(userId, period)` | `userId: string, period: Period` | `Promise<{ tasksAssigned, tasksCompleted, completionRate, totalEarnings, pendingEarnings, avgTaskValue }>` | Calculates personal analytics for a specific user: assigned/completed task counts, completion rate, total/pending earnings, average task value. |

---

## artifacts.ts - Submission Artifacts

**File**: `src/lib/services/artifacts.ts`
**Import**: `import { artifactsService } from '$lib/services/artifacts';`

Manages submission artifacts (files, GitHub PRs, URLs) for task submissions. Handles file uploads to Supabase Storage and artifact metadata.

**Max file size**: 10 MB

### artifactsService

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `generateId()` | _(none)_ | `string` | Generates a unique UUID for an artifact. |
| `validateFile(file)` | `file: File` | `{ valid: boolean; error?: string }` | Validates file size against 10 MB limit. |
| `uploadFileArtifact(file, orgId, userId, taskId)` | `file: File, orgId: string, userId: string, taskId: string` | `Promise<FileArtifact>` | Uploads a file to the `submissions` bucket and creates a `FileArtifact`. Path: `orgId/userId/taskId/timestamp-filename`. Throws on validation failure or upload error. |
| `parseGitHubPRUrl(url)` | `url: string` | `{ owner: string; repo: string; pr_number: number } \| null` | Parses a GitHub PR URL to extract owner, repo, and PR number. Supports various URL formats. |
| `createGitHubPRArtifact(url, metadata?)` | `url: string, metadata?: GitHubPRArtifact['metadata']` | `GitHubPRArtifact \| null` | Creates a GitHub PR artifact from a URL. Returns null if URL is unparseable. |
| `isValidUrl(url)` | `url: string` | `boolean` | Validates a URL format. Auto-prepends `https://` if missing. |
| `createURLArtifact(url, title?)` | `url: string, title?: string` | `URLArtifact \| null` | Creates a generic URL artifact. Returns null if URL is invalid. |
| `saveDraft(taskId, artifacts, notes?)` | `taskId: string, artifacts: Artifact[], notes?: string` | `Promise<boolean>` | Saves draft artifacts to a task's `submission_data` field. Marks as draft with timestamp. |
| `deleteFileArtifact(artifact)` | `artifact: FileArtifact` | `Promise<boolean>` | Deletes a file artifact from the `submissions` storage bucket. |
| `extractFilePaths(artifacts)` | `artifacts: Artifact[]` | `string[]` | Extracts file paths from an array of artifacts (filters to file-type only). For the `submission_files` field. |
| `getFileExtension(filename)` | `filename: string` | `string` | Gets the lowercase file extension from a filename. |
| `isImage(artifact)` | `artifact: FileArtifact` | `boolean` | Checks if a file artifact is an image (jpeg, png, gif, webp, svg+xml). |
| `formatFileSize(bytes)` | `bytes: number` | `string` | Formats byte count for display (e.g., `1.5 MB`). |

---

## contractPdf.ts - PDF Generation

**File**: `src/lib/services/contractPdf.ts`
**Import**: `import { generateContractorAgreement, generateWorkOrder, downloadPdf } from '$lib/services/contractPdf';`

Client-side PDF generation for contractor agreements and work orders using `jsPDF`. Documents are generated in-browser as Blobs.

### Exported Types

| Type | Fields | Description |
|------|--------|-------------|
| `ContractData` | `contractId: string, contractorName: string, contractorEmail: string, task: Task, organization: Organization, assignedBy: User, createdAt: Date` | Input data for PDF generation. |
| `GeneratedContract` | `pdf: Blob, filename: string` | Output with PDF blob and suggested filename. |

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `generateContractorAgreement(data)` | `data: ContractData` | `GeneratedContract` | Generates a multi-page professional contractor agreement PDF (A4 portrait). Includes: header with contract ID/date, parties section, scope of work (task details), compensation with urgency bonus, timeline/deadline, 6 standard terms and conditions (IP, confidentiality, quality, termination, etc.), signature blocks for both parties, and footer. Filename: `contract-{id}-{name}.pdf`. |
| `generateWorkOrder(data)` | `data: ContractData` | `GeneratedContract` | Generates a simple single-page work order PDF (A4 portrait). Includes: header, client/contractor info, task details box, compensation/deadline. Shorter format for quick assignments. Filename: `work-order-{id}.pdf`. |
| `downloadPdf(contract)` | `contract: GeneratedContract` | `void` | Downloads a generated PDF to the user's device. Creates a temporary object URL and triggers a browser download, then cleans up. |

---

## export.ts - Data Export

**File**: `src/lib/services/export.ts`
**Import**: `import { exportToCSV, exportToPDF, exportToJSON, exportTasks, exportPayouts, exportUsers, exportProjects } from '$lib/services/export';`

Data export service supporting CSV, PDF (via browser print dialog), and JSON formats. Includes pre-configured export functions for common entity types.

### Exported Types

| Type | Fields | Description |
|------|--------|-------------|
| `TaskExport` | `id, title, status, priority, assignee, project, base_value, created_at, completed_at?` | Typed shape for task export data. |
| `PayoutExport` | `id, user_name, amount, type, status, created_at, paid_at?` | Typed shape for payout export data. |
| `UserExport` | `id, full_name, email, role, level, created_at` | Typed shape for user export data. |
| `ProjectExport` | `id, name, status, total_value, pm_name, sales_name, created_at, deadline?` | Typed shape for project export data. |

### Generic Export Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `exportToCSV<T>(data, options)` | `data: T[], options: { filename: string; headers?: string[]; includeHeaders?: boolean }` | `void` | Converts array of objects to CSV and triggers download. Auto-detects headers from first object if not provided. Escapes special characters. Formats header names from `snake_case`/`camelCase` to Title Case. |
| `exportToPDF<T>(data, columns, options)` | `data: T[], columns: { key: string; label: string; format?: (value: unknown) => string }[], options: { title: string; subtitle?: string; orientation?: 'portrait' \| 'landscape' }` | `void` | Generates a printable HTML table document and opens the browser print dialog. Supports custom column formatters, portrait/landscape orientation, and includes metadata (record count, generation date). |
| `exportToJSON<T>(data, filename)` | `data: T[], filename: string` | `void` | Exports data as formatted JSON (2-space indent) and triggers download. |

### Pre-configured Export Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `exportTasks(tasks, format)` | `tasks: TaskExport[], format: 'csv' \| 'pdf'` | `void` | Exports tasks in CSV (all fields) or PDF (title, status, priority, assignee, value, created date). Filename: `tasks-export-{date}`. |
| `exportPayouts(payouts, format)` | `payouts: PayoutExport[], format: 'csv' \| 'pdf'` | `void` | Exports payouts in CSV or PDF format with currency formatting. Filename: `payouts-export-{date}`. |
| `exportUsers(users, format)` | `users: UserExport[], format: 'csv' \| 'pdf'` | `void` | Exports users in CSV or PDF format. Filename: `users-export-{date}`. |
| `exportProjects(projects, format)` | `projects: ProjectExport[], format: 'csv' \| 'pdf'` | `void` | Exports projects in CSV or PDF (landscape orientation) format with currency formatting. Filename: `projects-export-{date}`. |

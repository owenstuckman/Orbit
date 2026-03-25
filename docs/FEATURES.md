# Orbit — Completed Features

Everything that is built, deployed, and functional.

---

## Platform Core

### Tech Stack
- **Frontend**: SvelteKit 2.0, Svelte 4.2, TypeScript 5.3, Tailwind CSS 3.4
- **Backend**: Supabase (PostgreSQL, Auth, Storage, Edge Functions, Realtime)
- **Charts**: Chart.js with svelte-chartjs
- **PDF**: jsPDF for client-side contract generation
- **License**: GPL-3.0-or-later

### Database
- 17 tables, all with Row Level Security (RLS) enabled
- 47 migrations tracked
- 30 PostgreSQL functions (11 core RPCs + helpers)
- Multi-tenant isolation via `org_id` foreign keys

### API Layer (`src/lib/services/api.ts`)
8 fully typed API objects with CRUD + domain-specific operations:
- `usersApi` — User management, invitations, org memberships, role management
- `projectsApi` — Project CRUD, PM assignment, bonus calculations
- `tasksApi` — Task lifecycle, assignments, submissions, external work
- `qcApi` — Quality control reviews, Shapley value calculations
- `contractsApi` — Contract generation, e-signatures, PDF management
- `payoutsApi` — Payout tracking, summaries by period
- `organizationsApi` — Organization settings, feature flags
- `guestProjectsApi` — Trial/demo projects for unauthenticated users

---

## Authentication & Authorization

### Two-Stage Registration
- Email/password sign-up via Supabase Auth
- Email verification with redirect to profile completion
- Path A: Create new organization (becomes admin)
- Path B: Join existing organization via invite code
- Feature preset selection during org creation (all, standard, minimal, none)
- Guest project import on registration

### Role-Based Access Control
6 roles with granular capabilities:

| Capability | admin | sales | pm | qc | employee | contractor |
|---|---|---|---|---|---|---|
| View tasks | Yes | No | Yes | Yes | Yes | Yes |
| Create tasks | Yes | No | Yes | No | No | No |
| Assign tasks | Yes | No | Yes | No | No | No |
| Accept tasks | No | No | No | No | Yes | Yes |
| Review QC | Yes | No | No | Yes | No | No |
| View payouts | all | self | team | self | self | self |
| Create projects | Yes | Yes | No | No | No | No |
| Manage projects | Yes | No | Yes | No | No | No |

- `ROLE_CAPABILITIES` object in `src/lib/stores/auth.ts`
- `capabilities` derived store for reactive permission checks
- Fine-grained service-level checks in `src/lib/services/access.ts`
- Backend enforcement via RLS policies on all tables

---

## Task Management

### Full Task Lifecycle
`open → assigned → in_progress → completed → under_review → approved/rejected → paid`

- Task board with filtering (status, project, urgency, level, deadline)
- Task detail page with full metadata display
- Accept task (validates user level meets `required_level`)
- Start work (assigned → in_progress)
- Submit work with artifacts (in_progress → completed → under_review)
- QC review with approve/reject (under_review → approved/rejected)
- Rejected tasks can be reworked and resubmitted

### Task Properties
- Dollar value with urgency multiplier
- Story points (T-shirt sizing: XS/S/M/L/XL/XXL)
- Required level gate (1-5)
- Tags for categorization
- Deadline with countdown display
- Urgency bonus presets (+10%, +20%, +50%)

### Submission Artifacts
- File upload via drag-and-drop (`FileUploadZone`)
- GitHub PR link parsing (owner/repo/PR number extraction)
- URL attachments with optional titles
- Draft saving with auto-save indicator
- Artifact list with grouped display by type
- Files stored in Supabase Storage (`submissions/{org_id}/{task_id}/`)

---

## AI / ML Integration

### Edge Function: `qc-ai-review` (v6, deployed)
Three actions routed through a single Supabase edge function:

1. **Confidence scoring** (`action: 'confidence'`) — Default action on task submission
   - Fetches task + submission data from DB
   - Calls ML API at `/api/v1/review/confidence`
   - Creates `qc_reviews` record (review_type='ai', weight=0)
   - Stores JSON feedback: `{summary, confidence_breakdown, issues, recommendations}`
   - Transitions task status to `under_review`
   - Falls back to p0=0.8 if ML unavailable

2. **Complexity analysis** (`action: 'complexity'`) — Used by TaskCreateModal "AI Suggest"
   - Calls ML API at `/api/v1/task/complexity`
   - Returns suggested story points + reasoning
   - No database write

3. **Quality assessment** (`action: 'quality'`) — Used by QC page on task select
   - Calls ML API at `/api/v1/review/quality/{task_id}`
   - Returns overall quality, strengths, areas of concern
   - No database write

### Frontend ML Client (`src/lib/services/ml.ts`)
- All requests proxied through edge function (credentials stay server-side)
- `mlApi.getSubmissionConfidence()` — Confidence scoring
- `mlApi.analyzeTaskComplexity()` — Story point suggestions
- `mlApi.getQualityAssessment()` — QC decision support
- Graceful fallback defaults on all methods

### QC Page AI Features (gated by `ai_qc_review` flag)
- AI confidence % badge in task queue list
- Confidence breakdown progress bars (completeness, quality, requirements met)
- Issues list with bullet points
- Recommendations list
- Quality assessment panel with strengths/concerns
- Comparison to similar tasks percentile

### TaskCreateModal AI Feature
- "AI Suggest" button for story points (gated by `ai_qc_review` flag)
- Displays reasoning from ML complexity analysis

---

## QC Review System

### Shapley Value Calculations (`src/lib/utils/payout.ts`)
- First-pass marginal: `d_1 = β * p_0 * V`
- Geometric decay: `d_k = d_1 * γ^(k-1)`
- Budget normalization when marginals exceed task value
- Expected QC contribution formula
- Effective sample size for weighted reviews
- Pass number correctly excludes AI reviews (human pass 1 = first human review)

### QC Review Page (`/qc`)
- Review queue with FIFO ordering (oldest first)
- Task detail panel with description, submission data, file attachments
- Previous reviews display (AI and human)
- Potential payout preview based on Shapley calculation
- Approve/reject with required feedback on rejection
- Route guard: only QC reviewers and admins

### Review Types & Weights
- AI review: weight=0 (informational only)
- Peer review: weight=1.0
- Independent review: weight=2.0

---

## Payout System

### Employee Compensation
- Hybrid salary + task-based: `salary = base * r + task_value * (1 - r)`
- Configurable salary/task ratio (r) per employee
- Organization-level bounds on r (default: 0.5-0.9)
- Salary Mixer UI in settings page

### PM Profit Share
- `payout = (budget - spent) * X - overdraft * (penalty * X) + bonus`
- PM pickup bonus based on project wait time
- Overdraft penalty multiplier (default 1.5x)

### Sales Commission
- Base commission with decay over waiting period
- PM bonus contribution from unclaimed commission

### Payout Infrastructure
- `payout-calculator` edge function (deployed, active)
- Client-side calculation utilities in `payout.ts`
- Payout tracking page at `/payouts`

---

## External Contractor Flow

### Assignment
- PM/Admin assigns task externally via `ExternalAssignmentModal`
- `assign_task_externally` RPC creates assignment + contract record
- Guest submission token generated for external access

### Contract E-Signature
- PDF generation via jsPDF (`contractPdf.ts`)
- `generate-contract` edge function (deployed, active)
- Dual-signature flow: Party A (employer) → Party B (contractor)
- External signing route: `/contract/[token]`
- Contract status: draft → pending_signature → active → completed

### External Submission
- Guest submission portal: `/submit/[token]`
- URL and GitHub PR artifact support (no file upload for guests)
- `submit_external_work` RPC handles submission
- Triggers AI QC review automatically (same as internal submissions)

---

## Gamification

### XP & Levels
- Server-side XP calculation: `award_task_xp`, `calculate_task_xp`, `calculate_level_from_xp` RPCs
- Level-based task access gates (required_level 1-5)
- XP display on task cards

### Badges & Achievements
- 98 badge definitions across 5 requirement types:
  - `tasks_completed`, `first_pass_approvals`, `current_streak`/`longest_streak`, `level`, `total_earnings`
- Achievement page at `/achievements`
- Badge components: `AchievementBadge`, `AchievementsGrid`
- `user_badges` and `achievements` tables

### Leaderboard
- User rankings at `/leaderboard`
- Gated by `leaderboard` feature flag

### Streaks
- Current streak and longest streak tracking
- Streak-based badge unlocks

---

## Notifications

### In-App Notifications
- Database-backed persistent notifications (`notifications` table)
- Real-time subscription via Supabase WebSocket
- Toast messages for ephemeral feedback
- Notification dropdown in app header
- Dedicated notifications page at `/notifications`
- Read/unread tracking with mark-as-read
- Database triggers: `notify_qc_review`, `notify_task_assigned`

### Notification Types
- `task_assigned`, `task_completed`
- `qc_review`, `qc_approved`, `qc_rejected`
- `payout_ready`
- `contract_signed`
- `achievement_earned`, `level_up`

---

## Feature Flags

### 17 Configurable Features
**Core** (6): tasks, projects, qc_reviews, contracts, payouts, file_uploads
**Gamification** (2): achievements, leaderboard
**Advanced** (6): analytics, notifications_page, external_assignments, salary_mixer, story_points, urgency_multipliers
**Integrations** (3): realtime_updates, ai_qc_review, multi_org

### 4 Presets
- `all_features` — Everything (17/17)
- `standard` — Recommended default (15/17, excludes AI QC + multi-org)
- `minimal` — Basic task/project management (7/17)
- `none` — Start from scratch (0/17)

### Implementation
- Stored in `organizations.settings.feature_flags` (JSONB)
- Reactive store: `$features.analytics`, `$featureFlags.salary_mixer`
- Admin toggle UI: `FeatureFlagsPanel`
- Registration preset picker: `FeaturePresetSelector`
- `isFeatureEnabled()` helper for service-layer checks

---

## Analytics & Export

### Analytics Service (`src/lib/services/analytics.ts`)
- Task metrics: completion rates, status breakdown, average time
- Payout metrics: by type and period
- User metrics: top performers, activity
- Trend data for Chart.js visualization
- Period-based filtering: week, month, quarter, year
- Analytics page at `/analytics` (admin/PM only)

### Export Service (`src/lib/services/export.ts`)
- CSV export (tasks, payouts, users, projects)
- PDF export (via browser print dialog)
- JSON export
- Custom column formatting

---

## Admin

### Organization Management
- Organization settings page at `/admin/settings`
- Payout parameter configuration (qc_beta, qc_gamma, pm_x, overdraft_penalty, r_bounds)
- Feature flags panel

### User Management
- User list and role management at `/admin/users`
- Invite users with role assignment
- Role change via `update_user_role` RPC
- Invite confirmation modal

### Audit Log
- Audit log viewer at `/admin/audit`
- `log_audit_entry` RPC for server-side logging
- `audit_log` table with RLS

---

## Real-Time

- `subscribeToTable()` helper in `src/lib/services/supabase.ts`
- WebSocket-based live updates for tasks, notifications
- Gated by `realtime_updates` feature flag
- Notification store subscribes to real-time updates on mount

---

## Routes (20+)

### Authenticated (`(app)/`)
- `/dashboard` — Role-aware dashboard
- `/tasks` — Task board with filters
- `/tasks/[id]` — Task detail + submission
- `/projects` — Project list
- `/projects/[id]` — Project management
- `/qc` — QC review queue
- `/payouts` — Payout history
- `/contracts` — Contract management
- `/contracts/[id]` — Contract detail
- `/analytics` — Organization analytics
- `/notifications` — Notification center
- `/achievements` — Badge display
- `/leaderboard` — User rankings
- `/profile` — User profile
- `/settings` — User settings (salary mixer, dark mode)
- `/admin` — Admin dashboard
- `/admin/users` — User management
- `/admin/settings` — Organization settings
- `/admin/audit` — Audit log

### Public
- `/auth/register`, `/auth/login`, `/auth/reset-password`, `/auth/update-password`
- `/auth/complete-registration`
- `/contract/[token]` — External contract signing
- `/submit/[token]` — External task submission
- `/try` — Guest/demo experience

---

## Edge Functions (5 deployed)

| Slug | Purpose | Status |
|------|---------|--------|
| `qc-ai-review` | AI confidence, complexity, quality scoring | v6, active |
| `payout-calculator` | Employee/PM payout calculations | active |
| `generate-contract` | Server-side contract PDF generation | active |
| `contract-generator` | Contract generation | active |
| `contract-sing` | Contract signing | active |

---

## Database Functions (30)

### Core RPCs (11)
`register_user_and_org`, `accept_organization_invite`, `accept_task`, `assign_task_externally`, `get_task_by_submission_token`, `submit_external_work`, `get_contract_by_submission_token`, `sign_contract_external`, `update_user_role`, `reorder_tasks`, `import_guest_project`

### Gamification (3)
`award_task_xp`, `calculate_task_xp`, `calculate_level_from_xp`

### Helpers & Triggers (16)
`current_user_id`, `current_user_org_id`, `current_user_role`, `get_current_user_id`, `get_my_org_id`, `get_user_org_id`, `get_user_context`, `get_feature_flag_preset`, `set_default_feature_flags`, `is_org_owner`, `user_can_access_contract`, `user_can_review_task`, `log_audit_entry`, `notify_qc_review`, `notify_task_assigned`, `switch_organization`

---

## Bug Fixes (2026-03-24 Session)

1. **Edge function feedback format** — Now stores JSON `{summary, confidence_breakdown, issues, recommendations}` instead of plain text, enabling QC page breakdown display
2. **Task status transition** — Edge function updates task to `under_review` after AI review (was staying as `completed`)
3. **Pass number calculation** — `qcApi.submitReview()` excludes AI reviews from count (first human = pass 1, not pass 2)
4. **External submission AI trigger** — `submitExternal()` now calls `qc-ai-review` edge function (was missing)
5. **Edge function name mismatch** — Fixed `'calculate-payout'` → `'payout-calculator'` to match deployed slug

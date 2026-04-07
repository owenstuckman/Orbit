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
9 fully typed API objects with CRUD + domain-specific operations:
- `usersApi` — User management, invitations, org memberships, role management
- `projectsApi` — Project CRUD, PM assignment, bonus calculations
- `tasksApi` — Task lifecycle, assignments, submissions, external work
- `qcApi` — Quality control reviews, Shapley value calculations
- `contractTemplatesApi` — Contract template CRUD, default management
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

### Task Board Features
- Kanban board view with draggable columns
- List view with sortable table
- **Drag-and-drop reordering** via `DraggableTaskList` (HTML5 native drag API, `flip` animation, visual insertion indicator, `canReorder` for PM/Admin)
- **Keyboard navigation** with arrow keys, Enter to open, shortcuts for all actions
- **Bulk operations** (PM/Admin): multi-select mode, bulk status change, bulk delete
- Real-time live updates via WebSocket subscription
- Search with `/` shortcut focus
- Advanced filters (status, project, urgency, level, deadline)
- Export to CSV/PDF/JSON

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

### ML Model Deployed and Live
- FastAPI service running at `https://orbitqcml.onrender.com` (Render, Docker)
- `ML_API_URL` and `ML_API_KEY` Supabase secrets set; edge function returns real confidence scores
- 3 endpoints: `/api/v1/review/confidence` (default), `/api/v1/task/complexity`, `/api/v1/review/quality/{task_id}`
- Edge function falls back to p0=0.8 if ML API unreachable
- Deployment reference: `docs/ML_MODEL_HOSTING.md`

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

### Auto-Payout on Approval
- QC approval automatically creates payout records via `payoutsApi.create()`:
  - **Task payout** for assignee: `dollar_value * urgency_multiplier`
  - **QC payout** for reviewer: Shapley `d_k` value
- Both payouts created as `pending` status
- Email notification sent to payout recipient

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
- `payoutsApi.create()` — Creates payout record with email notification (fire-and-forget)
- Auto-creates task payout + QC reviewer payout on QC approval (`qcApi.create()`)
- `payout-calculator` edge function (called from `api.ts`, source not in repo)
- Client-side calculation utilities in `payout.ts`
- Payout tracking page at `/payouts` with:
  - Type filter (task, qc, salary, bonus, commission)
  - Status filter (pending, approved, paid)
  - Period-based summaries (week/month/year)
  - CSV export

---

## External Contractor Flow

### Assignment
- PM/Admin assigns task externally via `ExternalAssignmentModal`
- `assign_task_externally` RPC creates assignment + contract record
- Guest submission token generated for external access

### Contract E-Signature
- PDF generation via jsPDF client-side (`contractPdf.ts`) — no edge function needed
- Upload to Supabase Storage at `contracts/{org_id}/{contract_id}/{filename}.pdf`
- Dual-signature flow: Party A (employer) → Party B (contractor)
- External signing route: `/contract/[token]`
- Contract status: draft → pending_signature → active → completed

### Custom Contract Templates
- `contract_templates` table with RLS: org-scoped read for all roles, admin-only write
- Templates define sections (`{title, body, order}`) and variables (`{key, label, required, default}`)
- `{{variable}}` substitution rendered at PDF generation time
- `generateFromTemplate()` in `contractPdf.ts` — jsPDF layout with variable substitution
- `validateTemplateVariables()` — validates required variables before generation
- `contractTemplatesApi` — `list()`, `getById()`, `getDefault()`, `create()`, `update()`, `delete()`, `setDefault()`
- Admin UI: `/admin/contract-templates` — list view + `ContractTemplateEditor` component (sections, variables, inline token insert, reorder, default toggle)
- `contracts.template_id` FK — nullable for backwards compat with legacy task-based contracts
- `contracts/[id]` PDF generation: checks `template_id` first, falls back to legacy `generateContractorAgreement()`
- "New Contract" button on contracts page (admin/pm/sales) — template picker + variable fill-in form
- Org-level default template per type (unique partial index: `WHERE is_default = true`)

### Contracts Page PDF Loading
- Contract list loads PDFs directly from Storage bucket (source of truth)
- Lists `contracts/{org_id}/` folders → each folder is a contract ID
- Merges Storage file paths with DB records when accessible
- Falls back to storage-only entry if DB RLS blocks the record
- Supports View (inline iframe) and Download for all found PDFs

### External Submission
- Guest submission portal: `/submit/[token]`
- URL and GitHub PR artifact support (no file upload for guests)
- `submit_external_work` RPC handles submission
- Triggers AI QC review automatically (same as internal submissions)

---

## Gamification

### XP & Levels
- **Database trigger `award_task_xp`** fires on task status → `approved`:
  - Calculates XP: `base_xp (story_points * 10) * urgency_multiplier * level_bonus`
  - Updates `users.xp`, `users.level` via `calculate_level_from_xp()`
  - Stores `total_xp`, `last_xp_gain` in user metadata
  - Creates `achievement_earned` notification with XP amount
  - Creates `level_up` notification when level increases
- Level-based task access gates (required_level 1-5)
- XP display on task cards and dashboard

### Badges & Achievements
- 20 badge definitions across 5 categories (Tasks, Quality, Streaks, Levels, Earnings)
- Requirement types: `tasks_completed`, `first_pass_approvals`, `current_streak`/`longest_streak`, `level`, `total_earnings`
- 4 tiers: bronze, silver, gold, platinum
- `checkAndAwardBadges()` called automatically on QC approval (fire-and-forget)
- Badge XP rewards on earn (50-2500 XP depending on tier)
- Achievement page at `/achievements` with progress tracking
- Badge components: `AchievementBadge`, `AchievementsGrid`
- `user_badges` table for persistence

### Leaderboard
- User rankings at `/leaderboard` sorted by XP
- Real earnings from `payoutsApi.getSummary()` (not estimates)
- Period filtering: week/month/all time (reactive)
- Top 3 podium + full rankings table
- Current user rank highlight card
- Gated by `leaderboard` feature flag

### Streaks
- **Database trigger** increments streak on task approval:
  - Compares `last_task_completed_at` to current date
  - If ≤1 day gap: increment `current_streak`
  - If >1 day: reset to 1
  - Updates `longest_streak` via `GREATEST()`
- Streak-based badge unlocks (3, 7, 30, 100 days)

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
- Reactive store: `$featureFlags.salary_mixer`
- Admin toggle UI: `FeatureFlagsPanel`
- Registration preset picker: `FeaturePresetSelector`
- `isFeatureEnabled()` helper for service-layer checks

### Flag Gating Coverage
**Sidebar-gated** (9): tasks, projects, qc_reviews, contracts, payouts, achievements, leaderboard, analytics, notifications_page
**Component-gated** (4): ai_qc_review (QC page + TaskCreateModal), story_points (TaskCard), urgency_multipliers (TaskCard), salary_mixer (Settings page)
**Always-on** (4): file_uploads, external_assignments, realtime_updates, multi_org (gating deferred — these are core infrastructure)

---

## Analytics & Export

### Analytics Service (`src/lib/services/analytics.ts`)
- Task metrics: completion rates, status breakdown, average time
- Payout metrics: by type and period
- User metrics: top performers, activity
- Chart.js Line chart for task/payout trends (dual Y-axis)
- Chart.js Doughnut chart for task status distribution
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
- Audit log viewer at `/admin/audit` with real database queries
- Search by action/entity, filter by action type and entity type
- Paginated (50 per page) with working prev/next navigation
- Diff display showing old_data → new_data changes
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
- `/settings` — User settings (salary mixer, theme picker)
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

## Edge Functions

| Slug | Purpose | Status |
|------|---------|--------|
| `qc-ai-review` | AI confidence, complexity, quality scoring | Deployed. ML API live at `orbitqcml.onrender.com` |
| `send-email` | Transactional emails via Resend API | Deployed. `RESEND_API_KEY` + `EMAIL_FROM` secrets set |

### Email Service (`src/lib/services/email.ts`)
- `emailService.sendInvitation()` — Organization invite with code + link
- `emailService.sendExternalAssignment()` — Contractor task notification with submission link
- `emailService.sendQCResult()` — Approved/rejected notification with feedback
- `emailService.sendPayoutReady()` — Payout notification with amount
- `emailService.sendContractReady()` — Contract signing link for contractors
- All methods fire-and-forget (never block the calling flow)
- Wired into: `usersApi.invite()`, `tasksApi.assignExternal()`, `qcApi.submitReview()`, `payoutsApi.create()`

---

## Database Functions (30)

### Core RPCs (11)
`register_user_and_org`, `accept_organization_invite`, `accept_task`, `assign_task_externally`, `get_task_by_submission_token`, `submit_external_work`, `get_contract_by_submission_token`, `sign_contract_external`, `update_user_role`, `reorder_tasks`, `import_guest_project`

### Gamification (3)
`award_task_xp`, `calculate_task_xp`, `calculate_level_from_xp`

### Helpers & Triggers (16)
`current_user_id`, `current_user_org_id`, `current_user_role`, `get_current_user_id`, `get_my_org_id`, `get_user_org_id`, `get_user_context`, `get_feature_flag_preset`, `set_default_feature_flags`, `is_org_owner`, `user_can_access_contract`, `user_can_review_task`, `log_audit_entry`, `notify_qc_review`, `notify_task_assigned`, `switch_organization`

---

## Keyboard Shortcuts

### Task Board Shortcuts
- `←` / `→` — Move between board columns
- `↑` / `↓` — Move between tasks in a column
- `Enter` — Open selected task
- `Escape` — Deselect / close modal
- `n` — New task (PM/Admin only)
- `/` — Focus search input
- `f` — Toggle filters panel
- `r` — Refresh tasks
- `b` — Toggle board/list view
- `a` — Accept selected task (Employee/Contractor)
- `?` — Show keyboard shortcuts help

### Global Shortcuts
- `Ctrl+K` / `Cmd+K` — Open global search
- `g` then `d` — Go to Dashboard
- `g` then `t` — Go to Tasks
- `g` then `p` — Go to Projects
- `g` then `s` — Go to Settings

Shortcuts help modal: `KeyboardShortcutsHelp` component. Visible column highlight on keyboard nav.

---

## Global Search

Command palette-style search across all entities, triggered with `Ctrl+K` / `Cmd+K`.

- Searches: tasks, projects, users, contracts
- Debounced queries (250ms) to Supabase with `ilike` matching
- Keyboard navigation: arrow keys to select, Enter to navigate, Escape to close
- Results show type icon, title, subtitle, and category badge
- `GlobalSearch` component in `$lib/components/common/`
- Search button with shortcut hint in top bar

---

## Onboarding

Role-specific onboarding tutorials shown on first login.

### Guide Content by Role
- **Employee** (4 steps): Pick up tasks → Submit work → Earn payouts → Level up
- **Contractor** (4 steps): Accept assignments → Sign contract → Submit work → Track earnings
- **PM** (4 steps): Manage projects → Create tasks → Profit share → Analytics
- **QC** (4 steps): Review queue → Approve/reject → Shapley payouts → AI insights
- **Sales** (3 steps): Create projects → Commission → Contracts
- **Admin** (4 steps): Manage team → Configure org → Analytics → Audit log

### Implementation
- `OnboardingGuide` component with step carousel
- Completion stored in `localStorage` per user ID
- Action buttons link directly to relevant pages
- Skip/dismiss always available
- Triggered automatically in app layout after first login

---

## Slack Webhook Integration

### Webhook Service (`src/lib/services/webhooks.ts`)
- `slackWebhook.notifyTaskCreated()` — New task with value, urgency, level
- `slackWebhook.notifyTaskSubmitted()` — Task submitted for QC review
- `slackWebhook.notifyTaskApproved()` — Task approved with AI confidence
- `slackWebhook.notifyTaskRejected()` — Task rejected with feedback excerpt
- `slackWebhook.notifyProjectCreated()` — New project with budget
- `slackWebhook.notifyLevelUp()` — User level-up celebration
- `slackWebhook.notifyMemberJoined()` — New team member with role
- `slackWebhook.sendCustom()` — Custom Slack Block Kit messages

### Configuration
- Webhook URL stored in `organizations.settings.slack_webhook_url`
- Admin settings UI: Slack Integration section with URL input
- `slackWebhook.isConfigured()` check before sending
- Fire-and-forget: never blocks calling flow
- Rich Slack Block Kit formatting with headers, fields, sections

---

## Bulk Task Operations

### Multi-Select Mode
- Toggle button in task board toolbar (PM/Admin only)
- Selection count badge shows number of selected tasks
- Click tasks to toggle selection while in bulk mode

### Bulk Actions
- **Mark Assigned** — Set all selected tasks to `assigned` status
- **Mark In Progress** — Set all selected tasks to `in_progress` status
- **Approve** — Set all selected tasks to `approved` status
- **Delete** — Delete all selected tasks (with confirmation dialog)
- **Clear** — Deselect all tasks

### Implementation
- Bulk actions bar appears when tasks are selected
- Each operation iterates through selected IDs with individual API calls
- Success count toast notification after completion
- Auto-refreshes task list after bulk operation

---

## Reusable UI Components (`src/lib/components/common/`)

- **LoadingSpinner** — Configurable spinner (sm/md/lg) with optional message
- **LoadingSkeleton** — Content-aware skeleton loaders in 3 variants: card grid, table rows, list items. Used in tasks, projects, payouts pages
- **EmptyState** — Icon + title + description + optional CTA button/link. Used for empty data displays
- **OrganizationSwitcher** — Multi-org context switcher in sidebar
- **NotificationDropdown** — Header notification bell with real-time badge
- **ExportButton** — CSV/PDF/JSON export trigger
- **RoleBadge** — Color-coded role display
- **TagInput** — Tag entry with autocomplete
- **GlobalSearch** — Command palette (Ctrl+K) for cross-entity search
- **KeyboardShortcutsHelp** — Modal showing all available keyboard shortcuts
- **OnboardingGuide** — Role-specific step-by-step onboarding carousel

---

## Mobile Responsiveness

- **Sidebar**: Collapsible on mobile (< lg breakpoint), slide-in with overlay backdrop
- **Top bar**: Sticky header with hamburger menu on mobile
- **Task board**: Snap-scroll horizontally on mobile (72px cards → 80px on sm+)
- **Dashboard**: Header badges wrap on small screens, stat grids collapse to 2-col on mobile
- **Payouts**: Summary cards stack to 1-col on mobile, payout rows stack vertically on xs
- **Tables**: All data tables wrapped in `overflow-x-auto` for horizontal scroll
- **Modals**: Max-width with `mx-4` margin on mobile for consistent padding
- **Forms**: Full-width inputs, grid layouts collapse to single column on mobile

## Capacitor Native App

Native plugin layer at `src/lib/services/capacitor/` — all plugins no-op on web.

### Push Notifications (`@capacitor/push-notifications`)
- `initializePushNotifications(userId)` — requests permission, registers with FCM/APNs, stores device token in `users.metadata.push_token`
- `notifyDevice(userId, title, body, data?)` — calls `send-push` edge function → FCM HTTP API
- `supabase/functions/send-push/index.ts` — looks up push token, fires FCM; skips silently if `FCM_SERVER_KEY` not set
- Foreground notifications shown as in-app toasts; tapped notifications navigate via `data.route`
- Initialized from `(app)/+layout.svelte` after user loads

### Biometric Auth (`@aparajita/capacitor-biometric-auth` + `@capacitor/preferences`)
- `enrollBiometrics(session)` — stores Supabase session tokens in secure native storage after biometric confirmation
- `authenticateWithBiometrics()` — prompts Face ID / fingerprint; restores session via `supabase.auth.setSession()`; clears enrollment if tokens expired
- Login page: auto-attempts biometric on mount (if enrolled); offers enroll after successful password login
- `clearBiometricSession()` — removes tokens (called on sign out)

### File Access (`@capacitor/camera`)
- `pickFromCamera(source)` — opens camera or photo gallery; returns `File` blob
- `pickFileNative()` — opens native file picker (via `CameraSource.Files`)
- `FileUploadZone.svelte` — detects `isNative()` on mount; shows Camera / Gallery / Files buttons on native; drops through to standard drag-and-drop on web

### Deep Links (`@capacitor/app`)
- `initializeDeepLinks()` — handles cold-start URL and `appUrlOpen` events
- Routes `/contract/[token]`, `/submit/[token]`, `/auth/*` to SvelteKit `goto`
- `capacitor.config.ts` — `androidScheme: https`, `hostname: owenstuckman.lol`

### Build
- `npm run build:mobile` — `MOBILE_BUILD=true vite build && npx cap sync`
- Packages: `@capacitor/core`, `@capacitor/cli` (dev), `@capacitor/ios`, `@capacitor/android` (dev)
- `capacitor.config.ts` — appId `com.orbit.app`, webDir `build`
- **Remaining** (human): `npx cap add ios/android`, platform permissions in Info.plist / AndroidManifest, app icons, FCM server key secret, Supabase auth redirect URL

---

## Multi-Language Support (i18n)

### Infrastructure
- **Library**: `@inlang/paraglide-sveltekit` — compile-time i18n, zero runtime overhead, tree-shaken per locale
- `project.inlang/settings.json` configures source language (`en`) and supported tags (`en`, `es`)
- Vite plugin (`@inlang/paraglide-sveltekit/vite`) auto-compiles messages on dev/build
- Generated runtime in `src/lib/paraglide/` (messages.js, runtime.js)
- `src/lib/i18n.ts` — `i18n` instance used by `<ParaglideJS>` root layout wrapper

### Translations
- `messages/en.json` — ~120 English keys (auth, tasks, dashboard, QC, settings, common labels)
- `messages/es.json` — Full Spanish translation of all keys
- Interpolated messages for dynamic values: `level_indicator({ level })`, `bulk_selected({ count })`, `welcome_back({ name })`

### Pages Instrumented
- `src/routes/auth/login/+page.svelte` — all strings including biometric UI
- `src/routes/(app)/tasks/+page.svelte` — board header, stat labels, filter/bulk controls, status names
- `src/lib/components/tasks/TaskCreateModal.svelte` — all form labels and action buttons

### Locale Store (`src/lib/stores/locale.ts`)
- `resolveLocale(userLocale, orgLocale)` — fallback chain: user pref → org default → browser Accept-Language → `'en'`
- `applyLocale(locale)` — calls Paraglide `setLanguageTag()` + persists to `localStorage` (`orbit_locale`)
- `initializeLocale()` — called from app layout after auth loads
- Root layout seeds locale from `localStorage` immediately on mount (for pre-auth pages, no flash)

### Database
- `users.locale` column (text, default `'en'`) — personal language preference
- `organizations.settings.default_locale` (JSONB key) — org-level default

### Settings UI
- Language button-group picker in `/settings` Appearance section — saves to `users.locale` via `usersApi.update()`
- Org default locale selector in `/admin/settings` — saved alongside other org settings

---

## Theming

### Multi-Theme Support
- **Dracula** dark theme (default dark): vibrant purple/green/cyan accent palette
- **Light** theme: clean default
- **System** theme: follows OS light/dark preference
- Theme picker in `/settings` Appearance section — card-style selector with icon, label, description

### Implementation
- CSS custom properties (`--color-*`) define all color scales in `src/app.css`
- Tailwind config references vars via helper: `rgb(var(--color-*) / <alpha-value>)`
- `:root` block — light mode (standard Tailwind values)
- `.dark` block — Dracula-inspired overrides for all 11 color scales
- `src/lib/stores/theme.ts` — `ThemeName` type: `'light' | 'dracula' | 'system'`
- `theme` store: `setTheme()`, `toggle()`, `cycle()`, `initialize()`
- `isDarkTheme` and `resolvedTheme` derived stores
- `data-theme` attribute on `document.documentElement` for future per-theme CSS overrides
- Theme persisted to `localStorage` under key `orbit_theme`
- Migrates legacy `'dark'` value → `'dracula'` automatically
- Theme dropdown in top bar (header) for quick switching

### Adding New Themes
Future themes (e.g. `midnight`, `solarized`) can be added by:
1. Adding a new entry to `THEMES` array in `theme.ts`
2. Adding a `[data-theme="name"]` CSS block in `app.css`
3. No component changes required — all Tailwind classes resolve via CSS vars

---

## Documentation

- `CLAUDE.md` — AI assistant context (architecture, patterns, conventions)
- `CONTRIBUTING.md` — Setup, conventions, PR guidelines, role-based testing
- `docs/FORMULAS.md` — Payout calculation formulas for all roles
- `docs/FEATURES.md` — This file: all completed features
- `docs/TODO.md` — Remaining tasks
- `docs/OPS_RUNBOOK.md` — **Human steps runbook**: SMTP setup, ML model deployment, verification
- `docs/DATA_FLOWS.md` — Multi-step workflow diagrams
- `docs/ML_INTEGRATION.md` — ML model integration points and API schemas
- `docs/ML_MODEL_HOSTING.md` — Guide for deploying the QC ML model
- `docs/SUPABASE_STORAGE.md` — Storage bucket conventions
- `docs/USER_REGISTRATION_FLOW.md` — Two-stage registration with email verification
- `docs/SMTP_SETUP.md` — Email provider setup, templates, edge function guide (code reference; see `OPS_RUNBOOK.md` for deployment state)
- `docs/email-templates/` — Branded HTML source for auth email templates (recovery, invite, email-change); also in `supabase/templates/`

---

## Production Configuration (2026-04-03 Session)

1. **SMTP** — Supabase Auth custom SMTP configured via management API (`smtp.resend.com:465`, user=`resend`). All email subjects updated to Orbit branding.
2. **Auth email templates** — Orbit-branded HTML for recovery, invite, and email-change pushed via `supabase config push`. Templates live in `supabase/templates/`, referenced from `supabase/config.toml`.
3. **ML API live** — `orbitqcml.onrender.com` returning real confidence breakdowns. `ML_API_URL` + `ML_API_KEY` Supabase secrets set. Edge function redeployed.
4. **DNS** — DKIM already set (`resend._domainkey.owenstuckman.lol`). SPF + DMARC pending (add at Porkbun — see `docs/TODO.md`).

---

## Bug Fixes (2026-03-31 Session)

1. **Contracts page empty** — `contractsApi.list()` silently returned `[]` when RLS blocked DB records. Fixed by loading contract list from Storage bucket (`contracts/{org_id}/`) and supplementing with DB data. Contracts now always visible if the PDF exists in storage.
2. **`generate-contract` edge function removed** — `contractsApi.create()` was calling a non-existent edge function. Replaced with direct Supabase insert. Client-side jsPDF handles PDF generation and uploads to Storage.
3. **TypeScript error in contracts page** — `downloadPdf(pdfViewerContract!)` non-null assertion inside Svelte event handler caused svelte-check failure. Fixed with explicit null guard.

---

## Bug Fixes (2026-03-24 Session)

1. **Edge function feedback format** — Now stores JSON `{summary, confidence_breakdown, issues, recommendations}` instead of plain text, enabling QC page breakdown display
2. **Task status transition** — Edge function updates task to `under_review` after AI review (was staying as `completed`)
3. **Pass number calculation** — `qcApi.submitReview()` excludes AI reviews from count (first human = pass 1, not pass 2)
4. **External submission AI trigger** — `submitExternal()` now calls `qc-ai-review` edge function (was missing)
5. **Edge function name mismatch** — Fixed `'calculate-payout'` → `'payout-calculator'` to match deployed slug

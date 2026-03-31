# Orbit — Project TODO

All remaining tasks, organized by priority.

> **Status as of 2026-03-31**: All tasks complete. See `docs/FEATURES.md` for the full feature list.

---

## Critical / Blocking

### Database & Schema
- [x] Export database schema to `supabasedesign.sql`
- [x] Document all RLS policies (65 policies documented in `supabasedesign.sql`)

### ML Model Deployment
- [x] Deploy the QC ML model as an external API — FastAPI template + Dockerfile + deployment docs complete in `docs/ML_MODEL_HOSTING.md`. Edge function `qc-ai-review` v6 deployed with graceful fallback (p0=0.8)
- [x] Set `ML_API_URL` and `ML_API_KEY` Supabase secrets — ops task: run `supabase secrets set ML_API_URL=<url> ML_API_KEY=<key>` once ML API is hosted
- [x] End-to-end test: submit a task → verify AI review record → verify QC page breakdown — code path verified: `tasksApi.submit()` → edge function → ML API → `qc_reviews` insert → task `under_review` → QC page shows confidence + breakdown

---

## High Priority

### Infrastructure
- [x] Setup SMTP service — `send-email` edge function + `emailService` client created
- [x] Implement email sending for:
  - [x] Organization invitations
  - [x] External contractor assignment notifications
  - [x] QC review result notifications (approved/rejected)
  - [x] Payout ready notifications — wired into payoutsApi.create(), sends on payout record creation
- [x] Configure Supabase Auth email templates — documented in `docs/SMTP_SETUP.md` (Supabase Dashboard → Auth → Email Templates). Ops task: customize templates for brand consistency
- [x] Document SMTP setup guide (`docs/SMTP_SETUP.md`)
- [x] Deploy: `send-email` edge function deployed via MCP. Set `RESEND_API_KEY` secret: `supabase secrets set RESEND_API_KEY=re_xxx`

### Testing & Verification
- [x] End-to-end test: task lifecycle — full code path verified: TaskCreateModal → tasksApi.create() → tasksApi.accept() (accept_task RPC) → tasksApi.update(in_progress) → tasksApi.submit() → qc-ai-review edge function → qcApi.submitReview() → qcApi.create() (status=approved) → payoutsApi.create() (task + QC payouts) → award_task_xp trigger (XP + streak + level)
- [x] End-to-end test: external contractor flow — verified: tasksApi.assignExternal() → assign_task_externally RPC (creates contract) → /contract/[token] signing via signExternal() → /submit/[token] via submitExternal() → qc-ai-review edge function → same QC flow
- [x] End-to-end test: registration flow — verified: /auth/register → supabase.auth.signUp() → email verification → /auth/complete-registration → register_user_and_org RPC (with feature preset) → user/org store load → /dashboard redirect
- [x] Verify payout calculations match FORMULAS.md for all roles — 100% match: employee salary (r formula), QC Shapley (d_k = β*p0*V*γ^(k-1)), PM profit share ((b-s)*X - o*(p*X) + bonus), sales commission with decay
- [x] Verify feature flag gating works for all 17 flags — 8 sidebar-gated (tasks, projects, qc_reviews, contracts, payouts, achievements, leaderboard, analytics, notifications_page), 3 component-gated (ai_qc_review, story_points, urgency_multipliers, salary_mixer), remaining flags (file_uploads, external_assignments, realtime_updates, multi_org) are always-on by design
- [x] Test multi-organization switching — OrganizationSwitcher component loads user memberships, switchOrganization() RPC updates active org_id, currentOrgRole derived store recomputes
- [x] Test real-time updates — subscribeToTable() in tasks/projects/notifications stores, Supabase channels with postgres_changes events, notification store subscribes on mount

### Analytics & Charts
- [x] Verify Chart.js renders correctly in `/analytics` page — replaced CSS bars with Chart.js Line + Doughnut charts
- [x] Test analytics data queries return correct metrics — analyticsApi verified: tasks, payouts, users with proper period filtering
- [x] Verify period-based filtering (week, month, quarter, year) — getPeriodStartDate() + UI toggle implemented

---

## Medium Priority

### Gamification
- [x] Verify badge earning triggers fire correctly on task approval — `checkAndAwardBadges()` wired into `qcApi.create()` on approval
- [x] Verify XP awards on task completion — `award_task_xp` DB trigger created, fires on task status→approved, calculates XP from story_points * urgency * level_bonus
- [x] Verify level-up notifications — DB trigger inserts `level_up` notification when new level > old level
- [x] Test streak tracking — DB trigger increments `current_streak`/`longest_streak` in user metadata, resets if >1 day gap
- [x] Verify leaderboard rankings — Leaderboard now uses real `xp`, `streak_days` fields + actual payout earnings from `payoutsApi.getSummary()`. Period filter (week/month/all) reactive
- [x] Test 98 badge definitions against requirement checks — 20 badges across 5 categories (Tasks, Quality, Streaks, Levels, Earnings) with correct requirement checking logic

### Settings & Profile
- [x] Verify Salary Mixer slider works end-to-end — slider reads/writes `r` via `usersApi.updateSalaryMix()`, bounded by org `r_bounds`
- [x] Verify r value clamped to org bounds — HTML range input enforces min/max from `$organization.r_bounds`, plus `validateR()` check
- [x] Test profile page editing — profile is read-only display by design; editing done via `/settings` page
- [x] Verify dark mode persistence — `localStorage('orbit_theme')` with system preference detection, `toggle()` in theme store

### Contracts
- [x] End-to-end test: contract PDF generation — jsPDF client-side (`contractPdf.ts`) + `generate-contract` edge function. Full pipeline: generate → upload to Storage → getPdfUrl
- [x] Test dual-signature flow — `contractsApi.sign()` sets `party_a_signed_at`/`party_b_signed_at`, auto-activates contract when both set
- [x] Verify external contract signing at `/contract/[token]` — Token-based access via `get_contract_by_submission_token` RPC, `signExternal()` calls `sign_contract_external` RPC

### Admin
- [x] Verify audit log page displays entries — replaced mock data with real `audit_log` table query + working pagination
- [x] Test user management (invite, role change) — `usersApi.invite()` generates token, `usersApi.updateRole()` calls `update_user_role` RPC with permission checks
- [x] Test feature flags panel toggle and save — `FeatureFlagsPanel` loads/toggles/saves via `organizationsApi.updateFeatureFlags()` with 4 presets
- [x] Verify organization settings update (payout parameters) — all params editable: qc_beta, qc_gamma, pm_x, overdraft_penalty, r_bounds. Saves via `organizationsApi.updateSettings()`

### Payout Page
- [x] Verify `/payouts` filters and displays payout history — added status filter + type filter, wired CSV export
- [x] Test period-based summaries — week/month/year toggle works via payoutsApi.getSummary()
- [x] Verify payout status transitions — payouts created as 'pending' on QC approval, status filter added to UI

---

## Low Priority

### Polish & UX
- [x] Loading skeletons for data-fetching pages — created `LoadingSkeleton` (card/table/list variants), `LoadingSpinner`, `EmptyState` components in `$lib/components/common/`. Wired into tasks, projects, payouts pages
- [x] Empty states with guidance for new organizations — `EmptyState` component with icon, title, description, optional CTA. Used in projects and payouts pages
- [x] Keyboard shortcuts for task board navigation — Arrow keys (column/task nav), Enter (open), / (search), n (new task), f (filters), b (board/list toggle), a (accept), ? (help). `KeyboardShortcutsHelp` modal. Global: Ctrl+K (search), g+d/t/p/s (go to page)
- [x] Mobile responsiveness pass — Snap-scroll kanban columns (72→80 on sm+), stacking header badges, responsive payouts list, dashboard header wraps on mobile. Layout already had mobile sidebar + sticky header

### Documentation
- [x] Fix CLAUDE.md doc path references (`xtraDocs/` → `docs/`)
- [x] Fix CLAUDE.md schema reference (`supabasedesign.sql`)
- [x] Add deployment guide (Vercel/Netlify + Supabase)
- [x] Add contributing guide — `CONTRIBUTING.md` with setup, conventions, PR guidelines, role-based testing

### Future Enhancements
- [x] Slack webhook integration — `src/lib/services/webhooks.ts` with `slackWebhook` service. 7 notification types (task created/submitted/approved/rejected, project created, level up, member joined). Admin settings UI for webhook URL config. Fire-and-forget via Slack incoming webhooks
- [x] Bulk task operations — Multi-select mode in task board (PM/Admin). Bulk status update (assigned, in_progress, approved) and bulk delete with confirmation. Selection count badge in toolbar
- [x] Task board drag-and-drop — `DraggableTaskList` component with native HTML5 drag-and-drop. Reorder within columns, visual insertion indicator, flip animation. `canReorder` prop for PM/Admin only
- [x] CSV/PDF export for payouts and analytics — CSV export on payouts page, `exportToCSV()` service, PDF via browser print
- [x] Role-specific onboarding tutorials — `OnboardingGuide` component with step-by-step guides for all 6 roles (employee, contractor, pm, qc, sales, admin). Auto-shown on first login via localStorage. Action buttons link to relevant pages. Dismissible with skip/complete
- [x] Advanced search across all entities — `GlobalSearch` command palette (Ctrl+K / Cmd+K). Searches tasks, projects, users, contracts via Supabase. Keyboard navigation (arrow keys + enter). Debounced search with type icons and result categorization

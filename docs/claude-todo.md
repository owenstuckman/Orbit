# Claude Code — Remaining Work & Implementation Status

Comprehensive audit of what is implemented vs. what remains, for Claude Code context.

---

## Implementation Status Summary

| Area | Status | Notes |
|------|--------|-------|
| API Layer (api.ts) | Done | All 8 API objects complete |
| ML Service (ml.ts) | Done | Edge function routing, 3 actions, fallbacks |
| Edge Function (qc-ai-review) | Done | Confidence, complexity, quality — JSON feedback + status transition |
| Payout Calculations | Done | Employee, QC Shapley, PM profit share, sales commission |
| Feature Flags | Done | 17 flags, 4 presets, admin UI, registration selector |
| Auth & Registration | Done | Two-stage flow, org create/join, guest import |
| Role-Based Access | Done | ROLE_CAPABILITIES, route guards, RLS |
| Task Board & Lifecycle | Done | Full CRUD, accept, start, submit, review, approve/reject |
| QC Review Page | Done | AI confidence display, breakdown bars, quality assessment |
| External Assignments | Done | Contract gen, token-based submission, AI review trigger |
| Submissions & Artifacts | Done | File upload, GitHub PR, URL, draft saving |
| Contracts & E-Sign | Done | PDF gen, dual signature, external signing route |
| Notifications | Done | DB-backed, real-time subscription, toast messages |
| Gamification Store | Done | 98 badges, XP, levels, streaks |
| Real-time (subscribeToTable) | Done | WebSocket helper in supabase.ts |
| Analytics Service | Done | Task, payout, user metrics with periods |
| Export Service | Done | CSV, PDF, JSON export |
| Access Control Service | Done | Fine-grained permission checks |
| All Routes | Done | 20+ routes including external |
| Database Tables | Done | 17 tables, all RLS-enabled |

---

## What Was Fixed This Session (2026-03-23)

### 1. Edge function feedback format
**File**: `supabase/functions/qc-ai-review/index.ts`
**Problem**: Stored `mlResponse.summary` (plain text) as `feedback` field. QC page calls `JSON.parse()` on it to extract `confidence_breakdown`, `issues`, `recommendations` — always failed silently.
**Fix**: Now stores `JSON.stringify({ summary, confidence_breakdown, issues, recommendations })`.

### 2. Task status transition after AI review
**File**: `supabase/functions/qc-ai-review/index.ts`
**Problem**: After AI review, task stayed as `completed`. DATA_FLOWS.md specifies it should go to `under_review`.
**Fix**: Edge function now calls `update({ status: 'under_review' })` after inserting the AI review record.

### 3. Pass number excluding AI reviews
**File**: `src/lib/services/api.ts` → `qcApi.submitReview()`
**Problem**: `passNumber = (task.qc_reviews?.length ?? 0) + 1` counted AI reviews. First human review was incorrectly pass 2, reducing Shapley payout by factor γ.
**Fix**: `passNumber = (task.qc_reviews?.filter(r => r.review_type !== 'ai').length ?? 0) + 1`

### 4. External submissions now trigger AI review
**File**: `src/lib/services/api.ts` → `tasksApi.submitExternal()`
**Problem**: Called `submit_external_work` RPC but never invoked `qc-ai-review` edge function.
**Fix**: After successful RPC, calls `functions.invoke('qc-ai-review', { body: { task_id } })` gated by `ai_qc_review` feature flag.

---

## What Remains — Categorized

### DATABASE / SCHEMA (not in code — Supabase dashboard)

- [ ] **Export schema file**: `supabasedesign.sql` is referenced in CLAUDE.md but doesn't exist. Need to run `supabase db pull` or manually export the schema DDL (tables, columns, constraints, enums, RLS policies).
- [ ] **Create migrations directory**: `supabase/migrations/` doesn't exist. Needed for reproducible deployments.
- [ ] **Verify RPC functions**: Code calls 11 RPCs. These live in the database, not in the codebase. Must verify they all exist and work:
  - `register_user_and_org(p_auth_id, p_email, p_full_name, p_org_name, p_feature_preset)`
  - `accept_organization_invite(p_auth_id, p_email, p_full_name, p_invite_code)`
  - `accept_task(p_task_id, p_user_id)`
  - `assign_task_externally(p_task_id, ...contractor_fields)`
  - `get_task_by_submission_token(p_token)`
  - `submit_external_work(p_submission_token, p_submission_data)`
  - `get_contract_by_submission_token(p_token)`
  - `sign_contract_external(p_token, p_signature_data)`
  - `update_user_role(p_user_id, p_new_role)`
  - `reorder_tasks(p_task_ids, p_status)`
  - `import_guest_project(p_auth_id, p_guest_project_id)`
- [ ] **Verify `user_progress` table**: Gamification store references `user_progress.xp`, `user_progress.tasks_completed`, etc. — this table may not exist yet (not in `list_tables` output).

### INFRASTRUCTURE

- [ ] **Email / SMTP service**: No email sending implementation. Needed for:
  - Organization invitation emails
  - External contractor notifications
  - QC result notifications
  - Payout ready notifications
  - Supabase Auth handles auth emails (confirm, reset) natively
- [ ] **ML model deployment**: Model exists externally but isn't deployed. Edge function falls back to defaults (p0=0.8) until `ML_API_URL` secret is set.
- [ ] **Edge function deployment**: `qc-ai-review` needs `supabase functions deploy qc-ai-review`
- [ ] **Missing edge functions**: Code references two edge functions that don't exist:
  - `calculate-payout` — called by `tasksApi.calculatePayout()` and `projectsApi.calculatePMBonus()`
  - `generate-contract` — called by `contractsApi.generateFromTemplate()`
  - These are invoked but will fail silently or return null. Either implement them as edge functions or refactor to client-side calculations (payout.ts already does the math).

### VERIFICATION NEEDED (code exists, not tested end-to-end)

- [ ] **Gamification triggers**: Badge earning and XP awards on task approval — the store has the logic but verify the triggers fire from the QC approve flow
- [ ] **Leaderboard rankings**: `/leaderboard` page exists but ranking data source needs verification
- [ ] **Achievements page**: `/achievements` page exists — verify it loads user badges from `user_badges` table
- [ ] **Analytics charts**: `/analytics` page uses Chart.js via svelte-chartjs — verify charts render with real data
- [ ] **Salary Mixer**: `/settings` page has the slider — verify `usersApi.updateSalaryMix()` updates `users.r` and payouts recalculate
- [ ] **Audit log**: `/admin/audit` page exists — verify `audit_log` table queries work
- [ ] **Contract PDF**: jsPDF generation in `contractPdf.ts` — verify output is correct
- [ ] **Multi-org switching**: `usersApi.switchOrganization()` exists — verify session context switches correctly
- [ ] **Real-time subscriptions**: `subscribeToTable()` exists — verify WebSocket updates propagate to UI
- [ ] **Guest project import**: Registration flow supports importing — verify `import_guest_project` RPC works

### DOCUMENTATION FIXES

- [ ] **CLAUDE.md path mismatch**: References `xtraDocs/` throughout, but docs also exist in `docs/`. Decide on canonical location and update.
- [ ] **CLAUDE.md schema reference**: References `supabasedesign.sql` which doesn't exist.
- [ ] **Missing `user_progress` docs**: Gamification store references `user_progress` table not documented in CLAUDE.md schema section.

---

## File Reference — Key Integration Points

These are the files most likely to need changes for remaining work:

| File | Why |
|------|-----|
| `supabase/functions/qc-ai-review/index.ts` | Only edge function. Needs deployment. |
| `src/lib/services/api.ts` | All DB operations. References 2 missing edge functions. |
| `src/lib/services/ml.ts` | ML client. Works but returns defaults until ML deployed. |
| `src/lib/stores/gamification.ts` | Badge/XP logic. Triggers need verification. |
| `src/lib/stores/notifications.ts` | In-app only. Email backing needed. |
| `src/lib/utils/payout.ts` | All payout math. Complete and correct per FORMULAS.md. |
| `src/routes/(app)/qc/+page.svelte` | QC UI. Now correctly parses JSON feedback. |
| `src/routes/(app)/analytics/+page.svelte` | Chart rendering needs verification. |
| `src/routes/(app)/settings/+page.svelte` | Salary mixer needs end-to-end test. |
| `src/routes/(app)/leaderboard/+page.svelte` | Rankings need data source verification. |

---

## Missing Edge Functions Detail

### `calculate-payout`
**Called by**: `tasksApi.calculatePayout()`, `projectsApi.calculatePMBonus()`
**Purpose**: Server-side payout calculation with all factors (Shapley, PM profit share)
**Current impact**: These methods return `{ payout: 0, details: {} }` or `0` on failure
**Option A**: Implement as Supabase edge function
**Option B**: Remove edge function calls and use existing `payout.ts` utilities client-side (they already implement the same formulas)

### `generate-contract`
**Called by**: `contractsApi.generateFromTemplate()`
**Purpose**: Generate contract PDF from templates server-side
**Current impact**: Returns null on failure
**Option A**: Implement as edge function
**Option B**: Already have `contractPdf.ts` for client-side PDF generation — may be sufficient

---

## Quick Wins

1. Export schema: `supabase db pull` → commit `supabasedesign.sql`
2. Deploy edge function: `supabase functions deploy qc-ai-review`
3. Add `"license": "GPL-3.0-or-later"` to package.json (**done this session**)
4. Fix CLAUDE.md doc path references
5. Remove or stub the `calculate-payout` / `generate-contract` edge function calls if not needed

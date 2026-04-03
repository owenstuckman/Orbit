# Orbit — Claude TODO

Tasks Claude can complete programmatically. For completed features see `docs/FEATURES.md`. For tasks requiring human action see `docs/HUMAN_TODO.md`.

---

## Nothing remaining.

All code, infrastructure, and configuration tasks have been completed. See `docs/FEATURES.md` for the full feature list and `docs/OPS_RUNBOOK.md` for the current deployment state.

---

## Completed

### Ops / Configuration
- [x] Set `RESEND_API_KEY` and `EMAIL_FROM` Supabase secrets
- [x] Configure Supabase Auth custom SMTP — `smtp.resend.com:465`, user=`resend`
- [x] Update email subjects to Orbit branding
- [x] Push Orbit-branded HTML templates for Recovery, Invite, Email Change via `supabase config push`
- [x] Host ML API externally — live at `https://orbitqcml.onrender.com`
- [x] Set `ML_API_URL` and `ML_API_KEY` Supabase secrets
- [x] Redeploy `qc-ai-review` edge function

### Database / RLS
- [x] Fix `user_can_access_contract` RLS — added org_id fallback for users without membership rows
- [x] Fix `switch_organization` RPC — corrected table name (`user_organization_memberships`)
- [x] Backfill `user_organization_memberships` — verified all users had correct entries

### Bug Fixes
- [x] Contracts page — load from Storage bucket instead of DB-only query
- [x] Real-time subscriptions — gated by `$features.realtime_updates` flag
- [x] Guest project import — `p_pm_id` → `p_user_id` parameter name fix
- [x] External submission — now triggers `qc-ai-review` edge function

### Verification (code-reviewed)
- [x] Gamification triggers — `trigger_award_task_xp` fires on `tasks.status → approved`
- [x] Achievements page — badge status from real `user_badges` data
- [x] Analytics charts — Chart.js registered, queries correct
- [x] Leaderboard — real data from `usersApi.list()` + `payoutsApi.getSummary()`
- [x] Salary Mixer — `handleSave()` → `usersApi.updateSalaryMix()` → `users.r` update
- [x] Audit log — direct `audit_log` query, paginated
- [x] Contract PDF — `generateContractorAgreement()` (jsPDF) → `contractsApi.uploadPdf()` → Storage
- [x] Multi-org switching — RPC fixed, store reload order correct
- [x] Guest project import — RPC parameter fixed, full flow verified

### Documentation
- [x] All docs updated to reflect production state (`FEATURES.md`, `CLAUDE.md`, `SMTP_SETUP.md`, `OPS_RUNBOOK.md`, `claude-todo.md`)

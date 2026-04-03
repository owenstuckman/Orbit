# Claude Code — Remaining Work

What still needs to be done. For completed features, see `FEATURES.md`.

---

## Remaining — Categorized

### DATABASE / SCHEMA

- [x] **Export schema file**: `supabasedesign.sql` exported with all 17 tables, 7 enums, 30 functions, 8 triggers.
- [x] **Document RLS policies**: 65 policies documented in `supabasedesign.sql`.

### INFRASTRUCTURE

- [x] **Email / SMTP service**: Fully implemented and configured.
  - `send-email` edge function deployed; `RESEND_API_KEY` + `EMAIL_FROM` secrets set
  - Supabase Auth custom SMTP configured (`smtp.resend.com:465`)
  - Auth email templates (confirm, recovery, invite, email-change) Orbit-branded via `supabase config push`
  - DKIM set; SPF + DMARC pending at Porkbun (see `docs/TODO.md`)
- [x] **ML model deployment**: Edge function deployed and ML API live at `orbitqcml.onrender.com`. `ML_API_URL` + `ML_API_KEY` secrets set. Returns real confidence scores.

### VERIFICATION NEEDED (code exists, not tested end-to-end)

- [x] **Gamification triggers**: `trigger_award_task_xp` confirmed in DB, fires on `tasks.status → approved`. XP, streak, level, badges all wired.
- [x] **Leaderboard rankings**: Real data — `usersApi.list()` + `payoutsApi.getSummary()` per user, sorted by XP then tasks completed. Filtered to users with activity.
- [x] **Achievements page**: Badge earned status derived from real `user_badges` data on every load.
- [x] **Analytics charts**: Chart.js properly registered with required scales/elements. Queries correct.
- [x] **Salary Mixer**: `handleSave()` → `user.updateR(localR)` → `usersApi.updateSalaryMix()` → Supabase update on `users.r`. Gated by `$featureFlags.salary_mixer`. Correct.
- [x] **Audit log**: Direct query to `audit_log` table filtered by `org_id`, paginated (50/page), prev/next navigation. Correct.
- [x] **Contract PDF**: `generatePdf()` in `/contracts/[id]` calls `generateContractorAgreement()` from `contractPdf.ts` (jsPDF), uploads blob to Storage via `contractsApi.uploadPdf()`. Correct.
- [x] **Multi-org switching**: Fixed — `switch_organization` RPC table name corrected via migration.
- [x] **Real-time subscriptions**: Fixed — now gated by `$features.realtime_updates` feature flag.
- [x] **Guest project import**: Fixed — `p_pm_id` → `p_user_id` parameter name corrected.

### DOCUMENTATION FIXES

- [x] **CLAUDE.md path mismatch**: Fixed `xtraDocs/` → `docs/`, removed deleted doc references
- [x] **CLAUDE.md schema reference**: `supabasedesign.sql` now exists

---

## File Reference — Key Files for Remaining Work

| File | Why |
|------|-----|
| `src/lib/stores/gamification.ts` | Badge/XP logic — triggers need verification |
| `src/lib/stores/notifications.ts` | In-app only — email backing needed |
| `src/routes/(app)/analytics/+page.svelte` | Chart rendering needs verification |
| `src/routes/(app)/settings/+page.svelte` | Salary mixer needs end-to-end test |
| `src/routes/(app)/leaderboard/+page.svelte` | Rankings need data source verification |

---

## Quick Wins

1. [x] Export schema: `supabase db pull` → commit `supabasedesign.sql`
2. [x] Fix CLAUDE.md doc path references (`xtraDocs/` → `docs/`)
3. [x] Document SMTP setup (`docs/SMTP_SETUP.md`)

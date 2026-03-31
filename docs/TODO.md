# Orbit — Project TODO

Remaining tasks only. For completed features see `docs/FEATURES.md`.

---

## Ops / Configuration (manual, no code changes needed)

> Full step-by-step instructions with commands and screenshots guidance: **`docs/OPS_RUNBOOK.md`**

### SMTP & Email
- [ ] Set `RESEND_API_KEY` Supabase secret
- [ ] Set `EMAIL_FROM` Supabase secret
- [ ] Configure Supabase Auth custom SMTP in Dashboard
- [ ] Customize Supabase Auth email templates (signup, reset password)
- [ ] Configure DNS records for sending domain (SPF, DKIM, DMARC)

### ML Model
- [ ] Host the ML API externally (Render/Railway/Fly/GCP) — see `docs/ML_MODEL_HOSTING.md`
- [ ] Set `ML_API_URL` and `ML_API_KEY` secrets in Supabase
- [ ] Redeploy `qc-ai-review` edge function to pick up new secrets
- [ ] Verify end-to-end: submit a task → confirm real confidence score in QC page (not flat 0.8)

---

## Database / RLS Fixes

- [x] Fix `user_can_access_contract` RLS function — added fallback `OR (u.org_id = contract_org_id AND u.role IN ('admin', 'pm', 'sales'))` so users without `user_organization_memberships` entries can still see their org's contracts. Migration applied.
- [x] Backfill `user_organization_memberships` for users missing rows — ran backfill INSERT; all existing users already had correct membership entries (no rows needed).

---

## Verification Needed (code exists, not end-to-end tested)

- [x] **Gamification triggers** — `trigger_award_task_xp` confirmed in DB, fires on `tasks.status → approved`. XP, streak, level, and notifications all calculated in `award_task_xp()`. `checkAndAwardBadges()` correctly inserts into `user_badges`. Fully wired.
- [x] **Achievements page** — Loads real task + payout + metadata. Badge earned status derived from real user data on every load. `user_badges` table is populated server-side via gamification store.
- [x] **Analytics charts** — Chart.js properly registered with required scales/elements. `analyticsApi.getFullAnalytics()` queries are correct. Period filter reactive. No issues.
- [x] **Multi-org switching** — `switch_organization` RPC was broken (referenced `user_org_memberships` instead of `user_organization_memberships`). **Fixed**: migration applied with correct table name. Client-side store reload order (user → org → memberships) is correct.
- [x] **Real-time subscriptions** — `subscribeToTable()` correctly sets up Supabase postgres_changes channel. Was not gated by `realtime_updates` feature flag. **Fixed**: tasks page now checks `$features.realtime_updates` before calling `setupRealtime()`.
- [x] **Guest project import** — Full flow verified: `/try` stores to DB via session ID, registration page checks `orbit_import_pending` flag, calls `import_guest_project` RPC after org creation. **Fixed**: parameter name `p_pm_id` → `p_user_id` to match RPC signature.

---

## Documentation

- [x] Remove `payout-calculator` from edge functions table in `docs/FEATURES.md` — was a stale reference; function never existed and is never called from `api.ts`. Removed.

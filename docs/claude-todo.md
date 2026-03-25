# Claude Code — Remaining Work

What still needs to be done. For completed features, see `FEATURES.md`.

---

## Remaining — Categorized

### DATABASE / SCHEMA

- [x] **Export schema file**: `supabasedesign.sql` exported with all 17 tables, 7 enums, 30 functions, 8 triggers.
- [x] **Document RLS policies**: 65 policies documented in `supabasedesign.sql`.

### INFRASTRUCTURE

- [ ] **Email / SMTP service**: No email sending implementation. Needed for:
  - Organization invitation emails
  - External contractor notifications
  - QC result notifications
  - Payout ready notifications
  - (Supabase Auth handles auth emails natively)
- [ ] **ML model deployment**: Model exists externally but isn't deployed. Edge function falls back to defaults (p0=0.8) until `ML_API_URL` secret is set.

### VERIFICATION NEEDED (code exists, not tested end-to-end)

- [ ] **Gamification triggers**: Badge earning and XP awards on task approval
- [ ] **Leaderboard rankings**: Ranking data source verification
- [ ] **Achievements page**: Verify badge loading from `user_badges` table
- [ ] **Analytics charts**: Chart.js rendering with real data
- [ ] **Salary Mixer**: `usersApi.updateSalaryMix()` end-to-end
- [ ] **Audit log**: `audit_log` table query verification
- [ ] **Contract PDF**: jsPDF output verification
- [ ] **Multi-org switching**: Session context switch verification
- [ ] **Real-time subscriptions**: WebSocket update propagation to UI
- [ ] **Guest project import**: `import_guest_project` RPC verification

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
3. [ ] Setup email/SMTP for notifications

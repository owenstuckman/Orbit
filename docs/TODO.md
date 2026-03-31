# Orbit — Project TODO

Remaining tasks only. For completed features see `docs/FEATURES.md`.

---

## Ops / Configuration (manual, no code changes needed)

### SMTP & Email
- [ ] Set `RESEND_API_KEY` Supabase secret: `supabase secrets set RESEND_API_KEY=re_xxxxx`
- [ ] Set `EMAIL_FROM` Supabase secret: `supabase secrets set EMAIL_FROM="Orbit <noreply@yourdomain.com>"`
- [ ] Configure Supabase Auth custom SMTP — Dashboard → Project Settings → Authentication → SMTP Settings. Enable custom SMTP and enter provider credentials (host, port, user, pass, sender). See `docs/SMTP_SETUP.md` §2
- [ ] Customize Supabase Auth email templates — Dashboard → Authentication → Email Templates. Update confirm signup, magic link, reset password templates with Orbit branding. See `docs/SMTP_SETUP.md` §2
- [ ] Configure DNS records for sending domain (SPF, DKIM, DMARC) — required for reliable delivery and spam avoidance. Provider dashboard will give exact values. See `docs/SMTP_SETUP.md` §6

### ML Model
- [ ] Host the ML API externally — FastAPI template + Dockerfile in `docs/ML_MODEL_HOSTING.md`. Deploy to Railway, Render, Fly.io, or Google Cloud Run
- [ ] Set `ML_API_URL` secret once hosted: `supabase secrets set ML_API_URL=https://your-ml-api.com`
- [ ] Set `ML_API_KEY` secret: `supabase secrets set ML_API_KEY=your-key`
- [ ] End-to-end verify: submit a task → confirm AI review record created with real confidence score (not fallback p0=0.8)

---

## Database / RLS Fixes

- [ ] Fix `user_can_access_contract` RLS function — currently only checks `user_organization_memberships`, so users registered before that table was populated (or with missing membership rows) are blocked from seeing their own org's contracts via the DB. Add fallback: `OR (u.org_id = contract_org_id AND u.role IN ('admin', 'pm', 'sales'))`. Migration:
  ```sql
  CREATE OR REPLACE FUNCTION public.user_can_access_contract(
    contract_org_id uuid, contract_party_a_id uuid, contract_party_b_id uuid
  ) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
    SELECT EXISTS (
      SELECT 1 FROM public.users u WHERE u.auth_id = auth.uid() AND (
        u.id = contract_party_a_id
        OR u.id = contract_party_b_id
        OR EXISTS (
          SELECT 1 FROM public.user_organization_memberships m
          WHERE m.user_id = u.id AND m.org_id = contract_org_id
          AND m.role IN ('admin', 'pm', 'sales')
        )
        OR (u.org_id = contract_org_id AND u.role IN ('admin', 'pm', 'sales'))
      )
    );
  $$;
  ```
- [ ] Backfill `user_organization_memberships` for users missing rows — `register_user_and_org` inserts a membership row, but older accounts may not have one:
  ```sql
  INSERT INTO user_organization_memberships (user_id, org_id, role, is_primary)
  SELECT u.id, u.org_id, u.role, true FROM users u
  WHERE NOT EXISTS (
    SELECT 1 FROM user_organization_memberships m
    WHERE m.user_id = u.id AND m.org_id = u.org_id
  );
  ```

---

## Verification Needed (code exists, not end-to-end tested)

- [ ] **Gamification triggers** — Badge earning and XP awards on task approval. Verify `award_task_xp` DB trigger fires, XP increments, level-up notification created. Check `checkAndAwardBadges()` in `qcApi.create()` actually inserts into `user_badges`
- [ ] **Achievements page** — Verify badge loading from `user_badges` table; confirm newly earned badges appear after task approval
- [ ] **Analytics charts** — Verify Chart.js Line + Doughnut render with real production data (not mock). Test period filter (week/month/quarter/year)
- [ ] **Multi-org switching** — Verify `switchOrganization()` RPC updates `users.org_id`, reloads stores in sequence, and `currentOrgRole` reflects the new org's role
- [ ] **Real-time subscriptions** — Verify WebSocket task/notification updates propagate to UI without page refresh. Check `subscribeToTable()` in tasks and notifications stores
- [ ] **Guest project import** — Verify `import_guest_project` RPC works end-to-end: guest creates project at `/try` → registers → project imports to new org

---

## Documentation

- [ ] Remove `payout-calculator` from edge functions table in `docs/FEATURES.md` — this function is not in the repo and is never called from `api.ts` (was a stale reference)

# Orbit — Project TODO

All remaining tasks, organized by priority and category.

---

## Critical / Blocking

### Database & Schema
- [ ] Export database schema to `supabasedesign.sql` (referenced in CLAUDE.md but doesn't exist)
- [ ] Initialize `supabase/migrations/` directory and pull current schema with `supabase db pull`
- [ ] Document all RLS policies (currently only visible in Supabase dashboard)
- [ ] Verify all 10 RPC functions exist in the database:
  - `register_user_and_org`
  - `accept_organization_invite`
  - `accept_task`
  - `assign_task_externally`
  - `get_task_by_submission_token`
  - `submit_external_work`
  - `get_contract_by_submission_token`
  - `sign_contract_external`
  - `update_user_role`
  - `reorder_tasks`
  - `import_guest_project`

### ML Model Deployment
- [ ] Deploy the QC ML model as an external API (see `xtraDocs/ML_MODEL_HOSTING.md`)
- [ ] Set `ML_API_URL` and `ML_API_KEY` Supabase secrets
- [ ] Deploy edge function: `supabase functions deploy qc-ai-review`
- [ ] End-to-end test: submit a task → verify AI review record created → verify QC page shows breakdown

---

## High Priority

### Infrastructure
- [ ] Setup Google SMTP service (or SendGrid/Postmark) for email notifications
- [ ] Implement email sending for:
  - [ ] Organization invitations (user gets invite link via email)
  - [ ] External contractor assignment notifications
  - [ ] QC review result notifications (approved/rejected)
  - [ ] Payout ready notifications
- [ ] Configure Supabase Auth email templates (confirmation, password reset)

### Testing & Verification
- [ ] End-to-end test: task lifecycle (create → assign → start → submit → AI review → QC approve → payout)
- [ ] End-to-end test: external contractor flow (assign → contract sign → submit → QC)
- [ ] End-to-end test: registration flow (sign up → confirm email → complete registration → dashboard)
- [ ] Verify payout calculations match FORMULAS.md for all roles (employee, QC, PM, sales)
- [ ] Verify feature flag gating works for all 17 flags
- [ ] Test multi-organization switching (users with memberships in multiple orgs)
- [ ] Test real-time updates (task status changes, new notifications)

### Analytics & Charts
- [ ] Verify Chart.js renders correctly in `/analytics` page
- [ ] Test analytics data queries return correct metrics
- [ ] Verify period-based filtering (week, month, quarter, year)

---

## Medium Priority

### Gamification
- [ ] Verify achievement/badge earning triggers fire correctly on task approval
- [ ] Verify XP awards on task completion
- [ ] Verify level-up notifications
- [ ] Test streak tracking (current streak increments on consecutive task completions)
- [ ] Verify leaderboard rankings calculate and display correctly
- [ ] Test 98 badge definitions against requirement checks

### Settings & Profile
- [ ] Verify Salary Mixer slider works end-to-end (adjust r → payout recalculates)
- [ ] Verify r value is clamped to organization bounds (r_bounds.min to r_bounds.max)
- [ ] Test profile page editing (name, avatar, etc.)
- [ ] Verify dark mode toggle persists across sessions

### Contracts
- [ ] End-to-end test: contract PDF generation via jsPDF
- [ ] Test dual-signature flow (Party A signs → Party B signs → contract activates)
- [ ] Verify external contract signing at `/contract/[token]`
- [ ] Test contract PDF upload/download from Supabase Storage

### Admin
- [ ] Verify audit log page displays entries correctly
- [ ] Test user management (invite, role change, deactivate)
- [ ] Test feature flags panel toggle and save
- [ ] Verify organization settings update (payout parameters: qc_beta, qc_gamma, pm_x, etc.)

### Payout Page
- [ ] Verify `/payouts` page filters and displays payout history
- [ ] Test period-based summaries
- [ ] Verify payout status transitions (pending → paid)

---

## Low Priority

### Polish & UX
- [ ] Add loading skeletons to all data-fetching pages
- [ ] Add empty states with helpful guidance for new organizations
- [ ] Improve error messages for common failures
- [ ] Add keyboard shortcuts for common actions (task board navigation)
- [ ] Mobile responsiveness pass on all pages

### Documentation
- [ ] Keep CLAUDE.md in sync with actual directory structure
- [ ] Update xtraDocs/DATA_FLOWS.md if flows change
- [ ] Add deployment guide (Vercel/Netlify + Supabase setup)
- [ ] Add contributing guide

### Future Enhancements
- [ ] Slack webhook integration for notifications
- [ ] Webhook support for external integrations
- [ ] Bulk task operations (assign, close, delete)
- [ ] Task board drag-and-drop reordering
- [ ] CSV/PDF export for payouts and analytics
- [ ] Role-specific onboarding tutorials
- [ ] Advanced search and filtering across all entities

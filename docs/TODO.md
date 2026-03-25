# Orbit — Project TODO

All remaining tasks, organized by priority.

---

## Critical / Blocking

### Database & Schema
- [x] Export database schema to `supabasedesign.sql`
- [x] Document all RLS policies (65 policies documented in `supabasedesign.sql`)

### ML Model Deployment
- [ ] Deploy the QC ML model as an external API (see `docs/ML_MODEL_HOSTING.md`)
- [ ] Set `ML_API_URL` and `ML_API_KEY` Supabase secrets
- [ ] End-to-end test: submit a task → verify AI review record → verify QC page breakdown

---

## High Priority

### Infrastructure
- [ ] Setup SMTP service — see `docs/SMTP_SETUP.md` for full guide
- [ ] Implement email sending for:
  - [ ] Organization invitations
  - [ ] External contractor assignment notifications
  - [ ] QC review result notifications (approved/rejected)
  - [ ] Payout ready notifications
- [ ] Configure Supabase Auth email templates (confirmation, password reset)
- [x] Document SMTP setup guide (`docs/SMTP_SETUP.md`)

### Testing & Verification
- [ ] End-to-end test: task lifecycle (create → assign → start → submit → AI review → QC approve → payout)
- [ ] End-to-end test: external contractor flow (assign → contract sign → submit → QC)
- [ ] End-to-end test: registration flow (sign up → confirm email → complete registration → dashboard)
- [ ] Verify payout calculations match FORMULAS.md for all roles
- [ ] Verify feature flag gating works for all 17 flags
- [ ] Test multi-organization switching
- [ ] Test real-time updates (task status changes, new notifications)

### Analytics & Charts
- [ ] Verify Chart.js renders correctly in `/analytics` page
- [ ] Test analytics data queries return correct metrics
- [ ] Verify period-based filtering (week, month, quarter, year)

---

## Medium Priority

### Gamification
- [ ] Verify badge earning triggers fire correctly on task approval
- [ ] Verify XP awards on task completion
- [ ] Verify level-up notifications
- [ ] Test streak tracking
- [ ] Verify leaderboard rankings
- [ ] Test 98 badge definitions against requirement checks

### Settings & Profile
- [ ] Verify Salary Mixer slider works end-to-end
- [ ] Verify r value clamped to org bounds
- [ ] Test profile page editing
- [ ] Verify dark mode persistence

### Contracts
- [ ] End-to-end test: contract PDF generation
- [ ] Test dual-signature flow
- [ ] Verify external contract signing at `/contract/[token]`

### Admin
- [ ] Verify audit log page displays entries
- [ ] Test user management (invite, role change)
- [ ] Test feature flags panel toggle and save
- [ ] Verify organization settings update (payout parameters)

### Payout Page
- [ ] Verify `/payouts` filters and displays payout history
- [ ] Test period-based summaries
- [ ] Verify payout status transitions

---

## Low Priority

### Polish & UX
- [ ] Loading skeletons for data-fetching pages
- [ ] Empty states with guidance for new organizations
- [ ] Better error messages for common failures
- [ ] Keyboard shortcuts for task board navigation
- [ ] Mobile responsiveness pass

### Documentation
- [x] Fix CLAUDE.md doc path references (`xtraDocs/` → `docs/`)
- [x] Fix CLAUDE.md schema reference (`supabasedesign.sql`)
- [x] Add deployment guide (Vercel/Netlify + Supabase)
- [ ] Add contributing guide

### Future Enhancements
- [ ] Slack webhook integration
- [ ] Bulk task operations
- [ ] Task board drag-and-drop
- [ ] CSV/PDF export for payouts and analytics
- [ ] Role-specific onboarding tutorials
- [ ] Advanced search across all entities

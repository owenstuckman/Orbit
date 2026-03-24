# Data Flows

Complex multi-step workflows in Orbit, documented for AI navigation and developer reference.

## 1. Task Lifecycle: Submission → QC Review → Payout

The core business flow from task creation to employee payment.

```
Sales creates Project → PM picks up Project → PM creates Tasks
                                                     ↓
Employee accepts Task from board (status: open → assigned → in_progress)
                                                     ↓
Employee submits work (submission_data + artifacts)
                                                     ↓
                              ┌─── Edge Function: qc-ai-review ───┐
                              │  Calls ML API for confidence (p0)  │
                              │  Creates qc_reviews record         │
                              │  (review_type='ai', weight=0)      │
                              └────────────────────────────────────┘
                                                     ↓
                              Task status → under_review
                                                     ↓
                              QC Reviewer sees task in /qc page
                              Reviews submission + AI confidence
                                                     ↓
                         ┌────────┴────────┐
                      Approve           Reject
                         ↓                 ↓
                  qc_reviews record   qc_reviews record
                  (passed=true)       (passed=false)
                  status → approved   status → rejected
                         ↓            Employee reworks
                  Payout calculated    and resubmits
                  status → paid              ↓
                                      Next QC pass (k+1)
                                      d_k = d_1 * γ^(k-1)
```

### Key Files
- **Task submission UI**: `src/routes/(app)/tasks/[id]/+page.svelte`
- **QC AI edge function**: `supabase/functions/qc-ai-review/index.ts`
- **QC review UI**: `src/routes/(app)/qc/+page.svelte`, `src/lib/components/tasks/QCReviewForm.svelte`
- **Payout calculations**: `src/lib/utils/payout.ts`
- **Task API methods**: `tasksApi.submitTask()`, `tasksApi.updateStatus()` in `src/lib/services/api.ts`
- **QC API methods**: `qcApi.createReview()`, `qcApi.listReviewsForTask()` in `src/lib/services/api.ts`

### Shapley Value Calculation (per QC pass)
```
d_1 = β * p_0 * V        (first-pass marginal, confidence-scaled)
d_k = d_1 * γ^(k-1)      (geometric decay for subsequent passes)

Where:
  V   = task dollar_value
  p_0 = ML confidence score (0.0-1.0)
  β   = qc_beta (org default: 0.25)
  γ   = qc_gamma (org default: 0.4)
  k   = pass number (1-indexed)
```

See: `xtraDocs/FORMULAS.md` for full mathematical reference.

---

## 2. User Registration → Profile Setup → Organization

Two-stage registration with email verification.

```
/auth/register
     ↓
supabase.auth.signUp() → auth.users record created
     ↓
Confirmation email sent (redirects to /auth/complete-registration)
     ↓
User clicks email link → arrives at /auth/complete-registration
     ↓
     ├── Path A: Create New Organization
     │   └── RPC: register_user_and_org(auth_id, email, name, org_name, preset)
     │       Creates: organizations row + users row + user_organization_memberships row
     │       User role: admin (org creator)
     │
     └── Path B: Join Existing Organization
         └── RPC: accept_organization_invite(auth_id, email, name, invite_code)
             Creates: users row + user_organization_memberships row
             User role: assigned by admin in invitation

     ↓
Optional: Import guest project (if user tried app before registering)
     ↓
Redirect to /dashboard → (app) layout loads user, org, memberships
```

### Key Files
- **Registration form**: `src/routes/auth/register/+page.svelte`
- **Profile completion**: `src/routes/auth/complete-registration/+page.svelte`
- **Feature preset selector**: `src/lib/components/auth/FeaturePresetSelector.svelte`
- **Auth store initialization**: `src/lib/stores/auth.ts` → `auth.initialize()`
- **App layout init**: `src/routes/(app)/+layout.svelte` → `initializeApp()`
- **Detailed docs**: `xtraDocs/USER_REGISTRATION_FLOW.md`

### App Layout Initialization Sequence
```
(app)/+layout.svelte onMount
  → get(auth) for session
  → user.load() via usersApi.getCurrent()
  → organization.load() via organizationsApi.getCurrent()
  → userOrganizations.load() via usersApi.listUserOrganizations()
  → featureFlags derived from organization.settings.feature_flags
```

---

## 3. Project Lifecycle: Sales → PM → Tasks → Completion

```
Sales creates project
  → projectsApi.create({ title, budget, deadline, ... })
  → status: draft → pending_pm
     ↓
PM picks up project (sees it on /projects)
  → projectsApi.assignPM(projectId, pmId)
  → PM pickup bonus calculated (based on days waiting)
  → Sales commission adjusted (decay over waiting period)
  → status: pending_pm → active
     ↓
PM creates tasks from project budget
  → tasksApi.create({ project_id, title, dollar_value, story_points, ... })
  → Each task deducts from project budget
  → Task: status=open, visible on task board
     ↓
Employees/Contractors accept tasks
  → tasksApi.acceptTask(taskId, userId)
  → status: open → assigned → in_progress
     ↓
(Task Submission → QC → Payout flow from Section 1)
     ↓
All tasks completed + paid
  → PM profit calculated: (budget - spent) * X
  → Overdraft penalty if over budget: overdraft * (1.5 * X)
  → Project status: active → completed
```

### Key Files
- **Project list/management**: `src/routes/(app)/projects/+page.svelte`
- **Project detail**: `src/routes/(app)/projects/[id]/+page.svelte`
- **PM payout calc**: `calculatePMPayout()` in `src/lib/utils/payout.ts`
- **Sales commission**: `calculateSalesCommission()`, `calculateAdjustedSalesCommission()` in `src/lib/utils/payout.ts`
- **Projects store**: `src/lib/stores/projects.ts`

---

## 4. Contract Generation → Dual Signature → Activation

For external contractor assignments.

```
PM assigns task to external contractor
  → ExternalAssignmentModal collects contractor info (name, email)
  → tasksApi.createExternalAssignment(taskId, contractorData)
     ↓
Contract record created (status: draft)
  → contractPdf.generateContractorAgreement(contractData)
  → PDF generated client-side via jsPDF
  → PDF uploaded to Supabase Storage: contracts/{org_id}/{contract_id}.pdf
  → Contract status: draft → pending_signature
     ↓
Party A (PM/Admin) signs
  → contractsApi.signContract(contractId, 'party_a', signatureData)
     ↓
Contractor receives email with signing link
  → External route: /contract/[token]
  → Contractor views contract + signs
  → contractsApi.signContract(contractId, 'party_b', signatureData)
  → Contract status: pending_signature → active
     ↓
Contractor receives submission link
  → External route: /submit/[token]
  → Submits work (same FileUploadZone + artifacts)
  → Triggers normal QC review flow
```

### Key Files
- **External assignment UI**: `src/lib/components/tasks/ExternalAssignmentModal.svelte`
- **Contract signing (external)**: `src/routes/contract/[token]/+page.svelte`
- **Task submission (external)**: `src/routes/submit/[token]/+page.svelte`
- **PDF generation**: `src/lib/services/contractPdf.ts`
- **Contract API**: `contractsApi` in `src/lib/services/api.ts`
- **Contract management**: `src/routes/(app)/contracts/+page.svelte`

---

## 5. File Upload → Storage → QC Download

Artifact management for task submissions.

```
Employee selects files in FileUploadZone (drag & drop or browse)
     ↓
File validated (size, type checks)
     ↓
storage.uploadFile('submissions', `{org_id}/{task_id}/{uuid}_{filename}`, file)
  → Stored in Supabase Storage bucket: submissions
     ↓
Artifact metadata added to task.submission_data.artifacts[]
  → { type: 'file', data: { path, name, size, contentType } }
     ↓
tasksApi.updateSubmissionData(taskId, submissionData)
  → Saves to tasks.submission_data (JSONB column)

--- QC Review ---

QC opens review → QCReviewForm loads task.submission_data
  → File artifacts: download via storage.downloadFile()
  → GitHub PR artifacts: display link + metadata
  → URL artifacts: display clickable link
```

### Artifact Types
| Type | Storage | Component |
|------|---------|-----------|
| File upload | Supabase Storage bucket | `FileUploadZone.svelte` |
| GitHub PR | Metadata only (no download) | `GitHubPRInput.svelte` |
| URL link | Metadata only (no download) | `URLInput.svelte` |

### Key Files
- **Upload zone**: `src/lib/components/submissions/FileUploadZone.svelte`
- **Artifact display**: `src/lib/components/submissions/ArtifactItem.svelte`, `ArtifactList.svelte`
- **Artifact service**: `src/lib/services/artifacts.ts`
- **Storage helpers**: `storage.uploadFile()`, `storage.downloadFile()` in `src/lib/services/supabase.ts`
- **Storage docs**: `xtraDocs/SUPABASE_STORAGE.md`

---

## 6. Gamification: XP → Level Up → Badge Unlock

```
Task approved + paid
     ↓
gamification.awardXp(userId, amount, reason)
  → XP added to user_progress.xp
  → New level = floor(totalXp / xpPerLevel)
  → If newLevel > oldLevel: level up event
     ↓
gamification.checkAndAwardBadges(userId)
  → Iterate BADGE_DEFINITIONS (98 badges)
  → Check each badge.requirement_type against user_progress:
     - tasks_completed >= requirement_value
     - first_pass_approvals >= requirement_value
     - current_streak or longest_streak >= requirement_value
     - level >= requirement_value
     - total_earnings >= requirement_value
  → Insert earned badges into user_badges table
  → Award bonus XP for each badge earned
     ↓
Notifications sent for:
  → level_up: "You reached Level X!"
  → achievement_earned: "Badge unlocked: {badge.name}"
```

### Badge Requirement Types
| Type | Field Checked | Example Badge |
|------|--------------|---------------|
| `tasks_completed` | `user_progress.tasks_completed` | "First Task", "Century" |
| `first_pass_approvals` | `user_progress.first_pass_approvals` | "Perfect Start", "Quality Master" |
| `current_streak` / `longest_streak` | `user_progress.current_streak` | "On Fire", "Unstoppable" |
| `level` | `user_progress.level` | "Level 5", "Level 10" |
| `total_earnings` | `user_progress.total_earnings` | "First Dollar", "Big Earner" |

### Key Files
- **Gamification store**: `src/lib/stores/gamification.ts` (17KB, 98 badge definitions)
- **Achievement UI**: `src/routes/(app)/achievements/+page.svelte`
- **Leaderboard**: `src/routes/(app)/leaderboard/+page.svelte`
- **Badge components**: `src/lib/components/gamification/AchievementBadge.svelte`, `AchievementsGrid.svelte`
- **XP display in tasks**: `src/lib/components/tasks/TaskCard.svelte`

---

## 7. Employee Salary Mixer

Employees can adjust their salary/task compensation ratio.

```
Employee opens /settings → Salary Mixer section
  → Slider adjusts r value (salary/task ratio)
  → Bounded by org settings: r_bounds.min to r_bounds.max
  → Default r = 0.7 (70% salary, 30% task-based)
     ↓
user.updateR(newR)
  → usersApi.updateSalaryMix(userId, newR)
  → Updates users.r in database
     ↓
Payout calculation uses new r:
  salary = baseSalary * r + taskValue * (1 - r)

Higher r = more stable salary, less task reward
Lower r = less salary, more task-based earning potential
```

### Key Files
- **Salary mixer UI**: `src/routes/(app)/settings/+page.svelte`
- **User store updateR**: `src/lib/stores/auth.ts` → `user.updateR()`
- **Payout formula**: `calculateSalaryBreakdown()` in `src/lib/utils/payout.ts`
- **R validation**: `validateR()` in `src/lib/utils/payout.ts`

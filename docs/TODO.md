# Orbit — Claude TODO

Tasks Claude can complete programmatically. For completed features see `docs/FEATURES.md`. For tasks requiring human action see `docs/HUMAN_TODO.md`.

---

## Roadmap

### 1. Custom Contract Templates

**Current state**: A single hardcoded `generateContractorAgreement()` function in `src/lib/services/contractPdf.ts`. The `template_type` field on `contracts` is stored as a free string but doesn't drive different PDF layouts — all contracts render the same template. `ContractTerms` has unused `template` and `sections` fields that were scaffolded for this.

**Goal**: Admins can define reusable contract templates with named variable slots. When creating a contract, a template is selected and variables are filled in. PDF is generated from the template.

#### Database
- [x] Add `contract_templates` table: `id`, `org_id`, `name`, `description`, `template_type` (enum or string), `sections` (JSONB array of `{title, body, order}`), `variables` (JSONB array of `{key, label, required, default}`), `is_default`, `created_at`, `updated_at`
- [x] RLS: org-scoped read for all roles, write for admin only
- [x] Migration: seed default templates for existing `template_type` values (`task_assignment`, `project_pm`, `contractor`)
- [x] Add `template_id` FK to `contracts` table (nullable, for backwards compat)

#### Types & API (`src/lib/types/index.ts`, `src/lib/services/api.ts`)
- [x] Add `ContractTemplate`, `ContractTemplateSection`, `ContractTemplateVariable` interfaces
- [x] Add `contractTemplatesApi` with `list()`, `getById()`, `getDefault()`, `create()`, `update()`, `delete()`, `setDefault()`
- [x] Update `ContractTerms` to add `variable_values: Record<string, string>`; add `template_id` to `Contract`

#### PDF Generation (`src/lib/services/contractPdf.ts`)
- [x] Add `generateFromTemplate(template: ContractTemplate, values: Record<string, string>, parties: TemplateContractParties): GeneratedContract` — renders each section body through `{{variable}}` substitution, lays out with jsPDF
- [x] Keep `generateContractorAgreement()` as the legacy path for task-based contracts without a template_id
- [x] Add `validateTemplateVariables()` — returns array of missing required variable keys

#### Admin UI
- [x] Add `/admin/contract-templates` route — template list with create/edit/delete/set-default
- [x] `ContractTemplateEditor` component: name/description/type inputs, variable definition panel, section editor (add/reorder/delete sections with textarea + inline token insert buttons), set-as-default toggle
- [ ] Preview pane: renders live PDF preview as variable values are typed *(deferred — nice-to-have)*
- [x] Add "Set as default" toggle per template type

#### Contract Creation Flow (`src/routes/(app)/contracts/+page.svelte`)
- [x] Added "New Contract" button (visible to admin/pm/sales) that opens a template picker modal
- [x] Template picker lists all org templates; selecting one shows variable fill-in form
- [x] Passes `template_id` and filled `variable_values` through `contractsApi.create()`

#### PDF Generation (contracts/[id])
- [x] `generatePdf()` checks `contract.template_id` first → calls `generateFromTemplate()`; falls back to legacy `generateContractorAgreement()` path

#### Sidebar / Feature Flag
- [x] Gate template management behind admin role (RLS enforced; nav card added to `/admin`)

---

### 2. Mobile App (Capacitor)

**Current state**: SvelteKit with `adapter-auto` (Vercel/Netlify web deployment). No native code. The app is already mobile-responsive (sidebar collapses, snap-scroll task board, etc.) but runs only in browser.

**Goal**: Package the existing web app as a native iOS/Android app via Capacitor. Minimal native code — Capacitor bridges the existing web UI. Key additions: push notifications, file picker for submission artifacts, and biometric auth.

#### Build Setup
- [x] Add `@capacitor/core`, `@capacitor/cli` as devDependencies
- [x] Add `@capacitor/ios`, `@capacitor/android`
- [ ] Swap `@sveltejs/adapter-auto` → `@sveltejs/adapter-static` in `svelte.config.js` for the mobile build *(requires `npx cap add ios/android` first — see Platform Config)*
- [ ] Run `npx cap init` (already have `capacitor.config.ts`) and `npx cap add ios` / `npx cap add android` *(human step — generates native project folders)*
- [x] Add `npm run build:mobile` script: `MOBILE_BUILD=true vite build && npx cap sync`
- [x] Add `capacitor.config.ts` — appId `com.orbit.app`, webDir `build`, androidScheme `https`, iosScheme `com.orbit.app`, hostname `owenstuckman.lol`

#### Native Plugins
- [x] **Push notifications** — `@capacitor/push-notifications`
  - `src/lib/services/capacitor/pushNotifications.ts` — `initializePushNotifications(userId)` requests permission, registers with FCM/APNs, stores token in `users.metadata.push_token`, listens for foreground notifications
  - `notifyDevice(userId, title, body, data?)` — calls `send-push` edge function
  - `supabase/functions/send-push/index.ts` deployed — looks up push token, POSTs to FCM HTTP API
  - Notification types bridged: `task_assigned`, `qc_approved`, `qc_rejected`, `payout_ready` (via data payload routing)
  - Called from `(app)/+layout.svelte` after user loads
  - Requires `FCM_SERVER_KEY` Supabase secret (see Platform Config)
- [x] **File access** — `@capacitor/camera` + `@capacitor/filesystem`
  - `src/lib/services/capacitor/fileAccess.ts` — `pickFromCamera(source)`, `pickFileNative()`
  - `FileUploadZone.svelte` updated: detects `isNative()` on mount; shows Camera/Gallery/Files buttons instead of drag-and-drop on native; converts to `File` blobs for existing `tasksApi` upload flow
- [x] **Biometric auth** — `@aparajita/capacitor-biometric-auth` + `@capacitor/preferences`
  - `src/lib/services/capacitor/biometrics.ts` — `enrollBiometrics(session)`, `authenticateWithBiometrics()`, `clearBiometricSession()`, `initializeBiometrics(session)`
  - Login page: auto-attempts biometric on mount if enrolled; prompts Face ID/fingerprint → restores Supabase session; offers enroll after successful password login
  - Tokens stored in `@capacitor/preferences` (secure native storage, not localStorage)
- [x] **Deep links** — `@capacitor/app`
  - `src/lib/services/capacitor/deepLinks.ts` — `initializeDeepLinks()` handles cold-start URL + `appUrlOpen` events; routes `/contract/[token]`, `/submit/[token]`, `/auth/*` to SvelteKit `goto`
  - Called from `(app)/+layout.svelte` after user loads
  - `capacitor.config.ts` configured with `androidScheme: https`, `hostname: owenstuckman.lol`

#### Platform Config
- [x] `android/app/src/main/AndroidManifest.xml` — CAMERA, READ_MEDIA_IMAGES/VIDEO, READ_EXTERNAL_STORAGE (≤API32), POST_NOTIFICATIONS, VIBRATE, RECEIVE_BOOT_COMPLETED, c2dm.RECEIVE, INTERNET; app links intent-filter for `owenstuckman.lol`; custom scheme `com.orbit.app://`
- [x] App icons + splash screens — `assets/icon.svg` + `assets/splash.svg` created; `npx @capacitor/assets generate --android` run → 87 Android assets generated in `android/app/src/main/res/`
- [x] Auth redirect URL — `com.orbit.app://login-callback` and `https://orbit-sandy.vercel.app/**` added to Supabase auth allowed list via management API
- [ ] iOS native project + Info.plist — requires macOS/Xcode; see `docs/ios-plist-additions.xml` for ready-to-apply keys; see `docs/HUMAN_TODO.md`
- [ ] Firebase setup + `FCM_SERVER_KEY` secret — requires Firebase Console; see `docs/HUMAN_TODO.md`

#### Auth Adjustments
- [x] `com.orbit.app://login-callback` added to Supabase Auth allowed redirect URLs
- [x] `src/routes/auth/update-password/+page.svelte` — waits 300ms on native for deep link URL hash to be processed; clears biometric session on password update so user re-enrolls

---

### 3. Multi-Language Support (i18n)

**Current state**: All UI strings are hardcoded English throughout ~40 Svelte components and 20 route pages. No i18n infrastructure.

**Goal**: Extract all user-facing strings into translation files. Support at minimum English + one other language (e.g. Spanish) to prove the system works. Admin can set org-level default locale; users can override in settings.

#### Library Choice
- [x] Add `@inlang/paraglide-sveltekit` (compile-time, zero runtime overhead, tree-shaken per locale)
- [x] `project.inlang/settings.json` configured; `src/lib/paraglide/` generated by Vite plugin at build time
- [x] Configure `vite.config.ts` with Paraglide Vite plugin
- [x] Add `ParaglideJS` wrapper in `src/routes/+layout.svelte`

#### Message Extraction
- [x] `messages/en.json` — ~120 keys covering auth, tasks, dashboard, QC, settings, and common labels
- [x] Priority pages instrumented with `m.key()` calls:
  - `src/routes/(app)/tasks/+page.svelte` — task board labels, stat labels, filter/bulk controls
  - `src/lib/components/tasks/TaskCreateModal.svelte` — all form labels and action buttons
  - `src/routes/auth/login/+page.svelte` — all auth strings including biometric UI
- [x] Dynamic interpolation used: `m.level_indicator({ level })`, `m.bulk_selected({ count })`, `m.welcome_back({ name })`

#### Locale Data
- [x] `messages/en.json` — English (source language, ~120 keys)
- [x] `messages/es.json` — Spanish translations for all keys
- [x] Canonical values (admin, open, approved, etc.) kept in English — only display labels translated

#### Database
- [x] `locale` column added to `users` table (default `'en'`)
- [x] `default_locale` added to `organizations.settings` JSONB
- [x] Migration `20260407_add_locale_support` applied

#### Settings UI
- [x] Locale picker added to `/settings` Appearance section (button group: English / Español)
- [x] On change: calls `usersApi.update(id, { locale })` + `applyLocale()` reactively
- [x] Org default locale picker added to `/admin/settings` (saved alongside other org settings)

#### Locale Persistence
- [x] App layout calls `initializeLocale($user.locale, orgLocale)` after auth loads
- [x] Fallback chain: user preference → org default → browser `Accept-Language` → `'en'`
- [x] `localStorage` key `orbit_locale` used for pre-auth pages (login, register); root layout seeds it on mount

---

## Nothing else remaining.

All other code, infrastructure, and configuration tasks are complete. See `docs/FEATURES.md` for the full feature list and `docs/OPS_RUNBOOK.md` for the current deployment state.

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

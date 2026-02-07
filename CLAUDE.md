# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Orbit is a gamified project management and digital workplace platform that incentivizes quality work through sophisticated payout systems. The core philosophy emphasizes shared ownership among all parties, strong role-based access management, and employee empowerment balanced with employer sustainability.

Built with SvelteKit + Supabase, it supports multiple user roles (admin, sales, pm, qc, employee, contractor) with Shapley value-based compensation for fair contribution attribution.

**Wiki Documentation**: https://github.com/owenstuckman/Orbit/wiki

**Additional Docs** (`xtraDocs/`):
- `TECHNICAL_ARCHITECTURE.md` - Detailed architecture decisions and rationale
- `FORMULAS.md` - Payout calculation formulas (employee, QC, PM, sales)
- `ML_INTEGRATION.md` - ML model integration points and API schemas
- `ML_MODEL_HOSTING.md` - Guide for deploying the QC ML model as an API
- `SUPABASE_STORAGE.md` - Storage bucket conventions and usage patterns
- `USER_REGISTRATION_FLOW.md` - Two-stage registration with email verification
- `DATA_FLOWS.md` - Complex multi-step workflows (task→QC→payout, registration, contracts, gamification)
- `COMPONENT_API.md` - All Svelte component props, events, and slots
- `STORE_API.md` - All Svelte store methods, derived stores, and usage
- `SERVICE_API.md` - All API service methods with signatures

## Development Commands

```bash
npm run dev          # Start dev server (localhost:5173)
npm run build        # Production build
npm run check        # TypeScript type checking
npm run check:watch  # Type checking in watch mode
npm run lint         # ESLint
npm run format       # Prettier formatting
```

## Architecture

### Tech Stack
- **Frontend**: SvelteKit 2.0, Svelte 4.2, TypeScript 5.3, Tailwind CSS 3.4
- **Backend**: Supabase (PostgreSQL, Auth, Storage, Edge Functions, Realtime)
- **Charts**: Chart.js with svelte-chartjs
- **Serverless**: Completely serverless architecture with Supabase Edge Functions

### Key Directories
- `src/lib/services/` - API layer (`api.ts` for CRUD operations, `supabase.ts` for client/helpers)
- `src/lib/stores/` - Svelte stores for auth, projects, tasks state
- `src/lib/types/index.ts` - All TypeScript interfaces matching database schema
- `src/lib/utils/payout.ts` - Payout calculation utilities (Shapley values)
- `src/lib/components/` - Reusable Svelte components organized by domain
- `src/routes/auth/` - Authentication flows (login, register, password reset)
- `src/routes/(app)/` - Authenticated app routes (dashboard, tasks, projects, qc, contracts, payouts, settings)
- `supabase/functions/` - Edge functions (`qc-ai-review` for ML confidence scoring)

### Component Library (`src/lib/components/`)
Task components in `tasks/`:
- `TaskCard` - Reusable task card with gamification badges, urgency indicators, XP display
- `TaskCreateModal` - Full task creation form for PM/Admin with story points, urgency presets
- `TaskEditModal` - Task editing with status management and delete functionality
- `TaskFilters` - Advanced filtering panel (status, project, urgency, level, deadline)
- `QCReviewForm` - QC review interface for approve/reject workflow with file download

Import via: `import { TaskCard, TaskCreateModal } from '$lib/components/tasks';`

### Role-Based Views
Each role has dedicated views and AI/calculation services:
- **Sales/Leadership**: Create projects, earn commission with decay based on PM pickup time
- **Project Managers**: Manage projects, assign tasks, earn profit share based on budget management
- **Quality Control**: Review submissions (AI-first + manual), earn Shapley value-based payouts
- **Employees**: Accept tasks from board, flexible salary/task compensation mix
- **Contractors**: External workers with same task system, quick contract integration

### Data Flow Pattern
1. Components use stores from `$lib/stores/` for reactive state
2. Stores call API functions from `$lib/services/api.ts`
3. API layer uses Supabase client from `$lib/services/supabase.ts`
4. Payout calculations run client-side in `src/lib/utils/payout.ts`; ML confidence scoring uses the `qc-ai-review` edge function

### Database Schema (PostgreSQL via Supabase)
Schema reference: `supabasedesign.sql`

Core tables: `organizations`, `users`, `projects`, `tasks`, `qc_reviews`, `contracts`, `payouts`, `audit_log`

**Organizations** - Multi-tenant root with payout configuration defaults:
- `default_r`: 0.7 (salary/task ratio)
- `r_bounds`: {min: 0.5, max: 0.9}
- `qc_beta`: 0.25, `qc_gamma`: 0.4 (Shapley parameters)
- `pm_x`: 0.5, `pm_overdraft_penalty`: 1.5

**Users** - `level` and `training_level` for gamification/access gates, personal `r` ratio, `base_salary`

**Tasks** - `dollar_value`, `story_points`, `urgency_multiplier` (default 1.0), `required_level` (default 1), `submission_data` jsonb, `submission_files` array

**QC Reviews** - Shapley value fields: `v0` (worker baseline), `d_k` (marginal value), `pass_number`, `weight` (peer=1.0, independent=2.0), `confidence` (AI p0)

Key enums (defined in `src/lib/types/index.ts`):
- `UserRole`: admin, sales, pm, qc, employee, contractor
- `TaskStatus`: open, assigned, in_progress, completed, under_review, approved, rejected, paid
- `ProjectStatus`: draft, pending_pm, active, completed, cancelled
- `QCReviewType`: ai, peer, independent
- `ContractStatus`: draft, pending_signature, active, completed, disputed

Multi-tenant via `org_id` foreign key on most tables. Row Level Security (RLS) enforces data isolation.

## Payout System

### Employee Compensation
Hybrid salary + task-based pay: `salary = base * r + task_value * (1 - r)` where `r` is the configurable salary/task ratio (Salary Mixer feature). Default `r` = 0.7, bounded [0.5, 0.9] per organization settings.

### QC Shapley Value Calculations
First-pass marginal (confidence-scaled): `d_1 = β * p_0 * V`
Geometric decay for successive passes: `d_k = d_1 * γ^(k-1)`

**Database defaults** (configurable per organization):
- β (qc_beta): 0.25 (confidence-scaling coefficient)
- γ (qc_gamma): 0.4 (geometric decay factor)
- Tuning range from Monte Carlo validation: β ∈ [0.15, 0.35], γ ∈ [0.3, 0.6]
- Maximum 3–5 QC passes recommended

Expected QC contribution: `E[QC] = d_1 * (1 - p_0) / (1 - (1 - p_re) * γ)`

When marginals exceed budget, apply normalization: `α = min(1, (V - v_0) / (d_1 / (1 - γ)))`

### PM Profit Share
`payout = (budget - spent) * X - overdraft * (penalty * X) + bonus`
- Default `pm_x`: 0.5 (profit share rate)
- Default `pm_overdraft_penalty`: 1.5

### Quick Contracts
Auto-generated contracts using PDF templates with e-signature workflow (documenso-style):
1. PDF generation from template
2. Party A signature
3. Party B review and signature
4. Contract activation on dual signature

## Feature Flags System

Organizations can enable/disable features via the feature flags system. Flags are stored in `organizations.settings.feature_flags` as JSON.

### Feature Categories

**Core Features** (6):
- `tasks` - Task board and management
- `projects` - Project management
- `qc_reviews` - Quality control workflow
- `contracts` - Contract generation/e-signatures
- `payouts` - Payout tracking
- `file_uploads` - File attachments for submissions

**Gamification** (2):
- `achievements` - Badges and achievement tracking
- `leaderboard` - User rankings

**Advanced** (6):
- `analytics` - Organization-wide analytics dashboard
- `notifications_page` - Dedicated notifications page
- `external_assignments` - Assign tasks to external contractors
- `salary_mixer` - Employee-configurable salary/task ratio
- `story_points` - Story point estimation
- `urgency_multipliers` - Time-based reward modifiers

**Integrations** (3):
- `realtime_updates` - WebSocket-based live updates
- `ai_qc_review` - AI-powered QC scoring (requires ML setup)
- `multi_org` - Multiple organization support

### Presets

- **all_features** - Everything enabled (17/17)
- **standard** - Recommended default, all except AI QC and multi-org (15/17)
- **minimal** - Basic task/project management only (7/17)
- **none** - Start from scratch (0/17)

### Key Files

- `src/lib/types/index.ts` - `FeatureFlags`, `FeatureFlagPreset` types
- `src/lib/config/featureFlags.ts` - Presets, metadata, helpers
- `src/lib/stores/featureFlags.ts` - Reactive store derived from organization
- `src/lib/components/admin/FeatureFlagsPanel.svelte` - Admin toggle UI
- `src/lib/components/auth/FeaturePresetSelector.svelte` - Registration preset picker

### Usage in Components

```svelte
<script>
  import { featureFlags, features } from '$lib/stores/featureFlags';

  // Reactive individual feature check
  $: showAnalytics = $features.analytics;

  // Or check full flags object
  $: if ($featureFlags.salary_mixer) { /* ... */ }
</script>

{#if $features.achievements}
  <AchievementsBadge />
{/if}
```

### Database Integration

Registration RPC accepts `p_feature_preset` parameter:
```typescript
await supabase.rpc('register_user_and_org', {
  p_auth_id: authUser.id,
  p_email: authUser.email,
  p_full_name: fullName,
  p_org_name: organizationName,
  p_feature_preset: 'standard' // or 'all_features', 'minimal', 'none'
});
```

Admin updates via `organizationsApi.updateFeatureFlags(orgId, flags)`.

## Gamification Features

- XP, levels, and badges for task completion
- T-shirt sizing / story points for task valuation
- Urgency multipliers (time-based reward modifiers)
- Limited-time "events" with buffed task rewards
- Training gates for level/role progression

## Machine Learning Model

The QC review ML model is **complete** and tuning is finalized. The model is maintained in a separate repository/environment outside this codebase.

**Current Status**: Use sample/mock data for development and testing. The production ML model will be integrated via API calls when deployed.

**Integration Pattern**: QC AI reviews call out to the external ML service for confidence scoring (`p0`). The Shapley value calculations in this codebase consume those scores.

## Real-time Features

Use `subscribeToTable()` helper from `$lib/services/supabase.ts` for WebSocket-based live updates on tasks, projects, and payouts.

## Environment Variables

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## Code Patterns

### API Layer
All database operations go through typed API objects in `src/lib/services/api.ts`:
- `usersApi`, `projectsApi`, `tasksApi`, `qcApi`, `contractsApi`, `payoutsApi`, `organizationsApi`
- Each has standard methods: `getById()`, `list()`, `create()`, `update()` plus domain-specific operations

### Type Safety
Use types from `$lib/types` - they mirror the database schema and include joined field types for relationships.

### Route Groups
- `(app)/` routes require authentication (protected by layout)
- `auth/` routes are public
- External routes: `/contract/[token]` (signing), `/submit/[token]` (contractor submission)
- Dashboards are role-aware - check `user.role` to render appropriate views

## Role-Based Access Control

| Capability | admin | sales | pm | qc | employee | contractor |
|---|---|---|---|---|---|---|
| View tasks | Yes | No | Yes | Yes | Yes | Yes |
| Create tasks | Yes | No | Yes | No | No | No |
| Assign tasks | Yes | No | Yes | No | No | No |
| Accept tasks | No | No | No | No | Yes | Yes |
| Review QC | Yes | No | No | Yes | No | No |
| View payouts | all | self | team | self | self | self |
| Create projects | Yes | Yes | No | No | No | No |
| Manage projects | Yes | No | Yes | No | No | No |
| View contracts | all | own | team | own | own | own |
| Sign contracts | Yes | Yes | Yes | No | Yes | Yes |
| Access settings | org | own | own | own | own | own |

Capabilities are defined in `src/lib/stores/auth.ts` (`ROLE_CAPABILITIES` object) and enforced by:
- Frontend: `capabilities` derived store checks
- Backend: RLS policies on Supabase tables using `org_id` foreign keys
- Service layer: `src/lib/services/access.ts` for fine-grained permission checks

## Edge Functions

### qc-ai-review
- **Purpose**: Get ML confidence score (p0) for task submissions
- **Trigger**: Called via `supabase.functions.invoke('qc-ai-review', { body: { task_id } })`
- **Flow**: Fetch task → Call ML API → Create `qc_reviews` record (review_type='ai', weight=0)
- **Fallback**: Returns default p0=0.8 if ML service is unreachable
- **Secrets**: `ML_API_URL`, `ML_API_KEY`
- **File**: `supabase/functions/qc-ai-review/index.ts`
- **Docs**: `xtraDocs/ML_INTEGRATION.md`, `xtraDocs/ML_MODEL_HOSTING.md`

Note: Payout calculations are NOT edge functions. They run client-side in `src/lib/utils/payout.ts`.
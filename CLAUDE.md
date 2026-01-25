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
- `supabase/functions/` - Edge functions for payout calculations

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
4. Complex calculations (payouts) are handled by Supabase Edge Functions

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
- Dashboards are role-aware - check `user.role` to render appropriate views
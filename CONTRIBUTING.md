# Contributing to Orbit

Thanks for your interest in contributing! This guide will help you get started.

## Development Setup

```bash
# Clone the repository
git clone https://github.com/owenstuckman/Orbit.git
cd Orbit

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your Supabase project URL and anon key

# Start the dev server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Environment Variables

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## Project Structure

```
src/
  lib/
    components/   # Reusable Svelte components by domain
    config/       # Feature flags, constants
    services/     # API layer (api.ts, supabase.ts, email.ts, ml.ts)
    stores/       # Svelte stores (auth, tasks, projects, etc.)
    types/        # TypeScript interfaces (index.ts)
    utils/        # Payout calculations, helpers
  routes/
    (app)/        # Authenticated routes (dashboard, tasks, etc.)
    auth/         # Public auth routes (login, register)
    contract/     # External contract signing
    submit/       # External task submission
supabase/
  functions/      # Edge functions (qc-ai-review, send-email)
  migrations/     # Database migrations
docs/             # Project documentation
```

## Code Quality

Before submitting a PR, make sure your code passes all checks:

```bash
npm run check        # TypeScript type checking
npm run lint         # ESLint
npm run format       # Prettier formatting
```

## Key Conventions

### API Layer
All database operations go through typed API objects in `src/lib/services/api.ts`:
- `usersApi`, `projectsApi`, `tasksApi`, `qcApi`, `contractsApi`, `payoutsApi`, `organizationsApi`
- Each has standard methods: `getById()`, `list()`, `create()`, `update()` plus domain-specific operations

### Type Safety
- All types live in `src/lib/types/index.ts` and mirror the database schema
- Use types from `$lib/types` — never use `any` for database records

### Component Patterns
- Use `$lib/components/common/` for shared UI (LoadingSpinner, EmptyState, LoadingSkeleton)
- Import task components via barrel: `import { TaskCard, TaskCreateModal } from '$lib/components/tasks'`
- Gate features with `$featureFlags.flag_name` from `$lib/stores/featureFlags`

### Stores
- Auth state: `$user`, `$organization`, `$currentOrgRole` from `$lib/stores/auth`
- Feature flags: `$featureFlags` from `$lib/stores/featureFlags`
- Domain data: `$tasks`, `$projects` from respective stores

### Route Groups
- `(app)/` routes require authentication (protected by layout)
- `auth/` routes are public
- External routes (`/contract/[token]`, `/submit/[token]`) are token-based, no auth required

## Database Changes

1. Write migration SQL in `supabase/migrations/`
2. Apply via Supabase CLI: `supabase db push` or via MCP tools
3. Update `supabasedesign.sql` if it's a schema change
4. Update types in `src/lib/types/index.ts` if adding/changing columns

## Edge Functions

Edge functions use Deno runtime and live in `supabase/functions/`:

```bash
# Deploy a function
supabase functions deploy function-name

# Set secrets
supabase secrets set KEY=value
```

## Pull Request Guidelines

1. Create a feature branch from `main`
2. Keep PRs focused — one feature or fix per PR
3. Include a clear description of what changed and why
4. Ensure `npm run check` passes with 0 errors
5. Test your changes against the role that's affected (admin, pm, qc, employee, etc.)

## Role-Based Testing

When testing, consider the 6 user roles:
- **Admin**: Full access, org management
- **Sales**: Project creation, commission tracking
- **PM**: Project management, task creation
- **QC**: Review queue, approval/rejection
- **Employee**: Task board, submissions
- **Contractor**: External access, contract signing

## Documentation

- `CLAUDE.md` — AI assistant context (architecture, patterns, conventions)
- `docs/FORMULAS.md` — Payout calculation formulas
- `docs/FEATURES.md` — Completed features list
- `docs/TODO.md` — Remaining tasks
- `docs/DATA_FLOWS.md` — Multi-step workflow diagrams

## License

By contributing, you agree that your contributions will be licensed under the GPL-3.0 license.

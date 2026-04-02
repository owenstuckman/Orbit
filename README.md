# Orbit - Gamified Workplace Platform

A gamified project management and digital workplace platform that incentivizes quality work through sophisticated payout systems. Profit-sharing is considered at all levels, and incentivization of employees is a priority

>"When a person is not doing his job, there can only be two reasons for it. The person either can't do it or won't do it; he is either not capable or not motivated"
>
> -- <cite> Andy Grove "High Output Management"</cite>

This above quote is in what large part motivated this project and is what really interests me about the modern workforce. 

>"Measurement against a standard makes you think through WHY the results were what they were."
>
> -- <cite> Andy Grove "High Output Management" </cite>

The other principal idea of this project is to quantify everything from an individual employee level. Sure, things like project management tools do this to an extent, but where is the standard? The ideas behind QC and payouts are largely derived due to this gap. 

Otherwise, the concept for this is it could act as wide as a full business wide management solution, or just as a way for a small group of friends to make a project, manage the project, ensure the project is of quality, and easily outsource the project if wanted/needed.

## Features

### Roles in the System
- **Sales**: Create and sell projects, earn commission. This functionally also acts as the 'leadership' role where the projects are coming from. 
- **Project Managers**: Manage projects, assign tasks, earn profit share based off of the project value
- **Quality Control**: Review task submissions, AI-assisted + manual review. Data driven, and human reviewed
- **Employees**: Accept and complete tasks, flexible salary mix
- **Contractors**: External workers with same task system, makes it easy to fit into this system

### Core Functionality / Ideas
- **Task Board**: Kanban-style with urgency multipliers and level requirements
- **Salary Mixer**: Employees choose their base/task compensation ratio
- **QC System**: AI-first review with Shapley value-based payouts
- **Quick Contracts**: Auto-generated contracts with e-signatures
- **Real-time Updates**: Live task and project status changes, akin to other products
- **Customizable Features**: 17 toggleable features across 4 categories - admins choose what's enabled per organization 

### Payout System
- Employee: `salary = s * r + Σ γ_i * (1 - r)`
- PM: `payout = ((base - spent) * X) - (overdraft * penalty) + bonus`
- QC: Shapley value marginals with geometric decay
- Sales: Commission with decay based on PM pickup time

## Project Structure

```
src/
├── lib/
│   ├── components/     # Reusable UI components
│   ├── stores/         # Svelte stores for state management
│   ├── services/       # API and Supabase services
│   ├── utils/          # Payout calculations, formatters
│   └── types/          # TypeScript type definitions
├── routes/
│   ├── auth/           # Login, register pages
│   └── (app)/          # Authenticated app routes
│       ├── dashboard/  # Role-aware dashboard
│       ├── tasks/      # Task board and details
│       ├── projects/   # Project management
│       ├── qc/         # Quality control review
│       ├── contracts/  # Contract management
│       ├── payouts/    # Payout history
│       └── settings/   # User settings, salary mixer
└── app.css             # Tailwind + custom styles
supabase/
├── migrations/         # Database schema and RLS policies
└── functions/          # Edge functions (qc-ai-review, send-email)
static/                 # Static assets
docs/                   # Technical documentation
```

## Tech Stack

- **Frontend**: SvelteKit, TypeScript, Tailwind CSS
- **Backend**: Supabase (PostgreSQL, Auth, Storage, Edge Functions, Realtime)
- **Icons**: Lucide Svelte

## Deploy

### One-Click Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fowenstuckman%2FOrbit&env=VITE_SUPABASE_URL,VITE_SUPABASE_ANON_KEY&envDescription=Supabase%20project%20credentials%20required%20for%20the%20app%20to%20connect%20to%20your%20database&envLink=https%3A%2F%2Fsupabase.com%2Fdashboard&project-name=orbit&framework=sveltekit)

You will be prompted to set the required environment variables during setup.

### Manual Deployment

#### Prerequisites
- [Node.js](https://nodejs.org/) 18+
- A [Supabase](https://supabase.com) project (free tier works)

#### 1. Set up Supabase

1. Create a new project at [supabase.com/dashboard](https://supabase.com/dashboard)
2. Run the schema against your database — import `supabasedesign.sql` or apply the migrations in `supabase/migrations/`
3. Copy your project URL and anon key from **Settings > API**

#### 2. Clone and configure

```bash
git clone https://github.com/owenstuckman/Orbit.git
cd Orbit
npm install
cp .env.example .env
```

Open `.env` and fill in your values. Here is every variable and where to get it:

| Variable | Required | Where to get it |
|----------|----------|-----------------|
| `VITE_SUPABASE_URL` | Yes | Supabase Dashboard → **Project Settings → API** → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase Dashboard → **Project Settings → API** → `anon` `public` key |
| `RESEND_API_KEY` | No¹ | [resend.com](https://resend.com) → API Keys → Create API Key |
| `EMAIL_FROM` | No¹ | Your verified sending address, e.g. `Orbit <noreply@yourdomain.com>` |
| `ML_API_URL` | No² | The base URL of your deployed ML API, e.g. `https://qc-ml-api.onrender.com` |
| `ML_API_KEY` | No² | Optional — the `API_KEY` value set in your Render service's environment variables. Not your Render account key (`rnd_…`). |
| `VITE_ENABLE_AI_QC` | No | `true` to show AI features in the UI (default: `true`) |
| `VITE_ENABLE_CONTRACTS` | No | `true` to enable the contracts module (default: `true`) |

> ¹ **Email** — without these, the `send-email` edge function silently skips sending. The app still works; users just won't receive email notifications. See `docs/OPS_RUNBOOK.md` §1 for full SMTP setup including DNS records and auth email templates.
>
> ² **ML API** — without `ML_API_URL`, the `qc-ai-review` edge function falls back to a fixed confidence score of `p0 = 0.8` for all QC reviews. The QC workflow still functions normally. When hosting on Render, no API key is required — `ML_API_KEY` is optional and only needed if you add auth middleware to your ML API. See `docs/OPS_RUNBOOK.md` §2 and `docs/ML_MODEL_HOSTING.md`.

**For local development**, only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are needed to run the app.

**For production**, set the edge function secrets via the Supabase CLI rather than `.env` (`.env` is not read by deployed edge functions):

```bash
supabase secrets set RESEND_API_KEY=re_xxxx
supabase secrets set EMAIL_FROM="Orbit <noreply@yourdomain.com>"
supabase secrets set ML_API_URL=https://your-ml-api.com
supabase secrets set ML_API_KEY=your-ml-api-key
```

#### 3. Deploy edge functions (optional)

```bash
supabase login
supabase link --project-ref your-project-ref
supabase functions deploy qc-ai-review
supabase functions deploy send-email
```

Both edge functions degrade gracefully if their secrets are not set — the app is fully usable without them.

#### 4. Run locally

```bash
npm run dev
```

The app runs at `http://localhost:5173`.

#### 5. Deploy to Vercel (CLI)

```bash
npm i -g vercel
vercel --prod
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in your Vercel project's environment variables.

### Other Hosting

SvelteKit uses `adapter-auto` which auto-detects Vercel, Netlify, and Cloudflare. For other platforms, swap the adapter in `svelte.config.js`:

```bash
# Netlify
npm i -D @sveltejs/adapter-netlify

# Cloudflare Pages
npm i -D @sveltejs/adapter-cloudflare

# Node.js server
npm i -D @sveltejs/adapter-node
```

## Development

```bash
npm run dev          # Start dev server (localhost:5173)
npm run build        # Production build
npm run preview      # Preview production build
npm run check        # TypeScript type checking
npm run lint         # ESLint
npm run format       # Prettier formatting
```

## Roadmap

- [x] Web version (SvelteKit) — complete
- [x] AI/ML model for QC confidence scoring — complete (external repo, see `docs/ML_MODEL_HOSTING.md`)
- [x] Slack webhook integration — complete
- [x] Team analytics dashboard — complete
- [ ] Mobile app (Capacitor)
- [ ] Custom contract templates
- [ ] Multi-language support
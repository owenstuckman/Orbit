# Orbit - Gamified Workplace Platform

A gamified project management and digital workplace platform that incentivizes quality work through sophisticated payout systems. Profit-sharing is considered at all levels, and incentivization of employees is a priority

>"When a person is not doing his job, there can only be two reasons for it. The person either can't do it or won't do it; he >is either not capable or not motivated"  
> ~ Andy Grove "High Output Management"

This above quote is in what large part motivated this project and is what really interests me about the modern workforce. 

>"Measurement against a standard makes you think through WHY the results were what they were."
> ~ Andy Grove "High Output Management"

The other principal idea of this project is to quantify everything from an individual employee level. Sure, things like project management tools do this to an extent, but where is the standard? The ideas behind QC and payouts are largely derived due to this gap. 

Otherwise, the concept for this is it could act as wide as a full business wide management solution, or just as a way for a small group of friends to make a project and easily outsource. 

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

### Payout System
- Employee: `salary = s * r + Σ γ_i * (1 - r)`
- PM: `payout = ((base - spent) * X) - (overdraft * penalty) + bonus`
- QC: Shapley value marginals with geometric decay
- Sales: Commission with decay based on PM pickup time

## 📁 Project Structure

```
orbit-frontend/
├── src/
│   ├── lib/
│   │   ├── components/     # Reusable UI components
│   │   ├── stores/         # Svelte stores for state management
│   │   ├── services/       # API and Supabase services
│   │   ├── utils/          # Payout calculations, formatters
│   │   └── types/          # TypeScript type definitions
│   ├── routes/
│   │   ├── auth/           # Login, register pages
│   │   └── (app)/          # Authenticated app routes
│   │       ├── dashboard/  # Role-aware dashboard
│   │       ├── tasks/      # Task board and details
│   │       ├── projects/   # Project management
│   │       ├── qc/         # Quality control review
│   │       ├── contracts/  # Contract management
│   │       ├── payouts/    # Payout history
│   │       └── settings/   # User settings, salary mixer
│   └── app.css            # Tailwind + custom styles
├── supabase/
│   ├── migrations/        # Database schema
│   └── functions/         # Edge functions for payouts
└── static/               # Static assets
```

## 🛠 Tech Stack

- **Frontend**: SvelteKit, TypeScript, Tailwind CSS
- **Backend**: Supabase (PostgreSQL, Auth, Storage, Edge Functions, Realtime)
- **Icons**: Lucide Svelte

## Development


### Installation

1. **Clone and install dependencies**
   ```bash
   cd orbit-frontend
   npm install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   ```
   
   Add your Supabase credentials:
   ```
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

4. **Run dev server**
   ```bash
   npm run dev
   ```

### Deploy Edge Functions (Should be deployed via web)

```bash
supabase functions deploy calculate-payout
supabase functions deploy qc-ai-review
supabase functions deploy generate-contract
```


## Payout Formulas

See Wiki for more documentation and detailed explanations of the original though process

### Employee Salary
```
salary = base_salary * r + task_value * (1 - r)
```
Where `r` is the employee's chosen stability ratio (0.5 - 0.9)

### QC Shapley Values
```
d_1 = β * p_0 * V           (first pass marginal)
d_k = d_1 * γ^(k-1)         (geometric decay)
QC_payout = Σ d_k for k=1..K
```

### PM Profit Sharing
```
payout = (budget - spent) * X - overdraft * (1.5 * X) + bonus
```

## Roadmap

- [ ] Web version (Svelte)
- [ ] Mobile app (Capacitor)
- [ ] Slack integration
- [ ] Advanced ML model for QC
- [ ] Team analytics dashboard
- [ ] Slack/Teams/Project Management Tools integrations
- [ ] Custom contract templates


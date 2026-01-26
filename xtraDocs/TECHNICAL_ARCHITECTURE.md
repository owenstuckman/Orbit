# Orbit - Technical Architecture Document

This document contains the detailed technical architecture, database schema, and implementation patterns for the Orbit platform.

## Overview

Orbit is a gamified project management and digital workplace platform that incentivizes quality work through a sophisticated payout system. The platform supports multiple roles (Sales, PM, QC, Employee, Contractor) with role-based views and payout mechanisms driven by task completion, quality control, and Shapley value calculations.

**Tech Stack**: SvelteKit + Supabase (PostgreSQL, Auth, Storage, Edge Functions, Realtime)

---

## System Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         ORBIT PLATFORM                               │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    SvelteKit Frontend                        │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │    │
│  │  │  Sales   │ │    PM    │ │    QC    │ │ Employee │        │    │
│  │  │   View   │ │   View   │ │   View   │ │   View   │        │    │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘        │    │
│  │       │            │            │            │               │    │
│  │       └────────────┴────────────┴────────────┘               │    │
│  │                         │                                    │    │
│  │              ┌──────────▼──────────┐                         │    │
│  │              │   Shared Components  │                         │    │
│  │              │   • Task Board       │                         │    │
│  │              │   • Contract Viewer  │                         │    │
│  │              │   • Payout Dashboard │                         │    │
│  │              │   • QC Review Panel  │                         │    │
│  │              └──────────────────────┘                         │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                       │
│                              │ Supabase JS Client                    │
│                              ▼                                       │
├─────────────────────────────────────────────────────────────────────┤
│                        SUPABASE BACKEND                              │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                      PostgreSQL                              │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │    │
│  │  │  users   │ │ projects │ │  tasks   │ │ payouts  │        │    │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘        │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │    │
│  │  │contracts │ │qc_reviews│ │ metadata │ │  audit   │        │    │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘        │    │
│  │                                                              │    │
│  │  Row Level Security (RLS) - Role-based access                │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                       │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    Edge Functions                            │    │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐         │    │
│  │  │ Payout Calc  │ │ Shapley Calc │ │  QC AI Model │         │    │
│  │  └──────────────┘ └──────────────┘ └──────────────┘         │    │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐         │    │
│  │  │  Contract    │ │  Escalation  │ │  Reporting   │         │    │
│  │  │  Generator   │ │   Handler    │ │   Engine     │         │    │
│  │  └──────────────┘ └──────────────┘ └──────────────┘         │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                       │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    Realtime                                  │    │
│  │  • Task updates    • QC notifications    • Payout events    │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                       │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    Storage                                   │    │
│  │  • Task submissions   • Contracts   • QC evidence           │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Database Schema (PostgreSQL)

### Core Entities

```sql
-- Enums for type safety
CREATE TYPE user_role AS ENUM ('admin', 'sales', 'pm', 'qc', 'employee', 'contractor');
CREATE TYPE task_status AS ENUM ('open', 'assigned', 'in_progress', 'completed', 'under_review', 'approved', 'rejected', 'paid');
CREATE TYPE project_status AS ENUM ('draft', 'pending_pm', 'active', 'completed', 'cancelled');
CREATE TYPE qc_review_type AS ENUM ('ai', 'peer', 'independent');
CREATE TYPE contract_status AS ENUM ('draft', 'pending_signature', 'active', 'completed', 'disputed');

-- Organizations (multi-tenant support)
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    settings JSONB DEFAULT '{}',
    
    -- Payout configuration
    default_r DECIMAL(5,4) DEFAULT 0.7,      -- Default salary/task split
    r_bounds JSONB DEFAULT '{"min": 0.5, "max": 0.9}',
    qc_beta DECIMAL(5,4) DEFAULT 0.25,       -- Shapley beta
    qc_gamma DECIMAL(5,4) DEFAULT 0.4,       -- Shapley gamma
    pm_x DECIMAL(5,4) DEFAULT 0.5,           -- PM profit share rate
    pm_overdraft_penalty DECIMAL(5,4) DEFAULT 1.5,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users with role-based access
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    
    email TEXT NOT NULL,
    full_name TEXT,
    role user_role NOT NULL DEFAULT 'employee',
    
    -- Employee-specific fields
    base_salary DECIMAL(12,2),
    r DECIMAL(5,4),                          -- Personal salary/task ratio
    level INTEGER DEFAULT 1,                  -- Internal level
    training_level INTEGER DEFAULT 1,         -- Allowed task complexity
    
    -- Metadata for performance tracking
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(org_id, email)
);

-- Projects created by Sales, managed by PMs
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    
    name TEXT NOT NULL,
    description TEXT,
    status project_status DEFAULT 'draft',
    
    -- Financial
    total_value DECIMAL(12,2) NOT NULL,       -- Project budget
    story_points_budget INTEGER,               -- Converted to dollars
    spent DECIMAL(12,2) DEFAULT 0,
    
    -- Assignments
    sales_id UUID REFERENCES users(id),
    pm_id UUID REFERENCES users(id),
    
    -- Timing
    deadline TIMESTAMPTZ,
    days_left INTEGER GENERATED ALWAYS AS (
        GREATEST(0, EXTRACT(DAY FROM deadline - NOW())::INTEGER)
    ) STORED,
    
    -- PM bonus calculation (from Gamified - PM)
    pm_bonus DECIMAL(12,2) DEFAULT 0,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    picked_up_at TIMESTAMPTZ                  -- When PM accepted
);

-- Tasks on the task board
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    
    title TEXT NOT NULL,
    description TEXT,
    status task_status DEFAULT 'open',
    
    -- Sizing and value
    story_points INTEGER,
    dollar_value DECIMAL(10,2) NOT NULL,      -- gamma_i in formulas
    
    -- Assignment
    assignee_id UUID REFERENCES users(id),
    assigned_at TIMESTAMPTZ,
    
    -- Timing
    deadline TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    
    -- Scaling factor (increases as deadline approaches)
    urgency_multiplier DECIMAL(5,4) DEFAULT 1.0,
    
    -- Training/level requirements
    required_level INTEGER DEFAULT 1,
    
    -- Submission data
    submission_data JSONB,
    submission_files TEXT[],                   -- Storage bucket paths
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- QC Reviews (both AI and human)
CREATE TABLE qc_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    
    review_type qc_review_type NOT NULL,
    reviewer_id UUID REFERENCES users(id),    -- NULL for AI reviews
    
    -- Review outcome
    passed BOOLEAN,
    confidence DECIMAL(5,4),                   -- AI confidence score (p0)
    feedback TEXT,
    
    -- Shapley value components
    v0 DECIMAL(10,2),                          -- Worker baseline value
    d_k DECIMAL(10,2),                         -- Marginal value for this pass
    pass_number INTEGER DEFAULT 1,             -- k in formulas
    
    -- Weighting (peer=1, external=2)
    weight DECIMAL(3,2) DEFAULT 1.0,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Contracts (Quick Contracts system)
CREATE TABLE contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- Can be linked to task, project, or standalone
    task_id UUID REFERENCES tasks(id),
    project_id UUID REFERENCES projects(id),
    
    template_type TEXT NOT NULL,              -- 'task_assignment', 'project_pm', etc.
    status contract_status DEFAULT 'draft',
    
    -- Parties
    party_a_id UUID REFERENCES users(id) NOT NULL,
    party_b_id UUID REFERENCES users(id),     -- NULL for contractors
    party_b_email TEXT,                       -- For external contractors
    
    -- Contract data
    terms JSONB NOT NULL,                     -- Specific terms, rates, etc.
    
    -- Signatures
    party_a_signed_at TIMESTAMPTZ,
    party_b_signed_at TIMESTAMPTZ,
    
    -- Generated PDF storage path
    pdf_path TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payouts (audit trail)
CREATE TABLE payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    -- Source
    task_id UUID REFERENCES tasks(id),
    project_id UUID REFERENCES projects(id),
    qc_review_id UUID REFERENCES qc_reviews(id),
    
    payout_type TEXT NOT NULL,                -- 'task', 'qc', 'pm_bonus', 'sales_commission'
    
    -- Amounts
    gross_amount DECIMAL(10,2) NOT NULL,
    deductions DECIMAL(10,2) DEFAULT 0,
    net_amount DECIMAL(10,2) NOT NULL,
    
    -- Calculation details
    calculation_details JSONB,                -- Store formula inputs
    
    -- Status
    status TEXT DEFAULT 'pending',            -- 'pending', 'approved', 'paid'
    paid_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit log for all important actions
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID,
    
    old_data JSONB,
    new_data JSONB,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_users_org_role ON users(org_id, role);
CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_qc_reviews_task ON qc_reviews(task_id);
CREATE INDEX idx_payouts_user ON payouts(user_id);
CREATE INDEX idx_projects_pm ON projects(pm_id);
CREATE INDEX idx_projects_sales ON projects(sales_id);
```

### Row Level Security (RLS) Policies

```sql
-- Enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE qc_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;

-- Helper function to get current user's org and role
CREATE OR REPLACE FUNCTION get_user_context()
RETURNS TABLE(user_id UUID, org_id UUID, role user_role) AS $$
BEGIN
    RETURN QUERY
    SELECT u.id, u.org_id, u.role
    FROM users u
    WHERE u.auth_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Users can see other users in their org
CREATE POLICY users_org_read ON users
    FOR SELECT
    USING (org_id IN (SELECT org_id FROM get_user_context()));

-- Users can update their own profile
CREATE POLICY users_self_update ON users
    FOR UPDATE
    USING (auth_id = auth.uid())
    WITH CHECK (auth_id = auth.uid());

-- Tasks visibility based on role
CREATE POLICY tasks_read ON tasks
    FOR SELECT
    USING (
        org_id IN (SELECT org_id FROM get_user_context())
    );

-- Task assignment (only PM or admin can assign)
CREATE POLICY tasks_assign ON tasks
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM get_user_context() 
            WHERE role IN ('admin', 'pm')
        )
    );

-- Employees can only update tasks assigned to them
CREATE POLICY tasks_employee_update ON tasks
    FOR UPDATE
    USING (
        assignee_id IN (SELECT user_id FROM get_user_context())
    );

-- QC reviews - QC role can create
CREATE POLICY qc_reviews_create ON qc_reviews
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM get_user_context() 
            WHERE role IN ('admin', 'qc')
        )
    );

-- Projects visibility
CREATE POLICY projects_read ON projects
    FOR SELECT
    USING (org_id IN (SELECT org_id FROM get_user_context()));

-- PM can update their projects
CREATE POLICY projects_pm_update ON projects
    FOR UPDATE
    USING (
        pm_id IN (SELECT user_id FROM get_user_context())
        OR EXISTS (
            SELECT 1 FROM get_user_context() 
            WHERE role = 'admin'
        )
    );

-- Contracts - parties can view their contracts
CREATE POLICY contracts_read ON contracts
    FOR SELECT
    USING (
        party_a_id IN (SELECT user_id FROM get_user_context())
        OR party_b_id IN (SELECT user_id FROM get_user_context())
        OR EXISTS (
            SELECT 1 FROM get_user_context() 
            WHERE role = 'admin'
        )
    );

-- Payouts - users can see their own payouts
CREATE POLICY payouts_self_read ON payouts
    FOR SELECT
    USING (user_id IN (SELECT user_id FROM get_user_context()));

-- Admins can see all payouts in org
CREATE POLICY payouts_admin_read ON payouts
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM get_user_context() 
            WHERE role = 'admin' AND org_id = payouts.org_id
        )
    );
```

---

## Edge Functions

### 1. Payout Calculator

```typescript
// supabase/functions/calculate-payout/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface PayoutRequest {
  task_id: string
  user_id: string
}

interface ShapleyParams {
  V: number      // Total task value
  v0: number     // Worker baseline
  p0: number     // Model confidence
  beta: number   // Confidence scaling
  gamma: number  // Geometric decay
  K: number      // Number of QC passes
}

function computeMarginals(params: ShapleyParams): number[] {
  const { V, v0, p0, beta, gamma } = params
  const d1 = beta * p0 * V
  const marginals: number[] = []
  
  for (let k = 0; k < 10; k++) {
    marginals.push(d1 * Math.pow(gamma, k))
  }
  
  // Normalize if exceeds budget
  const totalMarginals = marginals.reduce((a, b) => a + b, 0)
  if (v0 + totalMarginals > V) {
    const alpha = (V - v0) / totalMarginals
    return marginals.map(d => d * alpha)
  }
  
  return marginals
}

function calculateEmployeePayout(
  baseSalary: number,
  r: number,
  taskValue: number
): { basePortion: number; taskPortion: number } {
  // salary = s * r + Σ γ_i * (1 - r)
  const basePortion = baseSalary * r
  const taskPortion = taskValue * (1 - r)
  return { basePortion, taskPortion }
}

function calculateQCPayout(params: ShapleyParams): number {
  const marginals = computeMarginals(params)
  // QC payout = sum of marginals up to K
  return marginals.slice(0, params.K).reduce((a, b) => a + b, 0)
}

function calculatePMPayout(
  base: number,
  spent: number,
  x: number,
  overdraft: number,
  overdraftPenalty: number,
  salesBonus: number
): number {
  // payout = ((base - spent) * X) - (overdraft * (1.5 * X)) + salesbonus
  const basePayout = (base - spent) * x
  const penalty = overdraft * (overdraftPenalty * x)
  return Math.max(0, basePayout - penalty + salesBonus)
}

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )
  
  const { task_id, calculation_type } = await req.json()
  
  // Fetch task and related data
  const { data: task } = await supabase
    .from('tasks')
    .select(`
      *,
      project:projects(*),
      assignee:users(*),
      qc_reviews(*)
    `)
    .eq('id', task_id)
    .single()
  
  // Fetch org settings
  const { data: org } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', task.org_id)
    .single()
  
  // Calculate based on type
  let payout = 0
  let details = {}
  
  switch (calculation_type) {
    case 'employee':
      const { basePortion, taskPortion } = calculateEmployeePayout(
        task.assignee.base_salary,
        task.assignee.r ?? org.default_r,
        task.dollar_value * task.urgency_multiplier
      )
      payout = taskPortion
      details = { basePortion, taskPortion, formula: 'γ_i * (1 - r)' }
      break
      
    case 'qc':
      const latestReview = task.qc_reviews[task.qc_reviews.length - 1]
      payout = calculateQCPayout({
        V: task.dollar_value,
        v0: task.dollar_value * 0.7, // Baseline worker value
        p0: latestReview?.confidence ?? 0.8,
        beta: org.qc_beta,
        gamma: org.qc_gamma,
        K: task.qc_reviews.filter(r => !r.passed).length
      })
      details = { beta: org.qc_beta, gamma: org.qc_gamma, passes: task.qc_reviews.length }
      break
      
    case 'pm':
      payout = calculatePMPayout(
        task.project.total_value,
        task.project.spent,
        org.pm_x,
        Math.max(0, task.project.spent - task.project.total_value),
        org.pm_overdraft_penalty,
        task.project.pm_bonus
      )
      details = { base: task.project.total_value, spent: task.project.spent }
      break
  }
  
  // Record payout
  await supabase.from('payouts').insert({
    org_id: task.org_id,
    user_id: task.assignee_id,
    task_id: task_id,
    payout_type: calculation_type,
    gross_amount: payout,
    net_amount: payout,
    calculation_details: details
  })
  
  return new Response(JSON.stringify({ payout, details }), {
    headers: { 'Content-Type': 'application/json' }
  })
})
```

### 2. QC AI Review

```typescript
// supabase/functions/qc-ai-review/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )
  
  const { task_id } = await req.json()
  
  // Fetch task with submission
  const { data: task } = await supabase
    .from('tasks')
    .select('*, project:projects(*)')
    .eq('id', task_id)
    .single()
  
  // TODO: Integrate actual ML model (BERT or similar)
  // For now, simulate confidence score based on task metadata
  const confidence = simulateConfidence(task)
  const passed = confidence > 0.75 // Threshold
  
  // Create AI review
  const { data: review } = await supabase
    .from('qc_reviews')
    .insert({
      task_id,
      review_type: 'ai',
      passed,
      confidence,
      feedback: passed 
        ? 'Automated review passed' 
        : 'Flagged for manual review',
      v0: task.dollar_value * 0.7,
      d_k: calculateMarginal(task.dollar_value, confidence),
      pass_number: 1
    })
    .select()
    .single()
  
  // If failed, flag for manual review
  if (!passed) {
    await supabase.from('tasks').update({
      status: 'under_review'
    }).eq('id', task_id)
  }
  
  return new Response(JSON.stringify({ review, passed, confidence }), {
    headers: { 'Content-Type': 'application/json' }
  })
})

function simulateConfidence(task: any): number {
  // Placeholder - replace with actual ML model
  // Factors: task complexity, assignee history, submission completeness
  return 0.7 + Math.random() * 0.25
}

function calculateMarginal(V: number, p0: number, beta = 0.25): number {
  return beta * p0 * V
}
```

### 3. Contract Generator

```typescript
// supabase/functions/generate-contract/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TEMPLATES = {
  task_assignment: {
    title: 'Task Assignment Contract',
    sections: ['parties', 'task_description', 'compensation', 'timeline', 'quality_requirements']
  },
  project_pm: {
    title: 'Project Management Agreement',
    sections: ['parties', 'project_scope', 'budget', 'profit_sharing', 'overdraft_terms']
  },
  contractor: {
    title: 'Contractor Agreement',
    sections: ['parties', 'scope', 'compensation', 'ip_rights', 'termination']
  }
}

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )
  
  const { template_type, task_id, project_id, party_a_id, party_b_id, terms } = await req.json()
  
  const template = TEMPLATES[template_type]
  if (!template) {
    return new Response(JSON.stringify({ error: 'Invalid template type' }), { status: 400 })
  }
  
  // Fetch party information
  const { data: partyA } = await supabase
    .from('users')
    .select('*')
    .eq('id', party_a_id)
    .single()
  
  const { data: partyB } = party_b_id 
    ? await supabase.from('users').select('*').eq('id', party_b_id).single()
    : { data: null }
  
  // Create contract record
  const { data: contract, error } = await supabase
    .from('contracts')
    .insert({
      org_id: partyA.org_id,
      template_type,
      task_id,
      project_id,
      party_a_id,
      party_b_id,
      party_b_email: terms.contractor_email,
      terms: {
        ...terms,
        template: template.title,
        sections: template.sections,
        party_a_name: partyA.full_name,
        party_b_name: partyB?.full_name || terms.contractor_name
      },
      status: 'pending_signature'
    })
    .select()
    .single()
  
  if (error) {
    return new Response(JSON.stringify({ error }), { status: 500 })
  }
  
  // TODO: Generate PDF using a library like pdfmake
  // Store in Supabase Storage
  
  return new Response(JSON.stringify({ contract }), {
    headers: { 'Content-Type': 'application/json' }
  })
})
```

---

## Frontend Structure (SvelteKit)

```
orbit-frontend/
├── src/
│   ├── lib/
│   │   ├── components/
│   │   │   ├── common/
│   │   │   │   ├── Button.svelte
│   │   │   │   ├── Card.svelte
│   │   │   │   ├── Modal.svelte
│   │   │   │   ├── Toast.svelte
│   │   │   │   └── Avatar.svelte
│   │   │   ├── dashboard/
│   │   │   │   ├── StatsCard.svelte
│   │   │   │   ├── PayoutChart.svelte
│   │   │   │   └── RecentActivity.svelte
│   │   │   ├── tasks/
│   │   │   │   ├── TaskBoard.svelte
│   │   │   │   ├── TaskCard.svelte
│   │   │   │   ├── TaskDetail.svelte
│   │   │   │   └── TaskFilters.svelte
│   │   │   ├── projects/
│   │   │   │   ├── ProjectList.svelte
│   │   │   │   ├── ProjectCard.svelte
│   │   │   │   └── ProjectBudget.svelte
│   │   │   ├── qc/
│   │   │   │   ├── ReviewQueue.svelte
│   │   │   │   ├── ReviewPanel.svelte
│   │   │   │   └── ConfidenceIndicator.svelte
│   │   │   ├── contracts/
│   │   │   │   ├── ContractViewer.svelte
│   │   │   │   ├── SignaturePanel.svelte
│   │   │   │   └── ContractList.svelte
│   │   │   └── payouts/
│   │   │       ├── PayoutHistory.svelte
│   │   │       ├── PayoutBreakdown.svelte
│   │   │       └── SalaryMixer.svelte
│   │   ├── stores/
│   │   │   ├── auth.ts
│   │   │   ├── user.ts
│   │   │   ├── tasks.ts
│   │   │   ├── projects.ts
│   │   │   ├── qc.ts
│   │   │   └── payouts.ts
│   │   ├── services/
│   │   │   ├── supabase.ts
│   │   │   ├── api.ts
│   │   │   └── calculations.ts
│   │   ├── utils/
│   │   │   ├── format.ts
│   │   │   ├── payout.ts
│   │   │   └── shapley.ts
│   │   └── types/
│   │       └── index.ts
│   ├── routes/
│   │   ├── +layout.svelte
│   │   ├── +layout.server.ts
│   │   ├── +page.svelte              # Landing/Login
│   │   ├── auth/
│   │   │   ├── login/+page.svelte
│   │   │   └── register/+page.svelte
│   │   └── (app)/                    # Auth-required routes
│   │       ├── +layout.svelte        # App shell with nav
│   │       ├── +layout.server.ts     # Auth check
│   │       ├── dashboard/
│   │       │   └── +page.svelte      # Role-aware dashboard
│   │       ├── tasks/
│   │       │   ├── +page.svelte      # Task board
│   │       │   └── [id]/+page.svelte # Task detail
│   │       ├── projects/
│   │       │   ├── +page.svelte
│   │       │   └── [id]/+page.svelte
│   │       ├── qc/
│   │       │   ├── +page.svelte      # QC review queue
│   │       │   └── [taskId]/+page.svelte
│   │       ├── contracts/
│   │       │   ├── +page.svelte
│   │       │   └── [id]/+page.svelte
│   │       ├── payouts/
│   │       │   └── +page.svelte
│   │       └── settings/
│   │           └── +page.svelte      # Salary mixer, preferences
│   ├── app.html
│   ├── app.css
│   └── hooks.server.ts
├── static/
├── package.json
├── svelte.config.js
├── tailwind.config.js
└── vite.config.ts
```

---

## Key Technical Decisions

### 1. Real-time Subscriptions

Use Supabase Realtime for:
- Task status changes (instant board updates)
- QC review completions
- Payout approvals
- Contract signatures

```typescript
// lib/stores/tasks.ts
import { supabase } from '$lib/services/supabase'
import { writable } from 'svelte/store'

export const tasks = writable<Task[]>([])

export function subscribeToTasks(projectId: string) {
  const channel = supabase
    .channel('tasks')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'tasks',
        filter: `project_id=eq.${projectId}`
      },
      (payload) => {
        tasks.update(t => {
          // Handle insert, update, delete
          if (payload.eventType === 'INSERT') {
            return [...t, payload.new as Task]
          }
          if (payload.eventType === 'UPDATE') {
            return t.map(task => 
              task.id === payload.new.id ? payload.new as Task : task
            )
          }
          if (payload.eventType === 'DELETE') {
            return t.filter(task => task.id !== payload.old.id)
          }
          return t
        })
      }
    )
    .subscribe()
  
  return () => supabase.removeChannel(channel)
}
```

### 2. Role-Based UI Rendering

```svelte
<!-- lib/components/dashboard/RoleDashboard.svelte -->
<script lang="ts">
  import { user } from '$lib/stores/user'
  import SalesDashboard from './SalesDashboard.svelte'
  import PMDashboard from './PMDashboard.svelte'
  import QCDashboard from './QCDashboard.svelte'
  import EmployeeDashboard from './EmployeeDashboard.svelte'
</script>

{#if $user.role === 'sales'}
  <SalesDashboard />
{:else if $user.role === 'pm'}
  <PMDashboard />
{:else if $user.role === 'qc'}
  <QCDashboard />
{:else if $user.role === 'employee' || $user.role === 'contractor'}
  <EmployeeDashboard />
{:else if $user.role === 'admin'}
  <!-- Admin sees all dashboards -->
  <div class="grid grid-cols-2 gap-4">
    <SalesDashboard compact />
    <PMDashboard compact />
    <QCDashboard compact />
  </div>
{/if}
```

### 3. Payout Calculations (Client-side for preview)

```typescript
// lib/utils/payout.ts
export interface PayoutParams {
  baseSalary: number
  r: number
  taskValue: number
  urgencyMultiplier: number
}

export function calculateTaskPayout(params: PayoutParams): number {
  // γ_i * (1 - r) * urgency
  return params.taskValue * (1 - params.r) * params.urgencyMultiplier
}

export function calculateSalaryBreakdown(
  baseSalary: number,
  r: number,
  completedTasksValue: number
): { base: number; tasks: number; total: number } {
  const base = baseSalary * r
  const tasks = completedTasksValue * (1 - r)
  return { base, tasks, total: base + tasks }
}

// lib/utils/shapley.ts
export function computeQCMarginals(
  V: number,
  p0: number,
  beta: number,
  gamma: number,
  maxPasses: number = 5
): number[] {
  const d1 = beta * p0 * V
  const marginals = Array.from({ length: maxPasses }, (_, k) => d1 * Math.pow(gamma, k))
  
  const v0 = V * 0.7 // Worker baseline
  const total = marginals.reduce((a, b) => a + b, 0)
  
  if (v0 + total > V) {
    const alpha = (V - v0) / total
    return marginals.map(d => d * alpha)
  }
  
  return marginals
}

export function expectedQCPayout(
  marginals: number[],
  p0: number,
  pRe: number
): number {
  // E[QC] = d1 * (1-p0) / (1 - (1-pRe)*gamma)
  const d1 = marginals[0]
  const gamma = marginals.length > 1 ? marginals[1] / d1 : 0.4
  
  if ((1 - pRe) * gamma >= 1) return d1 * (1 - p0)
  
  return d1 * (1 - p0) / (1 - (1 - pRe) * gamma)
}
```

---

## Feature Flags System

The platform supports organization-level feature flags, allowing admins to enable/disable functionality per organization. This enables tiered offerings and gradual feature rollouts.

### Database Schema

Feature flags are stored in the `organizations.settings` JSONB column under the `feature_flags` key:

```sql
-- Example settings structure
{
  "feature_flags": {
    "tasks": true,
    "projects": true,
    "qc_reviews": true,
    "contracts": true,
    "payouts": true,
    "achievements": true,
    "leaderboard": true,
    "analytics": true,
    "notifications_page": true,
    "external_assignments": true,
    "salary_mixer": true,
    "file_uploads": true,
    "realtime_updates": true,
    "story_points": true,
    "urgency_multipliers": true,
    "ai_qc_review": false,
    "multi_org": false
  }
}
```

### Database Functions

```sql
-- Get feature flag preset (used during registration)
CREATE OR REPLACE FUNCTION get_feature_flag_preset(p_preset text)
RETURNS jsonb AS $$
BEGIN
  RETURN CASE p_preset
    WHEN 'all_features' THEN jsonb_build_object(
      'tasks', true, 'projects', true, 'qc_reviews', true, 'contracts', true,
      'payouts', true, 'achievements', true, 'leaderboard', true, 'analytics', true,
      'notifications_page', true, 'external_assignments', true, 'salary_mixer', true,
      'file_uploads', true, 'realtime_updates', true, 'story_points', true,
      'urgency_multipliers', true, 'ai_qc_review', true, 'multi_org', true
    )
    WHEN 'minimal' THEN jsonb_build_object(
      'tasks', true, 'projects', true, 'qc_reviews', false, 'contracts', false,
      'payouts', true, 'achievements', false, 'leaderboard', false, 'analytics', false,
      'notifications_page', false, 'external_assignments', false, 'salary_mixer', false,
      'file_uploads', true, 'realtime_updates', false, 'story_points', false,
      'urgency_multipliers', false, 'ai_qc_review', false, 'multi_org', false
    )
    WHEN 'none' THEN jsonb_build_object(
      'tasks', false, 'projects', false, ... -- all false
    )
    ELSE -- 'standard' default
      jsonb_build_object(
        'tasks', true, 'projects', true, 'qc_reviews', true, 'contracts', true,
        'payouts', true, 'achievements', true, 'leaderboard', true, 'analytics', true,
        'notifications_page', true, 'external_assignments', true, 'salary_mixer', true,
        'file_uploads', true, 'realtime_updates', true, 'story_points', true,
        'urgency_multipliers', true, 'ai_qc_review', false, 'multi_org', false
      )
  END;
END;
$$ LANGUAGE plpgsql;

-- Registration with preset selection
CREATE OR REPLACE FUNCTION register_user_and_org(
  p_auth_id uuid,
  p_email text,
  p_full_name text,
  p_org_name text,
  p_feature_preset text DEFAULT 'standard'
) RETURNS jsonb AS $$
DECLARE
  v_feature_flags jsonb;
BEGIN
  v_feature_flags := get_feature_flag_preset(p_feature_preset);

  INSERT INTO organizations (name, settings)
  VALUES (p_org_name, jsonb_build_object('feature_flags', v_feature_flags))
  ...
END;
$$ LANGUAGE plpgsql;
```

### Frontend Architecture

```
src/lib/
├── config/
│   └── featureFlags.ts       # Presets, metadata, helper functions
├── stores/
│   └── featureFlags.ts       # Reactive store derived from organization
├── components/
│   ├── admin/
│   │   └── FeatureFlagsPanel.svelte  # Admin toggle interface
│   └── auth/
│       └── FeaturePresetSelector.svelte  # Registration preset picker
└── types/
    └── index.ts              # FeatureFlags, FeatureFlagPreset types
```

### Feature Flag Store

```typescript
// src/lib/stores/featureFlags.ts
import { derived } from 'svelte/store';
import { organization } from './auth';

export const featureFlags = derived(
  organization,
  ($org): FeatureFlags => {
    if (!$org) return DEFAULT_FEATURE_FLAGS;
    return resolveFeatureFlags($org.settings?.feature_flags);
  }
);

// Individual feature stores for reactive checks
export const features = {
  tasks: derived(featureFlags, ($f) => $f.tasks),
  projects: derived(featureFlags, ($f) => $f.projects),
  // ... all 17 features
};
```

### Navigation Integration

The app layout conditionally renders navigation items based on feature flags combined with role permissions:

```svelte
$: navItems = [
  {
    href: '/tasks',
    label: 'Tasks',
    icon: CheckSquare,
    show: $featureFlags.tasks && ['employee', 'contractor', 'pm', 'admin'].includes($currentOrgRole)
  },
  {
    href: '/analytics',
    label: 'Analytics',
    icon: BarChart3,
    show: $featureFlags.analytics && ['admin', 'pm'].includes($currentOrgRole)
  },
  // ...
].filter(item => item.show);
```

### Feature Categories

| Category | Features | Description |
|----------|----------|-------------|
| Core | tasks, projects, qc_reviews, contracts, payouts, file_uploads | Essential platform functionality |
| Gamification | achievements, leaderboard | Employee engagement features |
| Advanced | analytics, notifications_page, external_assignments, salary_mixer, story_points, urgency_multipliers | Enhanced capabilities |
| Integrations | realtime_updates, ai_qc_review, multi_org | External service integrations |

---

## Extensibility Patterns

### 1. Plugin System for Custom Payout Rules

```typescript
// lib/services/payout-plugins.ts
export interface PayoutPlugin {
  name: string
  calculateModifier(context: PayoutContext): number
}

export interface PayoutContext {
  task: Task
  user: User
  org: Organization
  basePayout: number
}

const plugins: PayoutPlugin[] = []

export function registerPlugin(plugin: PayoutPlugin) {
  plugins.push(plugin)
}

export function applyPlugins(context: PayoutContext): number {
  return plugins.reduce(
    (payout, plugin) => payout * plugin.calculateModifier(context),
    context.basePayout
  )
}

// Example: Streak bonus plugin
registerPlugin({
  name: 'streak_bonus',
  calculateModifier: (ctx) => {
    const streak = ctx.user.metadata?.current_streak ?? 0
    if (streak >= 5) return 1.1 // 10% bonus for 5+ day streak
    return 1.0
  }
})
```

### 2. Custom Role Definitions

```typescript
// lib/types/roles.ts
export interface RoleCapabilities {
  canViewTasks: boolean
  canCreateTasks: boolean
  canAssignTasks: boolean
  canAcceptTasks: boolean
  canReviewQC: boolean
  canViewPayouts: 'self' | 'team' | 'all'
  canCreateProjects: boolean
  canManageProjects: boolean
  canViewContracts: 'own' | 'team' | 'all'
  canSignContracts: boolean
  canAccessSettings: 'own' | 'org'
}

export const ROLE_CAPABILITIES: Record<string, RoleCapabilities> = {
  admin: {
    canViewTasks: true,
    canCreateTasks: true,
    canAssignTasks: true,
    canAcceptTasks: false,
    canReviewQC: true,
    canViewPayouts: 'all',
    canCreateProjects: true,
    canManageProjects: true,
    canViewContracts: 'all',
    canSignContracts: true,
    canAccessSettings: 'org'
  },
  pm: {
    canViewTasks: true,
    canCreateTasks: true,
    canAssignTasks: true,
    canAcceptTasks: false,
    canReviewQC: false,
    canViewPayouts: 'team',
    canCreateProjects: false,
    canManageProjects: true,
    canViewContracts: 'team',
    canSignContracts: true,
    canAccessSettings: 'own'
  },
  // ... other roles
}
```

### 3. Event System for Custom Integrations

```typescript
// lib/services/events.ts
import { createNanoEvents } from 'nanoevents'

interface Events {
  'task:completed': (task: Task) => void
  'task:assigned': (task: Task, user: User) => void
  'qc:reviewed': (review: QCReview) => void
  'payout:calculated': (payout: Payout) => void
  'contract:signed': (contract: Contract) => void
  'project:overdraft': (project: Project) => void
}

export const emitter = createNanoEvents<Events>()

// Usage in components:
// emitter.on('task:completed', async (task) => {
//   await sendSlackNotification(task)
// })
```

---

## Appendix: Supabase Setup Checklist

1. Create Supabase project
2. Run database migrations (schema above)
3. Configure Auth providers
4. Set up Storage buckets:
   - `submissions` - Task submission files
   - `contracts` - Generated PDFs
   - `avatars` - User profile images
5. Deploy Edge Functions
6. Configure RLS policies
7. Set up Realtime for relevant tables
8. Configure environment variables
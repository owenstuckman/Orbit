-- Orbit Database Schema
-- Run this in Supabase SQL Editor to set up the complete database

-- ============================================================================
-- ENUMS
-- ============================================================================

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
    default_r DECIMAL(5,4) DEFAULT 0.7,
    r_bounds JSONB DEFAULT '{"min": 0.5, "max": 0.9}',
    qc_beta DECIMAL(5,4) DEFAULT 0.25,
    qc_gamma DECIMAL(5,4) DEFAULT 0.4,
    pm_x DECIMAL(5,4) DEFAULT 0.5,
    pm_overdraft_penalty DECIMAL(5,4) DEFAULT 1.5,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT,
    role user_role NOT NULL DEFAULT 'employee',
    base_salary DECIMAL(12,2),
    r DECIMAL(5,4),
    level INTEGER DEFAULT 1,
    training_level INTEGER DEFAULT 1,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(org_id, email)
);

-- Projects
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    status project_status DEFAULT 'draft',
    total_value DECIMAL(12,2) NOT NULL,
    story_points_budget INTEGER,
    spent DECIMAL(12,2) DEFAULT 0,
    sales_id UUID REFERENCES users(id),
    pm_id UUID REFERENCES users(id),
    deadline TIMESTAMPTZ,
    pm_bonus DECIMAL(12,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    picked_up_at TIMESTAMPTZ
);

-- Tasks
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    status task_status DEFAULT 'open',
    story_points INTEGER,
    dollar_value DECIMAL(10,2) NOT NULL,
    assignee_id UUID REFERENCES users(id),
    assigned_at TIMESTAMPTZ,
    deadline TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    urgency_multiplier DECIMAL(5,4) DEFAULT 1.0,
    required_level INTEGER DEFAULT 1,
    submission_data JSONB,
    submission_files TEXT[],
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- QC Reviews
CREATE TABLE qc_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE NOT NULL,
    review_type qc_review_type NOT NULL,
    reviewer_id UUID REFERENCES users(id),
    passed BOOLEAN,
    confidence DECIMAL(5,4),
    feedback TEXT,
    v0 DECIMAL(10,2),
    d_k DECIMAL(10,2),
    pass_number INTEGER DEFAULT 1,
    weight DECIMAL(3,2) DEFAULT 1.0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Contracts
CREATE TABLE contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    task_id UUID REFERENCES tasks(id),
    project_id UUID REFERENCES projects(id),
    template_type TEXT NOT NULL,
    status contract_status DEFAULT 'draft',
    party_a_id UUID REFERENCES users(id) NOT NULL,
    party_b_id UUID REFERENCES users(id),
    party_b_email TEXT,
    terms JSONB NOT NULL DEFAULT '{}',
    party_a_signed_at TIMESTAMPTZ,
    party_b_signed_at TIMESTAMPTZ,
    pdf_path TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payouts
CREATE TABLE payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    task_id UUID REFERENCES tasks(id),
    project_id UUID REFERENCES projects(id),
    qc_review_id UUID REFERENCES qc_reviews(id),
    payout_type TEXT NOT NULL,
    gross_amount DECIMAL(10,2) NOT NULL,
    deductions DECIMAL(10,2) DEFAULT 0,
    net_amount DECIMAL(10,2) NOT NULL,
    calculation_details JSONB DEFAULT '{}',
    status TEXT DEFAULT 'pending',
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit Log
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

-- Indexes
CREATE INDEX idx_users_org_role ON users(org_id, role);
CREATE INDEX idx_users_auth_id ON users(auth_id);
CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_qc_reviews_task ON qc_reviews(task_id);
CREATE INDEX idx_payouts_user ON payouts(user_id);
CREATE INDEX idx_projects_pm ON projects(pm_id);
CREATE INDEX idx_projects_sales ON projects(sales_id);

-- Enable RLS
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE qc_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;

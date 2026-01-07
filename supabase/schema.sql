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
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    -- External contractor fields
    is_external BOOLEAN DEFAULT FALSE,
    external_contractor_name TEXT,
    external_contractor_email TEXT,
    external_submission_token TEXT UNIQUE,
    contract_id UUID REFERENCES contracts(id),
    -- Organization fields
    tags TEXT[] DEFAULT '{}',
    sort_order INTEGER DEFAULT 0
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

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- Helper function to get current user's org_id (avoids recursive RLS on users table)
CREATE OR REPLACE FUNCTION get_my_org_id()
RETURNS UUID
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
    SELECT org_id FROM users WHERE auth_id = auth.uid() LIMIT 1;
$$;

-- Helper function to get current user's id
CREATE OR REPLACE FUNCTION get_my_user_id()
RETURNS UUID
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
    SELECT id FROM users WHERE auth_id = auth.uid() LIMIT 1;
$$;

-- Helper function to get current user's role
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS user_role
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
    SELECT role FROM users WHERE auth_id = auth.uid() LIMIT 1;
$$;

-- Users policies (non-recursive - use auth_id directly)
CREATE POLICY "Users can read own profile"
    ON users FOR SELECT
    USING (auth_id = auth.uid());

CREATE POLICY "Users can update own profile"
    ON users FOR UPDATE
    USING (auth_id = auth.uid());

CREATE POLICY "Users can insert own profile"
    ON users FOR INSERT
    WITH CHECK (auth_id = auth.uid());

-- Organizations policies (use helper function)
CREATE POLICY "Users can view own organization"
    ON organizations FOR SELECT
    USING (id = get_my_org_id());

CREATE POLICY "Admins can update their organization"
    ON organizations FOR UPDATE
    USING (id = get_my_org_id() AND get_my_role() = 'admin');

-- Projects policies
CREATE POLICY "Users can view projects in their organization"
    ON projects FOR SELECT
    USING (org_id = get_my_org_id());

CREATE POLICY "PMs and admins can create projects"
    ON projects FOR INSERT
    WITH CHECK (org_id = get_my_org_id() AND get_my_role() IN ('admin', 'pm', 'sales'));

CREATE POLICY "PMs and admins can update projects"
    ON projects FOR UPDATE
    USING (org_id = get_my_org_id() AND get_my_role() IN ('admin', 'pm'));

-- Tasks policies
CREATE POLICY "Users can view tasks in their organization"
    ON tasks FOR SELECT
    USING (org_id = get_my_org_id());

CREATE POLICY "PMs and admins can create tasks"
    ON tasks FOR INSERT
    WITH CHECK (org_id = get_my_org_id() AND get_my_role() IN ('admin', 'pm'));

CREATE POLICY "Users can update their tasks or if admin/pm"
    ON tasks FOR UPDATE
    USING (
        org_id = get_my_org_id()
        AND (assignee_id = get_my_user_id() OR get_my_role() IN ('admin', 'pm'))
    );

-- QC Reviews policies
CREATE POLICY "Users can view QC reviews in their organization"
    ON qc_reviews FOR SELECT
    USING (task_id IN (SELECT id FROM tasks WHERE org_id = get_my_org_id()));

CREATE POLICY "QC and admins can create reviews"
    ON qc_reviews FOR INSERT
    WITH CHECK (get_my_role() IN ('admin', 'qc'));

-- Contracts policies
CREATE POLICY "Users can view contracts they are party to or if admin"
    ON contracts FOR SELECT
    USING (
        party_a_id = get_my_user_id()
        OR party_b_id = get_my_user_id()
        OR (org_id = get_my_org_id() AND get_my_role() = 'admin')
    );

CREATE POLICY "Users can create contracts"
    ON contracts FOR INSERT
    WITH CHECK (org_id = get_my_org_id());

CREATE POLICY "Parties can update contracts"
    ON contracts FOR UPDATE
    USING (party_a_id = get_my_user_id() OR party_b_id = get_my_user_id());

-- Payouts policies
CREATE POLICY "Users can view their own payouts"
    ON payouts FOR SELECT
    USING (user_id = get_my_user_id());

CREATE POLICY "Admins can view all payouts in their organization"
    ON payouts FOR SELECT
    USING (org_id = get_my_org_id() AND get_my_role() = 'admin');

CREATE POLICY "Admins and PMs can create payouts"
    ON payouts FOR INSERT
    WITH CHECK (org_id = get_my_org_id() AND get_my_role() IN ('admin', 'pm'));

-- ============================================================================
-- RPC FUNCTIONS FOR EXTERNAL WORK ASSIGNMENT
-- ============================================================================

-- Assign a task to an external contractor
CREATE OR REPLACE FUNCTION assign_task_externally(
    p_task_id UUID,
    p_contractor_name TEXT,
    p_contractor_email TEXT,
    p_use_guest_link BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_task RECORD;
    v_contract_id UUID;
    v_submission_token TEXT;
    v_assigner_id UUID;
BEGIN
    -- Get the current user
    SELECT id INTO v_assigner_id FROM users WHERE auth_id = auth.uid();
    IF v_assigner_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'User not found');
    END IF;

    -- Get the task and verify it's available
    SELECT * INTO v_task FROM tasks WHERE id = p_task_id;
    IF v_task IS NULL OR v_task.status != 'open' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Task not available');
    END IF;

    -- Generate submission token if using guest link
    IF p_use_guest_link THEN
        v_submission_token := encode(gen_random_bytes(16), 'hex');
    END IF;

    -- Create the contract
    INSERT INTO contracts (org_id, task_id, template_type, status, party_a_id, party_b_email, terms)
    VALUES (
        v_task.org_id,
        p_task_id,
        'task_assignment',
        'pending_signature',
        v_assigner_id,
        p_contractor_email,
        jsonb_build_object(
            'task_title', v_task.title,
            'compensation', v_task.dollar_value,
            'contractor_name', p_contractor_name
        )
    )
    RETURNING id INTO v_contract_id;

    -- Update the task with external assignment info
    UPDATE tasks SET
        is_external = true,
        external_contractor_name = p_contractor_name,
        external_contractor_email = p_contractor_email,
        external_submission_token = v_submission_token,
        contract_id = v_contract_id,
        status = 'assigned',
        assigned_at = NOW()
    WHERE id = p_task_id;

    RETURN jsonb_build_object(
        'success', true,
        'contract_id', v_contract_id,
        'submission_token', v_submission_token,
        'task_id', p_task_id
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Get task details by submission token (for external contractors)
CREATE OR REPLACE FUNCTION get_task_by_submission_token(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_task RECORD;
BEGIN
    SELECT t.*, p.name as project_name INTO v_task
    FROM tasks t
    LEFT JOIN projects p ON t.project_id = p.id
    WHERE t.external_submission_token = p_token;

    IF v_task IS NULL THEN
        RETURN NULL;
    END IF;

    RETURN jsonb_build_object(
        'id', v_task.id,
        'title', v_task.title,
        'description', v_task.description,
        'status', v_task.status,
        'dollar_value', v_task.dollar_value,
        'deadline', v_task.deadline,
        'story_points', v_task.story_points,
        'tags', v_task.tags,
        'external_contractor_email', v_task.external_contractor_email,
        'project', CASE
            WHEN v_task.project_name IS NOT NULL
            THEN jsonb_build_object('name', v_task.project_name)
            ELSE NULL
        END
    );
END;
$$;

-- Submit work from external contractor
CREATE OR REPLACE FUNCTION submit_external_work(
    p_submission_token TEXT,
    p_submission_data JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_task RECORD;
BEGIN
    -- Find task by submission token
    SELECT * INTO v_task FROM tasks WHERE external_submission_token = p_submission_token;

    IF v_task IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid token');
    END IF;

    IF v_task.status NOT IN ('assigned', 'in_progress') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Task not accepting submissions');
    END IF;

    -- Update task with submission data and set to under_review for QC workflow
    UPDATE tasks SET
        status = 'under_review',
        completed_at = NOW(),
        submission_data = p_submission_data
    WHERE id = v_task.id;

    RETURN jsonb_build_object('success', true, 'task_id', v_task.id);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

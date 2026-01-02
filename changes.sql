-- ============================================================================
-- Orbit Database Changes
-- Run this after the base schema.sql to apply all feature additions
-- ============================================================================

-- ============================================================================
-- 1. ENUMS
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'expired', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE permission_level AS ENUM ('none', 'view', 'work', 'manage', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 2. SCHEMA CHANGES
-- ============================================================================

-- Organization ownership
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id);

-- User invitations
CREATE TABLE IF NOT EXISTS user_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    email TEXT NOT NULL,
    role user_role NOT NULL DEFAULT 'employee',
    invited_by UUID REFERENCES users(id) NOT NULL,
    token TEXT NOT NULL UNIQUE,
    status invitation_status DEFAULT 'pending',
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    accepted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_invitations_token ON user_invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_org ON user_invitations(org_id);
ALTER TABLE user_invitations ENABLE ROW LEVEL SECURITY;

-- Multi-organization memberships
CREATE TABLE IF NOT EXISTS user_org_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    role user_role NOT NULL DEFAULT 'employee',
    is_primary BOOLEAN DEFAULT false,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, org_id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_user ON user_org_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_org ON user_org_memberships(org_id);
ALTER TABLE user_org_memberships ENABLE ROW LEVEL SECURITY;

-- Task enhancements: tags, ordering, external work
ALTER TABLE tasks
    ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS is_external BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS external_contractor_name TEXT,
    ADD COLUMN IF NOT EXISTS external_contractor_email TEXT,
    ADD COLUMN IF NOT EXISTS external_submission_token TEXT UNIQUE,
    ADD COLUMN IF NOT EXISTS contract_id UUID REFERENCES contracts(id);

CREATE INDEX IF NOT EXISTS idx_tasks_tags ON tasks USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_tasks_sort_order ON tasks(project_id, status, sort_order);
CREATE INDEX IF NOT EXISTS idx_tasks_external_token ON tasks(external_submission_token) WHERE external_submission_token IS NOT NULL;

-- Guest projects (anonymous users can create projects before signing in)
CREATE TABLE IF NOT EXISTS guest_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    tasks JSONB DEFAULT '[]',
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days')
);

CREATE INDEX IF NOT EXISTS idx_guest_projects_session ON guest_projects(session_id);
CREATE INDEX IF NOT EXISTS idx_guest_projects_expires ON guest_projects(expires_at);
ALTER TABLE guest_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can manage guest projects by session" ON guest_projects;
CREATE POLICY "Anyone can manage guest projects by session" ON guest_projects
    FOR ALL TO anon, authenticated
    USING (true)
    WITH CHECK (true);

-- Granular access control
CREATE TABLE IF NOT EXISTS project_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    permission_level permission_level NOT NULL DEFAULT 'view',
    granted_by UUID REFERENCES users(id) NOT NULL,
    granted_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, user_id)
);

CREATE TABLE IF NOT EXISTS team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    added_at TIMESTAMPTZ DEFAULT NOW(),
    added_by UUID REFERENCES users(id) NOT NULL,
    UNIQUE(project_id, user_id)
);

-- ============================================================================
-- 3. HELPER FUNCTIONS (in public schema)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.current_user_org_id()
RETURNS UUID AS $$
  SELECT org_id FROM public.users WHERE auth_id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT AS $$
  SELECT role::TEXT FROM public.users WHERE auth_id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.current_user_id()
RETURNS UUID AS $$
  SELECT id FROM public.users WHERE auth_id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_org_owner()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organizations o
    JOIN public.users u ON u.org_id = o.id
    WHERE u.auth_id = auth.uid() AND o.owner_id = u.id
  )
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ============================================================================
-- 4. RPC FUNCTIONS
-- ============================================================================

-- Drop existing functions first to avoid signature conflicts
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT ns.nspname, p.proname,
               pg_catalog.pg_get_function_identity_arguments(p.oid) as args
        FROM pg_catalog.pg_proc p
        JOIN pg_catalog.pg_namespace ns ON p.pronamespace = ns.oid
        WHERE ns.nspname = 'public'
          AND p.proname IN (
              'register_user_and_org',
              'accept_organization_invite',
              'assign_task_externally',
              'submit_external_work',
              'get_task_by_submission_token',
              'switch_organization',
              'accept_task',
              'reorder_tasks',
              'import_guest_project',
              'update_user_role'
          )
    LOOP
        EXECUTE format('DROP FUNCTION IF EXISTS %I.%I(%s) CASCADE',
                       r.nspname, r.proname, r.args);
    END LOOP;
END $$;

-- Register user and create organization (with owner tracking)
CREATE OR REPLACE FUNCTION register_user_and_org(
    p_auth_id UUID,
    p_email TEXT,
    p_full_name TEXT,
    p_org_name TEXT,
    p_role TEXT DEFAULT 'admin'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_org_id UUID;
    v_user_id UUID;
BEGIN
    INSERT INTO organizations (name, settings)
    VALUES (p_org_name, '{}')
    RETURNING id INTO v_org_id;

    INSERT INTO users (auth_id, org_id, email, full_name, role, training_level, level)
    VALUES (p_auth_id, v_org_id, p_email, p_full_name, p_role::user_role, 1, 1)
    RETURNING id INTO v_user_id;

    UPDATE organizations SET owner_id = v_user_id WHERE id = v_org_id;

    INSERT INTO user_org_memberships (user_id, org_id, role, is_primary)
    VALUES (v_user_id, v_org_id, p_role::user_role, true);

    RETURN jsonb_build_object('success', true, 'org_id', v_org_id, 'user_id', v_user_id);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Accept organization invite
CREATE OR REPLACE FUNCTION accept_organization_invite(
    p_auth_id UUID,
    p_email TEXT,
    p_full_name TEXT,
    p_invite_code TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_invitation RECORD;
    v_user_id UUID;
    v_existing_user RECORD;
BEGIN
    SELECT * INTO v_invitation
    FROM user_invitations
    WHERE token = p_invite_code AND email = p_email AND status = 'pending' AND expires_at > NOW();

    IF v_invitation IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired invitation');
    END IF;

    SELECT * INTO v_existing_user FROM users WHERE auth_id = p_auth_id;

    IF v_existing_user IS NOT NULL THEN
        INSERT INTO user_org_memberships (user_id, org_id, role, is_primary)
        VALUES (v_existing_user.id, v_invitation.org_id, v_invitation.role, false)
        ON CONFLICT (user_id, org_id) DO NOTHING;
        v_user_id := v_existing_user.id;
    ELSE
        INSERT INTO users (auth_id, org_id, email, full_name, role, training_level, level)
        VALUES (p_auth_id, v_invitation.org_id, p_email, p_full_name, v_invitation.role, 1, 1)
        RETURNING id INTO v_user_id;

        INSERT INTO user_org_memberships (user_id, org_id, role, is_primary)
        VALUES (v_user_id, v_invitation.org_id, v_invitation.role, true);
    END IF;

    UPDATE user_invitations SET status = 'accepted', accepted_at = NOW() WHERE id = v_invitation.id;

    RETURN jsonb_build_object('success', true, 'org_id', v_invitation.org_id, 'user_id', v_user_id);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Update user role (admins can change any role except owner)
CREATE OR REPLACE FUNCTION update_user_role(
    p_target_user_id UUID,
    p_new_role TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_current_user_id UUID;
    v_current_user_role TEXT;
    v_target_user RECORD;
    v_org RECORD;
    v_is_owner BOOLEAN;
    v_target_is_owner BOOLEAN;
BEGIN
    SELECT id, role::TEXT INTO v_current_user_id, v_current_user_role
    FROM users WHERE auth_id = auth.uid();

    IF v_current_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;

    SELECT * INTO v_target_user FROM users WHERE id = p_target_user_id;
    IF v_target_user IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'User not found');
    END IF;

    IF v_target_user.org_id != (SELECT org_id FROM users WHERE id = v_current_user_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'User not in your organization');
    END IF;

    SELECT * INTO v_org FROM organizations WHERE id = v_target_user.org_id;
    v_is_owner := (v_org.owner_id = v_current_user_id);
    v_target_is_owner := (v_org.owner_id = p_target_user_id);

    IF v_target_user.id = v_current_user_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot change your own role');
    END IF;

    IF v_target_is_owner THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot change the organization owner''s role');
    END IF;

    IF NOT (v_is_owner OR v_current_user_role = 'admin') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Permission denied');
    END IF;

    UPDATE users SET role = p_new_role::user_role WHERE id = p_target_user_id;
    UPDATE user_org_memberships SET role = p_new_role::user_role
    WHERE user_id = p_target_user_id AND org_id = v_target_user.org_id;

    RETURN jsonb_build_object('success', true, 'new_role', p_new_role);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Accept/pickup task
CREATE OR REPLACE FUNCTION accept_task(p_task_id UUID, p_user_id UUID)
RETURNS tasks
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_task tasks;
    v_user users;
BEGIN
    SELECT * INTO v_task FROM tasks WHERE id = p_task_id;
    IF v_task IS NULL OR v_task.status != 'open' THEN
        RAISE EXCEPTION 'Task not available';
    END IF;

    SELECT * INTO v_user FROM users WHERE id = p_user_id;
    IF v_user IS NULL OR v_user.training_level < v_task.required_level THEN
        RAISE EXCEPTION 'User level too low';
    END IF;

    UPDATE tasks SET status = 'assigned', assignee_id = p_user_id, assigned_at = NOW()
    WHERE id = p_task_id RETURNING * INTO v_task;

    RETURN v_task;
END;
$$;

-- Switch organization
CREATE OR REPLACE FUNCTION switch_organization(p_org_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_membership RECORD;
BEGIN
    SELECT id INTO v_user_id FROM users WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'User not found');
    END IF;

    SELECT * INTO v_membership FROM user_org_memberships WHERE user_id = v_user_id AND org_id = p_org_id;
    IF v_membership IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not a member');
    END IF;

    UPDATE users SET org_id = p_org_id, role = v_membership.role WHERE id = v_user_id;
    UPDATE user_org_memberships SET is_primary = (org_id = p_org_id) WHERE user_id = v_user_id;

    RETURN jsonb_build_object('success', true, 'org_id', p_org_id);
END;
$$;

-- Assign task externally
CREATE OR REPLACE FUNCTION assign_task_externally(
    p_task_id UUID,
    p_contractor_name TEXT,
    p_contractor_email TEXT,
    p_use_guest_link BOOLEAN DEFAULT true
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
    SELECT id INTO v_assigner_id FROM users WHERE auth_id = auth.uid();
    IF v_assigner_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'User not found');
    END IF;

    SELECT * INTO v_task FROM tasks WHERE id = p_task_id;
    IF v_task IS NULL OR v_task.status != 'open' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Task not available');
    END IF;

    IF p_use_guest_link THEN
        v_submission_token := encode(gen_random_bytes(16), 'hex');
    END IF;

    INSERT INTO contracts (org_id, task_id, template_type, status, party_a_id, party_b_email, terms)
    VALUES (v_task.org_id, p_task_id, 'task_assignment', 'pending_signature', v_assigner_id, p_contractor_email,
        jsonb_build_object('task_title', v_task.title, 'compensation', v_task.dollar_value, 'contractor_name', p_contractor_name))
    RETURNING id INTO v_contract_id;

    UPDATE tasks SET
        is_external = true, external_contractor_name = p_contractor_name,
        external_contractor_email = p_contractor_email, external_submission_token = v_submission_token,
        contract_id = v_contract_id, status = 'assigned', assigned_at = NOW()
    WHERE id = p_task_id;

    RETURN jsonb_build_object('success', true, 'contract_id', v_contract_id, 'submission_token', v_submission_token);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Submit external work
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
    SELECT * INTO v_task FROM tasks WHERE external_submission_token = p_submission_token;
    IF v_task IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid token');
    END IF;
    IF v_task.status NOT IN ('assigned', 'in_progress') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Task not accepting submissions');
    END IF;

    UPDATE tasks SET status = 'completed', completed_at = NOW(), submission_data = p_submission_data WHERE id = v_task.id;
    RETURN jsonb_build_object('success', true, 'task_id', v_task.id);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Get task by submission token
CREATE OR REPLACE FUNCTION get_task_by_submission_token(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_task RECORD;
BEGIN
    SELECT t.*, p.name as project_name INTO v_task
    FROM tasks t LEFT JOIN projects p ON t.project_id = p.id
    WHERE t.external_submission_token = p_token;

    IF v_task IS NULL THEN RETURN NULL; END IF;

    RETURN jsonb_build_object(
        'id', v_task.id, 'title', v_task.title, 'description', v_task.description,
        'status', v_task.status, 'dollar_value', v_task.dollar_value, 'deadline', v_task.deadline,
        'story_points', v_task.story_points, 'tags', v_task.tags,
        'project', CASE WHEN v_task.project_name IS NOT NULL THEN jsonb_build_object('name', v_task.project_name) ELSE NULL END
    );
END;
$$;

-- Reorder tasks within a status column
CREATE OR REPLACE FUNCTION reorder_tasks(p_task_ids UUID[], p_status TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_idx INTEGER := 0;
    v_task_id UUID;
BEGIN
    FOREACH v_task_id IN ARRAY p_task_ids LOOP
        UPDATE tasks SET sort_order = v_idx
        WHERE id = v_task_id AND status = p_status::task_status;
        v_idx := v_idx + 1;
    END LOOP;
    RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Import guest project to real project
CREATE OR REPLACE FUNCTION import_guest_project(p_session_id TEXT, p_org_id UUID, p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_guest RECORD;
    v_project_id UUID;
    v_task JSONB;
BEGIN
    SELECT * INTO v_guest FROM guest_projects WHERE session_id = p_session_id;
    IF v_guest IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Guest project not found');
    END IF;

    INSERT INTO projects (org_id, name, description, status, total_value, pm_id)
    VALUES (p_org_id, v_guest.name, v_guest.description, 'draft', 0, p_user_id)
    RETURNING id INTO v_project_id;

    FOR v_task IN SELECT * FROM jsonb_array_elements(v_guest.tasks) LOOP
        INSERT INTO tasks (org_id, project_id, title, description, dollar_value, story_points, tags, sort_order, status)
        VALUES (
            p_org_id, v_project_id,
            v_task->>'title', v_task->>'description',
            COALESCE((v_task->>'dollar_value')::DECIMAL, 0),
            (v_task->>'story_points')::INTEGER,
            ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_task->'tags', '[]'::jsonb))),
            COALESCE((v_task->>'sort_order')::INTEGER, 0),
            'open'
        );
    END LOOP;

    UPDATE projects SET total_value = (SELECT COALESCE(SUM(dollar_value), 0) FROM tasks WHERE project_id = v_project_id)
    WHERE id = v_project_id;

    DELETE FROM guest_projects WHERE session_id = p_session_id;

    RETURN jsonb_build_object('success', true, 'project_id', v_project_id);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ============================================================================
-- 5. RLS POLICIES
-- ============================================================================

-- Users
DROP POLICY IF EXISTS "Users can view own profile" ON users;
CREATE POLICY "Users can view own profile" ON users
    FOR SELECT USING (auth_id = auth.uid());

DROP POLICY IF EXISTS "Users can view org members" ON users;
CREATE POLICY "Users can view org members" ON users
    FOR SELECT USING (org_id = current_user_org_id());

DROP POLICY IF EXISTS "Users can update own profile" ON users;
CREATE POLICY "Users can update own profile" ON users
    FOR UPDATE USING (auth_id = auth.uid());

DROP POLICY IF EXISTS "Admins can update org members" ON users;
CREATE POLICY "Admins can update org members" ON users
    FOR UPDATE USING (org_id = current_user_org_id() AND current_user_role() = 'admin');

-- Organizations
DROP POLICY IF EXISTS "Users can view own org" ON organizations;
CREATE POLICY "Users can view own org" ON organizations
    FOR SELECT USING (id = current_user_org_id());

DROP POLICY IF EXISTS "Admins can update own org" ON organizations;
CREATE POLICY "Admins can update own org" ON organizations
    FOR UPDATE USING (id = current_user_org_id() AND current_user_role() = 'admin');

-- Projects
DROP POLICY IF EXISTS "Users can view org projects" ON projects;
CREATE POLICY "Users can view org projects" ON projects
    FOR SELECT USING (org_id = current_user_org_id());

DROP POLICY IF EXISTS "PM and admin can create projects" ON projects;
CREATE POLICY "PM and admin can create projects" ON projects
    FOR INSERT WITH CHECK (org_id = current_user_org_id() AND current_user_role() IN ('admin', 'pm', 'sales'));

DROP POLICY IF EXISTS "PM and admin can update projects" ON projects;
CREATE POLICY "PM and admin can update projects" ON projects
    FOR UPDATE USING (org_id = current_user_org_id() AND current_user_role() IN ('admin', 'pm'));

-- Tasks
DROP POLICY IF EXISTS "Users can view org tasks" ON tasks;
CREATE POLICY "Users can view org tasks" ON tasks
    FOR SELECT USING (org_id = current_user_org_id());

DROP POLICY IF EXISTS "Guest can view task by token" ON tasks;
CREATE POLICY "Guest can view task by token" ON tasks
    FOR SELECT TO anon USING (external_submission_token IS NOT NULL);

DROP POLICY IF EXISTS "PM and admin can create tasks" ON tasks;
CREATE POLICY "PM and admin can create tasks" ON tasks
    FOR INSERT WITH CHECK (org_id = current_user_org_id() AND current_user_role() IN ('admin', 'pm'));

DROP POLICY IF EXISTS "PM and admin can update any task" ON tasks;
CREATE POLICY "PM and admin can update any task" ON tasks
    FOR UPDATE USING (org_id = current_user_org_id() AND current_user_role() IN ('admin', 'pm'));

DROP POLICY IF EXISTS "Assignee can update own task" ON tasks;
CREATE POLICY "Assignee can update own task" ON tasks
    FOR UPDATE USING (org_id = current_user_org_id() AND assignee_id = current_user_id());

DROP POLICY IF EXISTS "Employee can accept open tasks" ON tasks;
CREATE POLICY "Employee can accept open tasks" ON tasks
    FOR UPDATE USING (org_id = current_user_org_id() AND status = 'open' AND current_user_role() IN ('employee', 'contractor'));

-- QC Reviews
DROP POLICY IF EXISTS "Users can view org reviews" ON qc_reviews;
CREATE POLICY "Users can view org reviews" ON qc_reviews
    FOR SELECT USING (task_id IN (SELECT id FROM tasks WHERE org_id = current_user_org_id()));

DROP POLICY IF EXISTS "QC and admin can create reviews" ON qc_reviews;
CREATE POLICY "QC and admin can create reviews" ON qc_reviews
    FOR INSERT WITH CHECK (current_user_role() IN ('admin', 'qc'));

-- Contracts
DROP POLICY IF EXISTS "Users can view own contracts" ON contracts;
CREATE POLICY "Users can view own contracts" ON contracts
    FOR SELECT USING (
        org_id = current_user_org_id()
        AND (party_a_id = current_user_id() OR party_b_id = current_user_id() OR current_user_role() IN ('admin', 'pm'))
    );

-- Payouts
DROP POLICY IF EXISTS "Users can view own payouts" ON payouts;
CREATE POLICY "Users can view own payouts" ON payouts
    FOR SELECT USING (
        org_id = current_user_org_id()
        AND (user_id = current_user_id() OR current_user_role() IN ('admin', 'pm'))
    );

-- Invitations
DROP POLICY IF EXISTS "Users can view org invitations" ON user_invitations;
CREATE POLICY "Users can view org invitations" ON user_invitations
    FOR SELECT USING (org_id = current_user_org_id());

DROP POLICY IF EXISTS "Admins can create invitations" ON user_invitations;
CREATE POLICY "Admins can create invitations" ON user_invitations
    FOR INSERT WITH CHECK (org_id = current_user_org_id() AND current_user_role() = 'admin');

-- Memberships
DROP POLICY IF EXISTS "Users can view own memberships" ON user_org_memberships;
CREATE POLICY "Users can view own memberships" ON user_org_memberships
    FOR SELECT USING (user_id = current_user_id());

-- ============================================================================
-- 6. PERMISSIONS
-- ============================================================================

-- Helper functions (used by RLS policies)
GRANT EXECUTE ON FUNCTION current_user_org_id TO authenticated;
GRANT EXECUTE ON FUNCTION current_user_role TO authenticated;
GRANT EXECUTE ON FUNCTION current_user_id TO authenticated;
GRANT EXECUTE ON FUNCTION is_org_owner TO authenticated;

-- RPC functions
GRANT EXECUTE ON FUNCTION register_user_and_org TO authenticated;
GRANT EXECUTE ON FUNCTION accept_organization_invite TO authenticated;
GRANT EXECUTE ON FUNCTION update_user_role TO authenticated;
GRANT EXECUTE ON FUNCTION accept_task TO authenticated;
GRANT EXECUTE ON FUNCTION switch_organization TO authenticated;
GRANT EXECUTE ON FUNCTION assign_task_externally TO authenticated;
GRANT EXECUTE ON FUNCTION reorder_tasks TO authenticated;
GRANT EXECUTE ON FUNCTION import_guest_project TO authenticated;
GRANT EXECUTE ON FUNCTION submit_external_work TO anon;
GRANT EXECUTE ON FUNCTION get_task_by_submission_token TO anon;

-- Guest projects
GRANT ALL ON guest_projects TO anon;
GRANT ALL ON guest_projects TO authenticated;

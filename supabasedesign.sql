-- =============================================================================
-- Orbit Database Schema
-- Exported: 2026-03-24
-- Database: PostgreSQL via Supabase
-- =============================================================================

-- =============================================
-- ENUMS
-- =============================================

CREATE TYPE public.user_role AS ENUM (
  'admin', 'sales', 'pm', 'qc', 'employee', 'contractor'
);

CREATE TYPE public.task_status AS ENUM (
  'open', 'assigned', 'in_progress', 'completed',
  'under_review', 'approved', 'rejected', 'paid'
);

CREATE TYPE public.project_status AS ENUM (
  'draft', 'pending_pm', 'active', 'completed', 'cancelled'
);

CREATE TYPE public.contract_status AS ENUM (
  'draft', 'pending_signature', 'active', 'completed', 'disputed'
);

CREATE TYPE public.qc_review_type AS ENUM (
  'ai', 'peer', 'independent'
);

CREATE TYPE public.permission_level AS ENUM (
  'none', 'view', 'work', 'manage', 'admin'
);

CREATE TYPE public.invitation_status AS ENUM (
  'pending', 'accepted', 'expired', 'cancelled'
);


-- =============================================
-- TABLES
-- =============================================

-- ---------------------------------------------
-- organizations
-- Multi-tenant root with payout configuration
-- ---------------------------------------------
CREATE TABLE public.organizations (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    text        NOT NULL,
  settings                jsonb       DEFAULT '{}'::jsonb,
  default_r               numeric     DEFAULT 0.7,
  r_bounds                jsonb       DEFAULT '{"max": 0.9, "min": 0.5}'::jsonb,
  qc_beta                 numeric     DEFAULT 0.25,
  qc_gamma                numeric     DEFAULT 0.4,
  pm_x                    numeric     DEFAULT 0.5,
  pm_overdraft_penalty    numeric     DEFAULT 1.5,
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now(),
  owner_id                uuid        REFERENCES public.users(id),
  allow_external_assignment boolean   DEFAULT true
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------
-- users
-- Platform users with gamification fields
-- ---------------------------------------------
CREATE TABLE public.users (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id                 uuid        REFERENCES auth.users(id),
  org_id                  uuid        REFERENCES public.organizations(id),
  email                   text        NOT NULL,
  full_name               text,
  role                    user_role   NOT NULL DEFAULT 'employee'::user_role,
  base_salary             numeric,
  r                       numeric,
  level                   integer     DEFAULT 1,
  training_level          integer     DEFAULT 1,
  metadata                jsonb       DEFAULT '{}'::jsonb,
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now(),
  xp                      integer     DEFAULT 0,
  xp_this_period          integer     DEFAULT 0,
  tasks_completed         integer     DEFAULT 0,
  streak_days             integer     DEFAULT 0,
  last_task_completed_at  timestamptz
);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------
-- projects
-- Project management with budget tracking
-- ---------------------------------------------
CREATE TABLE public.projects (
  id                  uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid            REFERENCES public.organizations(id),
  name                text            NOT NULL,
  description         text,
  status              project_status  DEFAULT 'draft'::project_status,
  total_value         numeric         NOT NULL,
  story_points_budget integer,
  spent               numeric         DEFAULT 0,
  sales_id            uuid            REFERENCES public.users(id),
  pm_id               uuid            REFERENCES public.users(id),
  deadline            timestamptz,
  pm_bonus            numeric         DEFAULT 0,
  created_at          timestamptz     DEFAULT now(),
  updated_at          timestamptz     DEFAULT now(),
  picked_up_at        timestamptz
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------
-- tasks
-- Task lifecycle with submission and external assignment support
-- ---------------------------------------------
CREATE TABLE public.tasks (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                      uuid        REFERENCES public.organizations(id),
  project_id                  uuid        REFERENCES public.projects(id),
  title                       text        NOT NULL,
  description                 text,
  status                      task_status DEFAULT 'open'::task_status,
  story_points                integer,
  dollar_value                numeric     NOT NULL,
  assignee_id                 uuid        REFERENCES public.users(id),
  assigned_at                 timestamptz,
  deadline                    timestamptz,
  completed_at                timestamptz,
  urgency_multiplier          numeric     DEFAULT 1.0,
  required_level              integer     DEFAULT 1,
  submission_data             jsonb,
  submission_files            text[],
  created_at                  timestamptz DEFAULT now(),
  updated_at                  timestamptz DEFAULT now(),
  is_external                 boolean     DEFAULT false,
  external_contractor_name    text,
  external_contractor_email   text,
  external_submission_token   text        UNIQUE,
  contract_id                 uuid        REFERENCES public.contracts(id),
  tags                        text[]      DEFAULT '{}'::text[],
  sort_order                  integer     DEFAULT 0
);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------
-- qc_reviews
-- Quality control reviews with Shapley value fields
-- ---------------------------------------------
CREATE TABLE public.qc_reviews (
  id              uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         uuid            REFERENCES public.tasks(id),
  review_type     qc_review_type  NOT NULL,
  reviewer_id     uuid            REFERENCES public.users(id),
  passed          boolean,
  confidence      numeric,              -- AI p0 score
  feedback        text,
  v0              numeric,              -- Worker baseline value
  d_k             numeric,              -- Marginal Shapley value
  pass_number     integer         DEFAULT 1,
  weight          numeric         DEFAULT 1.0,  -- peer=1.0, independent=2.0
  created_at      timestamptz     DEFAULT now()
);

ALTER TABLE public.qc_reviews ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------
-- contracts
-- E-signature contracts with dual-party flow
-- ---------------------------------------------
CREATE TABLE public.contracts (
  id                  uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid            REFERENCES public.organizations(id),
  task_id             uuid            REFERENCES public.tasks(id),
  project_id          uuid            REFERENCES public.projects(id),
  template_type       text            NOT NULL,
  status              contract_status DEFAULT 'draft'::contract_status,
  party_a_id          uuid            NOT NULL REFERENCES public.users(id),
  party_b_id          uuid            REFERENCES public.users(id),
  party_b_email       text,
  terms               jsonb           NOT NULL,
  party_a_signed_at   timestamptz,
  party_b_signed_at   timestamptz,
  pdf_path            text,
  created_at          timestamptz     DEFAULT now(),
  updated_at          timestamptz     DEFAULT now()
);

ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------
-- payouts
-- Payout tracking for all compensation types
-- ---------------------------------------------
CREATE TABLE public.payouts (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  uuid        REFERENCES public.organizations(id),
  user_id                 uuid        REFERENCES public.users(id),
  task_id                 uuid        REFERENCES public.tasks(id),
  project_id              uuid        REFERENCES public.projects(id),
  qc_review_id            uuid        REFERENCES public.qc_reviews(id),
  payout_type             text        NOT NULL,
  gross_amount            numeric     NOT NULL,
  deductions              numeric     DEFAULT 0,
  net_amount              numeric     NOT NULL,
  calculation_details     jsonb,
  status                  text        DEFAULT 'pending'::text,
  paid_at                 timestamptz,
  created_at              timestamptz DEFAULT now()
);

ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------
-- audit_log
-- System-wide audit trail
-- ---------------------------------------------
CREATE TABLE public.audit_log (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid        REFERENCES public.organizations(id),
  user_id         uuid        REFERENCES public.users(id),
  action          text        NOT NULL,
  entity_type     text        NOT NULL,
  entity_id       uuid,
  old_data        jsonb,
  new_data        jsonb,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------
-- achievements
-- Badge/achievement definitions
-- ---------------------------------------------
CREATE TABLE public.achievements (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text        NOT NULL,
  description     text,
  icon            text,
  category        text        NOT NULL DEFAULT 'general'::text,
  xp_reward       integer     DEFAULT 0,
  condition       jsonb       NOT NULL,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------
-- notifications
-- In-app notification system
-- ---------------------------------------------
CREATE TABLE public.notifications (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES public.users(id),
  type            text        NOT NULL,
  title           text        NOT NULL,
  message         text        NOT NULL,
  data            jsonb       DEFAULT '{}'::jsonb,
  read            boolean     DEFAULT false,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------
-- user_badges
-- Earned badges per user
-- ---------------------------------------------
CREATE TABLE public.user_badges (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES public.users(id),
  badge_id        text        NOT NULL,
  earned_at       timestamptz DEFAULT now()
);

ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------
-- user_invitations
-- Organization invite tokens
-- ---------------------------------------------
CREATE TABLE public.user_invitations (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid        NOT NULL REFERENCES public.organizations(id),
  email           text        NOT NULL,
  role            text        NOT NULL DEFAULT 'employee'::text,
  invited_by      uuid        NOT NULL REFERENCES public.users(id),
  token           text        NOT NULL,
  status          text        NOT NULL DEFAULT 'pending'::text,
  expires_at      timestamptz NOT NULL,
  accepted_at     timestamptz,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE public.user_invitations ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------
-- user_organization_memberships
-- Multi-org membership tracking
-- ---------------------------------------------
CREATE TABLE public.user_organization_memberships (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES public.users(id),
  org_id          uuid        NOT NULL REFERENCES public.organizations(id),
  role            user_role   NOT NULL DEFAULT 'employee'::user_role,
  is_primary      boolean     DEFAULT false,
  joined_at       timestamptz DEFAULT now()
);

ALTER TABLE public.user_organization_memberships ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------
-- user_org_memberships
-- Legacy/alternate membership table
-- ---------------------------------------------
CREATE TABLE public.user_org_memberships (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES public.users(id),
  org_id          uuid        NOT NULL REFERENCES public.organizations(id),
  role            user_role   NOT NULL DEFAULT 'employee'::user_role,
  is_primary      boolean     DEFAULT false,
  joined_at       timestamptz DEFAULT now()
);

ALTER TABLE public.user_org_memberships ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------
-- guest_projects
-- Trial/demo projects for unauthenticated users
-- ---------------------------------------------
CREATE TABLE public.guest_projects (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      text        NOT NULL UNIQUE,
  name            text        NOT NULL,
  description     text,
  tasks           jsonb       DEFAULT '[]'::jsonb,
  settings        jsonb       DEFAULT '{}'::jsonb,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  expires_at      timestamptz DEFAULT (now() + '7 days'::interval)
);

ALTER TABLE public.guest_projects ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------
-- project_access
-- Fine-grained project permission grants
-- ---------------------------------------------
CREATE TABLE public.project_access (
  id                  uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          uuid            NOT NULL REFERENCES public.projects(id),
  user_id             uuid            NOT NULL REFERENCES public.users(id),
  permission_level    permission_level NOT NULL DEFAULT 'view'::permission_level,
  granted_by          uuid            NOT NULL REFERENCES public.users(id),
  granted_at          timestamptz     DEFAULT now()
);

ALTER TABLE public.project_access ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------
-- team_members
-- Project team membership
-- ---------------------------------------------
CREATE TABLE public.team_members (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid        NOT NULL REFERENCES public.projects(id),
  user_id         uuid        NOT NULL REFERENCES public.users(id),
  role            text        NOT NULL DEFAULT 'member'::text,
  added_at        timestamptz DEFAULT now(),
  added_by        uuid        NOT NULL REFERENCES public.users(id)
);

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;


-- =============================================
-- FUNCTIONS (30)
-- =============================================

-- Helper functions (used by RLS policies and RPCs)
-- current_user_id()              -> uuid          SECURITY DEFINER
-- current_user_org_id()          -> uuid          SECURITY DEFINER
-- current_user_role()            -> text          SECURITY DEFINER
-- get_current_user_id()          -> uuid          SECURITY DEFINER
-- get_my_org_id()                -> uuid          SECURITY DEFINER
-- get_user_org_id()              -> uuid          SECURITY DEFINER
-- get_user_context()             -> TABLE(user_id uuid, org_id uuid, role user_role)  SECURITY DEFINER
-- is_org_owner()                 -> boolean       SECURITY DEFINER
-- user_can_access_contract(uuid, uuid, uuid) -> boolean  SECURITY DEFINER
-- user_can_review_task(uuid)     -> boolean       SECURITY DEFINER
-- get_feature_flag_preset(text)  -> jsonb         SECURITY DEFINER

-- Core RPCs
-- register_user_and_org(p_auth_id uuid, p_email text, p_full_name text, p_org_name text, p_feature_preset text DEFAULT 'standard') -> jsonb  SECURITY DEFINER
-- accept_organization_invite(p_auth_id uuid, p_email text, p_full_name text, p_invite_code text) -> jsonb  SECURITY DEFINER
-- accept_task(p_task_id uuid, p_user_id uuid) -> tasks  SECURITY DEFINER
-- assign_task_externally(p_task_id uuid, p_contractor_name text, p_contractor_email text, p_use_guest_link boolean DEFAULT true) -> jsonb  SECURITY DEFINER
-- get_task_by_submission_token(p_token text) -> jsonb  SECURITY DEFINER
-- submit_external_work(p_submission_token text, p_submission_data jsonb) -> jsonb  SECURITY DEFINER
-- get_contract_by_submission_token(p_token text) -> jsonb  SECURITY DEFINER
-- sign_contract_external(p_token text) -> jsonb  SECURITY DEFINER
-- update_user_role(p_target_user_id uuid, p_new_role text) -> jsonb  SECURITY DEFINER
-- reorder_tasks(p_task_ids uuid[], p_status text) -> jsonb  SECURITY DEFINER
-- import_guest_project(p_session_id text, p_org_id uuid, p_user_id uuid) -> jsonb  SECURITY DEFINER
-- switch_organization(p_org_id uuid) -> jsonb  SECURITY DEFINER

-- Gamification
-- calculate_task_xp(p_story_points integer, p_urgency_multiplier numeric, p_required_level integer) -> integer  SECURITY INVOKER
-- calculate_level_from_xp(p_xp integer) -> integer  SECURITY INVOKER
-- award_task_xp() -> trigger  SECURITY INVOKER  (trigger function)

-- Trigger functions
-- log_audit_entry()              -> trigger       SECURITY INVOKER
-- notify_qc_review()             -> trigger       SECURITY DEFINER
-- notify_task_assigned()         -> trigger       SECURITY INVOKER
-- set_default_feature_flags()    -> trigger       SECURITY DEFINER


-- =============================================
-- TRIGGERS (8)
-- =============================================

-- organizations
CREATE TRIGGER set_org_feature_flags
  BEFORE INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION set_default_feature_flags();

-- projects
CREATE TRIGGER audit_projects
  AFTER INSERT ON public.projects
  FOR EACH ROW EXECUTE FUNCTION log_audit_entry();

-- tasks
CREATE TRIGGER audit_tasks
  AFTER INSERT ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION log_audit_entry();

CREATE TRIGGER trigger_award_task_xp
  AFTER UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION award_task_xp();

CREATE TRIGGER trigger_notify_task_assigned
  AFTER INSERT ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION notify_task_assigned();

-- qc_reviews
CREATE TRIGGER trigger_notify_qc_review
  AFTER INSERT ON public.qc_reviews
  FOR EACH ROW EXECUTE FUNCTION notify_qc_review();

-- payouts
CREATE TRIGGER audit_payouts
  AFTER INSERT ON public.payouts
  FOR EACH ROW EXECUTE FUNCTION log_audit_entry();

-- users
CREATE TRIGGER audit_users
  AFTER INSERT ON public.users
  FOR EACH ROW EXECUTE FUNCTION log_audit_entry();


-- =============================================
-- ROW LEVEL SECURITY POLICIES (65)
-- =============================================

-- ----- achievements (1 policy) -----

CREATE POLICY "Achievements are viewable by authenticated users"
  ON public.achievements FOR SELECT TO authenticated
  USING (true);


-- ----- audit_log (2 policies) -----

CREATE POLICY "Admins can view audit logs"
  ON public.audit_log FOR SELECT TO authenticated
  USING (org_id IN (
    SELECT users.org_id FROM users
    WHERE users.auth_id = auth.uid() AND users.role = 'admin'::user_role
  ));

CREATE POLICY "System can insert audit logs"
  ON public.audit_log FOR INSERT TO authenticated
  WITH CHECK (true);


-- ----- contracts (3 policies) -----

CREATE POLICY "contracts_insert_policy"
  ON public.contracts FOR INSERT TO public
  WITH CHECK (EXISTS (
    SELECT 1 FROM users u
    JOIN user_organization_memberships m ON m.user_id = u.id
    WHERE u.auth_id = auth.uid()
      AND m.org_id = contracts.org_id
      AND m.role = ANY (ARRAY['admin'::user_role, 'pm'::user_role, 'sales'::user_role])
  ));

CREATE POLICY "contracts_select_policy"
  ON public.contracts FOR SELECT TO public
  USING (user_can_access_contract(org_id, party_a_id, party_b_id));

CREATE POLICY "contracts_update_policy"
  ON public.contracts FOR UPDATE TO public
  USING (user_can_access_contract(org_id, party_a_id, party_b_id));


-- ----- guest_projects (1 policy) -----

CREATE POLICY "Anyone can manage guest projects by session"
  ON public.guest_projects FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);


-- ----- notifications (3 policies) -----

CREATE POLICY "System can insert notifications"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE TO authenticated
  USING (user_id IN (
    SELECT users.id FROM users WHERE users.auth_id = auth.uid()
  ));

CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (user_id IN (
    SELECT users.id FROM users WHERE users.auth_id = auth.uid()
  ));


-- ----- organizations (5 policies) -----

CREATE POLICY "Admins can update own org"
  ON public.organizations FOR UPDATE TO public
  USING (id = current_user_org_id() AND current_user_role() = 'admin'::text);

CREATE POLICY "Users can read their own organization"
  ON public.organizations FOR SELECT TO public
  USING (id IN (
    SELECT users.org_id FROM users WHERE users.auth_id = auth.uid()
  ));

CREATE POLICY "Users can view own org"
  ON public.organizations FOR SELECT TO public
  USING (id = current_user_org_id());

CREATE POLICY "Users can view own organization"
  ON public.organizations FOR SELECT TO public
  USING (id = get_my_org_id());

CREATE POLICY "orgs_select_authenticated"
  ON public.organizations FOR SELECT TO authenticated
  USING (true);


-- ----- payouts (3 policies) -----

CREATE POLICY "Users can view own payouts"
  ON public.payouts FOR SELECT TO public
  USING (
    org_id = current_user_org_id()
    AND (user_id = current_user_id() OR current_user_role() = ANY (ARRAY['admin'::text, 'pm'::text]))
  );

CREATE POLICY "payouts_admin_read"
  ON public.payouts FOR SELECT TO public
  USING (EXISTS (
    SELECT 1 FROM get_user_context()
    WHERE role = 'admin'::user_role AND get_user_context.org_id = payouts.org_id
  ));

CREATE POLICY "payouts_self_read"
  ON public.payouts FOR SELECT TO public
  USING (user_id IN (
    SELECT get_user_context.user_id FROM get_user_context()
  ));


-- ----- project_access (2 policies) -----

CREATE POLICY "PM and admin can manage project access"
  ON public.project_access FOR ALL TO public
  USING (
    project_id IN (SELECT projects.id FROM projects WHERE projects.org_id = current_user_org_id())
    AND current_user_role() = ANY (ARRAY['admin'::text, 'pm'::text])
  )
  WITH CHECK (
    project_id IN (SELECT projects.id FROM projects WHERE projects.org_id = current_user_org_id())
    AND current_user_role() = ANY (ARRAY['admin'::text, 'pm'::text])
  );

CREATE POLICY "Users can view project access"
  ON public.project_access FOR SELECT TO public
  USING (project_id IN (
    SELECT projects.id FROM projects WHERE projects.org_id = current_user_org_id()
  ));


-- ----- projects (8 policies) -----

CREATE POLICY "PM and admin can create projects"
  ON public.projects FOR INSERT TO public
  WITH CHECK (
    org_id = current_user_org_id()
    AND current_user_role() = ANY (ARRAY['admin'::text, 'pm'::text, 'sales'::text])
  );

CREATE POLICY "PM and admin can update projects"
  ON public.projects FOR UPDATE TO public
  USING (
    org_id = current_user_org_id()
    AND current_user_role() = ANY (ARRAY['admin'::text, 'pm'::text])
  );

CREATE POLICY "Users can view org projects"
  ON public.projects FOR SELECT TO public
  USING (org_id = current_user_org_id());

CREATE POLICY "projects_insert_by_org"
  ON public.projects FOR INSERT TO authenticated
  WITH CHECK (org_id IN (
    SELECT users.org_id FROM users WHERE users.auth_id = auth.uid()
  ));

CREATE POLICY "projects_pm_update"
  ON public.projects FOR UPDATE TO public
  USING (
    pm_id IN (SELECT get_user_context.user_id FROM get_user_context())
    OR EXISTS (SELECT 1 FROM get_user_context() WHERE role = 'admin'::user_role)
  );

CREATE POLICY "projects_read"
  ON public.projects FOR SELECT TO public
  USING (org_id IN (
    SELECT get_user_context.org_id FROM get_user_context()
  ));

CREATE POLICY "projects_select_by_org"
  ON public.projects FOR SELECT TO authenticated
  USING (org_id IN (
    SELECT users.org_id FROM users WHERE users.auth_id = auth.uid()
  ));

CREATE POLICY "projects_update_by_org"
  ON public.projects FOR UPDATE TO authenticated
  USING (org_id IN (
    SELECT users.org_id FROM users WHERE users.auth_id = auth.uid()
  ));


-- ----- qc_reviews (3 policies) -----

CREATE POLICY "qc_reviews_insert_policy"
  ON public.qc_reviews FOR INSERT TO public
  WITH CHECK (user_can_review_task(task_id));

CREATE POLICY "qc_reviews_select_policy"
  ON public.qc_reviews FOR SELECT TO public
  USING (task_id IN (
    SELECT t.id FROM tasks t
    JOIN user_organization_memberships m ON m.org_id = t.org_id
    JOIN users u ON u.id = m.user_id
    WHERE u.auth_id = auth.uid()
  ));

CREATE POLICY "qc_reviews_update_policy"
  ON public.qc_reviews FOR UPDATE TO public
  USING (reviewer_id IN (
    SELECT users.id FROM users WHERE users.auth_id = auth.uid()
  ));


-- ----- tasks (13 policies) -----

CREATE POLICY "Assignee can update own task"
  ON public.tasks FOR UPDATE TO public
  USING (org_id = current_user_org_id() AND assignee_id = current_user_id());

CREATE POLICY "Employee can accept open tasks"
  ON public.tasks FOR UPDATE TO public
  USING (
    org_id = current_user_org_id()
    AND status = 'open'::task_status
    AND current_user_role() = ANY (ARRAY['employee'::text, 'contractor'::text])
  );

CREATE POLICY "Guest can view task by submission token"
  ON public.tasks FOR SELECT TO anon
  USING (external_submission_token IS NOT NULL);

CREATE POLICY "Guest can view task by token"
  ON public.tasks FOR SELECT TO anon
  USING (external_submission_token IS NOT NULL);

CREATE POLICY "PM and admin can create tasks"
  ON public.tasks FOR INSERT TO public
  WITH CHECK (
    org_id = current_user_org_id()
    AND current_user_role() = ANY (ARRAY['admin'::text, 'pm'::text])
  );

CREATE POLICY "PM and admin can update any task"
  ON public.tasks FOR UPDATE TO public
  USING (
    org_id = current_user_org_id()
    AND current_user_role() = ANY (ARRAY['admin'::text, 'pm'::text])
  );

CREATE POLICY "Users can view org tasks"
  ON public.tasks FOR SELECT TO public
  USING (org_id = current_user_org_id());

CREATE POLICY "tasks_assign"
  ON public.tasks FOR UPDATE TO public
  USING (EXISTS (
    SELECT 1 FROM get_user_context()
    WHERE role = ANY (ARRAY['admin'::user_role, 'pm'::user_role])
  ));

CREATE POLICY "tasks_employee_update"
  ON public.tasks FOR UPDATE TO public
  USING (assignee_id IN (
    SELECT get_user_context.user_id FROM get_user_context()
  ));

CREATE POLICY "tasks_insert_by_org"
  ON public.tasks FOR INSERT TO authenticated
  WITH CHECK (org_id IN (
    SELECT users.org_id FROM users WHERE users.auth_id = auth.uid()
  ));

CREATE POLICY "tasks_read"
  ON public.tasks FOR SELECT TO public
  USING (org_id IN (
    SELECT get_user_context.org_id FROM get_user_context()
  ));

CREATE POLICY "tasks_select_by_org"
  ON public.tasks FOR SELECT TO authenticated
  USING (org_id IN (
    SELECT users.org_id FROM users WHERE users.auth_id = auth.uid()
  ));

CREATE POLICY "tasks_update_by_org"
  ON public.tasks FOR UPDATE TO authenticated
  USING (org_id IN (
    SELECT users.org_id FROM users WHERE users.auth_id = auth.uid()
  ));


-- ----- team_members (2 policies) -----

CREATE POLICY "PM and admin can manage team members"
  ON public.team_members FOR ALL TO public
  USING (
    project_id IN (SELECT projects.id FROM projects WHERE projects.org_id = current_user_org_id())
    AND current_user_role() = ANY (ARRAY['admin'::text, 'pm'::text])
  )
  WITH CHECK (
    project_id IN (SELECT projects.id FROM projects WHERE projects.org_id = current_user_org_id())
    AND current_user_role() = ANY (ARRAY['admin'::text, 'pm'::text])
  );

CREATE POLICY "Users can view team members"
  ON public.team_members FOR SELECT TO public
  USING (project_id IN (
    SELECT projects.id FROM projects WHERE projects.org_id = current_user_org_id()
  ));


-- ----- user_badges (3 policies) -----

CREATE POLICY "System can insert badges"
  ON public.user_badges FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can view org member badges"
  ON public.user_badges FOR SELECT TO authenticated
  USING (user_id IN (
    SELECT users.id FROM users
    WHERE users.org_id IN (
      SELECT users_1.org_id FROM users users_1 WHERE users_1.auth_id = auth.uid()
    )
  ));

CREATE POLICY "Users can view own badges"
  ON public.user_badges FOR SELECT TO authenticated
  USING (user_id IN (
    SELECT users.id FROM users WHERE users.auth_id = auth.uid()
  ));


-- ----- user_invitations (6 policies) -----

CREATE POLICY "Admins can create invitations"
  ON public.user_invitations FOR INSERT TO public
  WITH CHECK (org_id = current_user_org_id() AND current_user_role() = 'admin'::text);

CREATE POLICY "Admins can delete org invitations"
  ON public.user_invitations FOR DELETE TO authenticated
  USING (org_id IN (
    SELECT users.org_id FROM users
    WHERE users.auth_id = auth.uid() AND users.role = 'admin'::user_role
  ));

CREATE POLICY "Admins can insert org invitations"
  ON public.user_invitations FOR INSERT TO authenticated
  WITH CHECK (org_id IN (
    SELECT users.org_id FROM users
    WHERE users.auth_id = auth.uid() AND users.role = 'admin'::user_role
  ));

CREATE POLICY "Admins can update org invitations"
  ON public.user_invitations FOR UPDATE TO authenticated
  USING (org_id IN (
    SELECT users.org_id FROM users
    WHERE users.auth_id = auth.uid() AND users.role = 'admin'::user_role
  ));

CREATE POLICY "Admins can view org invitations"
  ON public.user_invitations FOR SELECT TO authenticated
  USING (org_id IN (
    SELECT users.org_id FROM users
    WHERE users.auth_id = auth.uid() AND users.role = 'admin'::user_role
  ));

CREATE POLICY "Users can view org invitations"
  ON public.user_invitations FOR SELECT TO public
  USING (org_id = current_user_org_id());


-- ----- user_org_memberships (1 policy) -----

CREATE POLICY "Users can view own memberships"
  ON public.user_org_memberships FOR SELECT TO public
  USING (user_id = current_user_id());


-- ----- user_organization_memberships (2 policies) -----

CREATE POLICY "Admins can manage org memberships"
  ON public.user_organization_memberships FOR ALL TO authenticated
  USING (org_id IN (
    SELECT users.org_id FROM users
    WHERE users.auth_id = auth.uid() AND users.role = 'admin'::user_role
  ));

CREATE POLICY "Users can view own memberships"
  ON public.user_organization_memberships FOR SELECT TO authenticated
  USING (user_id IN (
    SELECT users.id FROM users WHERE users.auth_id = auth.uid()
  ));


-- ----- users (10 policies) -----

CREATE POLICY "Admins can update org members"
  ON public.users FOR UPDATE TO public
  USING (org_id = current_user_org_id() AND current_user_role() = 'admin'::text);

CREATE POLICY "Users can insert own profile"
  ON public.users FOR INSERT TO public
  WITH CHECK (auth_id = auth.uid());

CREATE POLICY "Users can read own profile"
  ON public.users FOR SELECT TO public
  USING (auth_id = auth.uid());

CREATE POLICY "Users can update own profile"
  ON public.users FOR UPDATE TO public
  USING (auth_id = auth.uid());

CREATE POLICY "Users can view org members"
  ON public.users FOR SELECT TO public
  USING (org_id = current_user_org_id());

CREATE POLICY "Users can view own profile"
  ON public.users FOR SELECT TO public
  USING (auth_id = auth.uid());

CREATE POLICY "users_insert_own"
  ON public.users FOR INSERT TO authenticated
  WITH CHECK (auth_id = auth.uid());

CREATE POLICY "users_org_read"
  ON public.users FOR SELECT TO public
  USING (org_id IN (
    SELECT get_user_context.org_id FROM get_user_context()
  ));

CREATE POLICY "users_select_own"
  ON public.users FOR SELECT TO authenticated
  USING (auth_id = auth.uid());

CREATE POLICY "users_self_update"
  ON public.users FOR UPDATE TO public
  USING (auth_id = auth.uid())
  WITH CHECK (auth_id = auth.uid());

CREATE POLICY "users_update_own"
  ON public.users FOR UPDATE TO authenticated
  USING (auth_id = auth.uid())
  WITH CHECK (auth_id = auth.uid());

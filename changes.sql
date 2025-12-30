
-- ============================================================================
-- NOTIFICATIONS: Real-time notification system
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  data jsonb DEFAULT '{}',
  read boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT notifications_pkey PRIMARY KEY (id),
  CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
);

-- Index for faster notification queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON public.notifications (user_id, read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON public.notifications (created_at DESC);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can view their own notifications
CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (user_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- Users can update their own notifications (mark as read)
CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (user_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- System can insert notifications for any user
CREATE POLICY "System can insert notifications"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ============================================================================
-- USER BADGES: Gamification badges earned by users
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_badges (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  badge_id text NOT NULL,
  earned_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_badges_pkey PRIMARY KEY (id),
  CONSTRAINT user_badges_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT user_badges_unique UNIQUE (user_id, badge_id)
);

-- Index for faster badge queries
CREATE INDEX IF NOT EXISTS idx_user_badges_user ON public.user_badges (user_id, earned_at DESC);

-- Enable RLS
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;

-- Users can view their own badges
CREATE POLICY "Users can view own badges"
  ON public.user_badges FOR SELECT
  TO authenticated
  USING (user_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- Users can view badges of org members (for leaderboard)
CREATE POLICY "Users can view org member badges"
  ON public.user_badges FOR SELECT
  TO authenticated
  USING (
    user_id IN (
      SELECT id FROM public.users
      WHERE org_id IN (SELECT org_id FROM public.users WHERE auth_id = auth.uid())
    )
  );

-- System can insert badges
CREATE POLICY "System can insert badges"
  ON public.user_badges FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ============================================================================
-- AUDIT LOG: Track all important actions in the system
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid,
  user_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  old_data jsonb,
  new_data jsonb,
  ip_address text,
  user_agent text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT audit_log_pkey PRIMARY KEY (id),
  CONSTRAINT audit_log_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE SET NULL,
  CONSTRAINT audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL
);

-- Index for faster audit log queries
CREATE INDEX IF NOT EXISTS idx_audit_log_org ON public.audit_log (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON public.audit_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON public.audit_log (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON public.audit_log (action, created_at DESC);

-- Enable RLS
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Only admins can view audit logs
CREATE POLICY "Admins can view audit logs"
  ON public.audit_log FOR SELECT
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM public.users
      WHERE auth_id = auth.uid() AND role = 'admin'
    )
  );

-- System can insert audit logs
CREATE POLICY "System can insert audit logs"
  ON public.audit_log FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ============================================================================
-- USER INVITATIONS: Track pending user invitations
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_invitations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'employee',
  invited_by uuid NOT NULL,
  token text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  expires_at timestamp with time zone NOT NULL,
  accepted_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_invitations_pkey PRIMARY KEY (id),
  CONSTRAINT user_invitations_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT user_invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.users(id) ON DELETE SET NULL,
  CONSTRAINT user_invitations_email_org_unique UNIQUE (email, org_id)
);

-- Index for faster invitation lookups
CREATE INDEX IF NOT EXISTS idx_user_invitations_org ON public.user_invitations (org_id, status);
CREATE INDEX IF NOT EXISTS idx_user_invitations_token ON public.user_invitations (token);
CREATE INDEX IF NOT EXISTS idx_user_invitations_email ON public.user_invitations (email);

-- Enable RLS
ALTER TABLE public.user_invitations ENABLE ROW LEVEL SECURITY;

-- Admins can view and manage invitations for their org
CREATE POLICY "Admins can view org invitations"
  ON public.user_invitations FOR SELECT
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM public.users
      WHERE auth_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can insert org invitations"
  ON public.user_invitations FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM public.users
      WHERE auth_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can update org invitations"
  ON public.user_invitations FOR UPDATE
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM public.users
      WHERE auth_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can delete org invitations"
  ON public.user_invitations FOR DELETE
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM public.users
      WHERE auth_id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================================================
-- TRIGGER FUNCTIONS: Auto-create notifications and audit logs
-- ============================================================================

-- Function to create notification on task assignment
CREATE OR REPLACE FUNCTION notify_task_assigned()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.assignee_id IS NOT NULL AND (OLD.assignee_id IS NULL OR OLD.assignee_id != NEW.assignee_id) THEN
    INSERT INTO public.notifications (user_id, type, title, message, data)
    VALUES (
      NEW.assignee_id,
      'task_assigned',
      'New Task Assigned',
      'You have been assigned a new task: ' || NEW.title,
      jsonb_build_object('task_id', NEW.id, 'task_title', NEW.title)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_notify_task_assigned ON public.tasks;
CREATE TRIGGER trigger_notify_task_assigned
  AFTER INSERT OR UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION notify_task_assigned();

-- Function to create notification on QC review
CREATE OR REPLACE FUNCTION notify_qc_review()
RETURNS TRIGGER AS $$
DECLARE
  task_record RECORD;
BEGIN
  SELECT * INTO task_record FROM public.tasks WHERE id = NEW.task_id;

  IF NEW.outcome = 'approved' THEN
    INSERT INTO public.notifications (user_id, type, title, message, data)
    VALUES (
      task_record.assignee_id,
      'qc_approved',
      'Task Approved',
      'Your task "' || task_record.title || '" has been approved!',
      jsonb_build_object('task_id', NEW.task_id, 'review_id', NEW.id)
    );
  ELSIF NEW.outcome = 'rejected' THEN
    INSERT INTO public.notifications (user_id, type, title, message, data)
    VALUES (
      task_record.assignee_id,
      'qc_rejected',
      'Task Needs Revision',
      'Your task "' || task_record.title || '" requires revisions.',
      jsonb_build_object('task_id', NEW.task_id, 'review_id', NEW.id, 'feedback', NEW.feedback)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_notify_qc_review ON public.qc_reviews;
CREATE TRIGGER trigger_notify_qc_review
  AFTER INSERT ON public.qc_reviews
  FOR EACH ROW
  EXECUTE FUNCTION notify_qc_review();

-- Function to log audit entries for important actions
CREATE OR REPLACE FUNCTION log_audit_entry()
RETURNS TRIGGER AS $$
DECLARE
  current_user_id uuid;
  current_org_id uuid;
BEGIN
  -- Get current user info
  SELECT id, org_id INTO current_user_id, current_org_id
  FROM public.users
  WHERE auth_id = auth.uid();

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log (org_id, user_id, action, entity_type, entity_id, new_data)
    VALUES (current_org_id, current_user_id, 'create', TG_TABLE_NAME, NEW.id, to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_log (org_id, user_id, action, entity_type, entity_id, old_data, new_data)
    VALUES (current_org_id, current_user_id, 'update', TG_TABLE_NAME, NEW.id, to_jsonb(OLD), to_jsonb(NEW));
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_log (org_id, user_id, action, entity_type, entity_id, old_data)
    VALUES (current_org_id, current_user_id, 'delete', TG_TABLE_NAME, OLD.id, to_jsonb(OLD));
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Apply audit logging to important tables
DROP TRIGGER IF EXISTS audit_users ON public.users;
CREATE TRIGGER audit_users
  AFTER INSERT OR UPDATE OR DELETE ON public.users
  FOR EACH ROW EXECUTE FUNCTION log_audit_entry();

DROP TRIGGER IF EXISTS audit_projects ON public.projects;
CREATE TRIGGER audit_projects
  AFTER INSERT OR UPDATE OR DELETE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION log_audit_entry();

DROP TRIGGER IF EXISTS audit_tasks ON public.tasks;
CREATE TRIGGER audit_tasks
  AFTER INSERT OR UPDATE OR DELETE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION log_audit_entry();

DROP TRIGGER IF EXISTS audit_payouts ON public.payouts;
CREATE TRIGGER audit_payouts
  AFTER INSERT OR UPDATE OR DELETE ON public.payouts
  FOR EACH ROW EXECUTE FUNCTION log_audit_entry();

-- ============================================================================
-- ADDITIONAL INDEXES FOR PERFORMANCE
-- ============================================================================

-- Index for leaderboard queries
CREATE INDEX IF NOT EXISTS idx_users_xp_level ON public.users (xp DESC, level DESC);
CREATE INDEX IF NOT EXISTS idx_users_org_role ON public.users (org_id, role);

-- Index for project queries
CREATE INDEX IF NOT EXISTS idx_projects_status ON public.projects (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_pm ON public.projects (pm_id, status);

-- Index for payout summary queries
CREATE INDEX IF NOT EXISTS idx_payouts_created ON public.payouts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payouts_type_status ON public.payouts (payout_type, status);

-- ============================================================================
-- METADATA COLUMNS: Add metadata to users for extended profile data
-- ============================================================================

-- Add metadata column if not exists
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}';

-- Update users to have default metadata structure
UPDATE public.users
SET metadata = COALESCE(metadata, '{}') || jsonb_build_object(
  'total_tasks_completed', COALESCE(tasks_completed, 0),
  'current_streak', COALESCE(streak_days, 0),
  'longest_streak', COALESCE(streak_days, 0),
  'first_pass_approvals', 0,
  'total_earnings', 0,
  'xp', COALESCE(xp, level * 100)
)
WHERE metadata IS NULL OR metadata = '{}';

-- ============================================================================
-- REALTIME: Enable realtime for key tables
-- ============================================================================

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Enable realtime for user_badges
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_badges;

-- ============================================================================
-- GRANULAR ACCESS CONTROL: Project and Task level permissions
-- ============================================================================

-- Permission levels: none, view, work, manage, admin
CREATE TYPE permission_level AS ENUM ('none', 'view', 'work', 'manage', 'admin');

-- Project Access Table: Explicit permissions for users on projects
CREATE TABLE IF NOT EXISTS public.project_access (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  user_id uuid NOT NULL,
  permission_level permission_level NOT NULL DEFAULT 'view',
  granted_by uuid NOT NULL,
  granted_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone,
  CONSTRAINT project_access_pkey PRIMARY KEY (id),
  CONSTRAINT project_access_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE,
  CONSTRAINT project_access_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT project_access_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES public.users(id) ON DELETE SET NULL,
  CONSTRAINT project_access_unique UNIQUE (project_id, user_id)
);

-- Indexes for project access
CREATE INDEX IF NOT EXISTS idx_project_access_project ON public.project_access (project_id);
CREATE INDEX IF NOT EXISTS idx_project_access_user ON public.project_access (user_id);
CREATE INDEX IF NOT EXISTS idx_project_access_expires ON public.project_access (expires_at) WHERE expires_at IS NOT NULL;

-- Enable RLS for project_access
ALTER TABLE public.project_access ENABLE ROW LEVEL SECURITY;

-- Users can view project access where they have manage/admin permission or are admin
CREATE POLICY "Users can view project access"
  ON public.project_access FOR SELECT
  TO authenticated
  USING (
    -- Admin can see all
    EXISTS (SELECT 1 FROM public.users WHERE auth_id = auth.uid() AND role = 'admin')
    OR
    -- PM of the project can see
    EXISTS (
      SELECT 1 FROM public.projects p
      JOIN public.users u ON u.auth_id = auth.uid()
      WHERE p.id = project_id AND p.pm_id = u.id
    )
    OR
    -- User with manage access can see
    EXISTS (
      SELECT 1 FROM public.project_access pa
      JOIN public.users u ON u.auth_id = auth.uid()
      WHERE pa.project_id = project_access.project_id
        AND pa.user_id = u.id
        AND pa.permission_level IN ('manage', 'admin')
    )
  );

-- Only admins and PMs can grant project access
CREATE POLICY "Admins and PMs can manage project access"
  ON public.project_access FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE auth_id = auth.uid() AND role = 'admin')
    OR
    EXISTS (
      SELECT 1 FROM public.projects p
      JOIN public.users u ON u.auth_id = auth.uid()
      WHERE p.id = project_id AND p.pm_id = u.id
    )
  );

-- Task Access Table: Explicit permissions for users on tasks
CREATE TABLE IF NOT EXISTS public.task_access (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL,
  user_id uuid NOT NULL,
  permission_level permission_level NOT NULL DEFAULT 'view',
  granted_by uuid NOT NULL,
  granted_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone,
  CONSTRAINT task_access_pkey PRIMARY KEY (id),
  CONSTRAINT task_access_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE,
  CONSTRAINT task_access_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT task_access_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES public.users(id) ON DELETE SET NULL,
  CONSTRAINT task_access_unique UNIQUE (task_id, user_id)
);

-- Indexes for task access
CREATE INDEX IF NOT EXISTS idx_task_access_task ON public.task_access (task_id);
CREATE INDEX IF NOT EXISTS idx_task_access_user ON public.task_access (user_id);
CREATE INDEX IF NOT EXISTS idx_task_access_expires ON public.task_access (expires_at) WHERE expires_at IS NOT NULL;

-- Enable RLS for task_access
ALTER TABLE public.task_access ENABLE ROW LEVEL SECURITY;

-- Users can view task access where they have manage permission on the project
CREATE POLICY "Users can view task access"
  ON public.task_access FOR SELECT
  TO authenticated
  USING (
    -- Admin can see all
    EXISTS (SELECT 1 FROM public.users WHERE auth_id = auth.uid() AND role = 'admin')
    OR
    -- PM of the task's project can see
    EXISTS (
      SELECT 1 FROM public.tasks t
      JOIN public.projects p ON p.id = t.project_id
      JOIN public.users u ON u.auth_id = auth.uid()
      WHERE t.id = task_id AND p.pm_id = u.id
    )
  );

-- Only admins and PMs can grant task access
CREATE POLICY "Admins and PMs can manage task access"
  ON public.task_access FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE auth_id = auth.uid() AND role = 'admin')
    OR
    EXISTS (
      SELECT 1 FROM public.tasks t
      JOIN public.projects p ON p.id = t.project_id
      JOIN public.users u ON u.auth_id = auth.uid()
      WHERE t.id = task_id AND p.pm_id = u.id
    )
  );

-- Team Members Table: Project team assignments with roles
CREATE TABLE IF NOT EXISTS public.team_members (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'lead', 'reviewer')),
  added_by uuid NOT NULL,
  added_at timestamp with time zone DEFAULT now(),
  CONSTRAINT team_members_pkey PRIMARY KEY (id),
  CONSTRAINT team_members_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE,
  CONSTRAINT team_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT team_members_added_by_fkey FOREIGN KEY (added_by) REFERENCES public.users(id) ON DELETE SET NULL,
  CONSTRAINT team_members_unique UNIQUE (project_id, user_id)
);

-- Indexes for team members
CREATE INDEX IF NOT EXISTS idx_team_members_project ON public.team_members (project_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON public.team_members (user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_role ON public.team_members (project_id, role);

-- Enable RLS for team_members
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- Users can view team members of projects they have access to
CREATE POLICY "Users can view team members"
  ON public.team_members FOR SELECT
  TO authenticated
  USING (
    -- Admin can see all
    EXISTS (SELECT 1 FROM public.users WHERE auth_id = auth.uid() AND role = 'admin')
    OR
    -- Same org can see
    EXISTS (
      SELECT 1 FROM public.projects p
      JOIN public.users u ON u.auth_id = auth.uid()
      WHERE p.id = project_id AND p.org_id = u.org_id
    )
  );

-- PMs and admins can manage team members
CREATE POLICY "PMs and admins can manage team members"
  ON public.team_members FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE auth_id = auth.uid() AND role = 'admin')
    OR
    EXISTS (
      SELECT 1 FROM public.projects p
      JOIN public.users u ON u.auth_id = auth.uid()
      WHERE p.id = project_id AND p.pm_id = u.id
    )
  );

-- Enable realtime for access tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.project_access;
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_access;
ALTER PUBLICATION supabase_realtime ADD TABLE public.team_members;

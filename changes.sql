-- changes.sql
-- Database changes for Task Management feature enhancements
-- Run these in Supabase SQL Editor after reviewing

-- ============================================================================
-- GAMIFICATION: XP and Level Tracking
-- ============================================================================

-- Add XP tracking to users table (if not exists)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS xp integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS xp_this_period integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tasks_completed integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS streak_days integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_task_completed_at timestamp with time zone;

-- Create achievements/badges table
CREATE TABLE IF NOT EXISTS public.achievements (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  icon text,
  category text NOT NULL DEFAULT 'general',
  xp_reward integer DEFAULT 0,
  condition jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT achievements_pkey PRIMARY KEY (id)
);

-- Create user_achievements junction table
CREATE TABLE IF NOT EXISTS public.user_achievements (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  achievement_id uuid NOT NULL,
  earned_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_achievements_pkey PRIMARY KEY (id),
  CONSTRAINT user_achievements_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT user_achievements_achievement_id_fkey FOREIGN KEY (achievement_id) REFERENCES public.achievements(id) ON DELETE CASCADE,
  CONSTRAINT user_achievements_unique UNIQUE (user_id, achievement_id)
);

-- ============================================================================
-- TASK EVENTS: Limited-time bonus events
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.task_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid,
  name text NOT NULL,
  description text,
  xp_multiplier numeric DEFAULT 1.0,
  payout_multiplier numeric DEFAULT 1.0,
  starts_at timestamp with time zone NOT NULL,
  ends_at timestamp with time zone NOT NULL,
  task_filter jsonb DEFAULT '{}',
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT task_events_pkey PRIMARY KEY (id),
  CONSTRAINT task_events_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE
);

-- ============================================================================
-- TASK TEMPLATES: Pre-defined task templates for common work
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.task_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid,
  name text NOT NULL,
  description text,
  default_dollar_value numeric DEFAULT 50,
  default_story_points integer,
  default_urgency_multiplier numeric DEFAULT 1.0,
  default_required_level integer DEFAULT 1,
  category text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT task_templates_pkey PRIMARY KEY (id),
  CONSTRAINT task_templates_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE
);

-- ============================================================================
-- INDEXES for performance
-- ============================================================================

-- Index for faster task queries by status and level
CREATE INDEX IF NOT EXISTS idx_tasks_status_level ON public.tasks (status, required_level);

-- Index for faster task queries by deadline
CREATE INDEX IF NOT EXISTS idx_tasks_deadline ON public.tasks (deadline) WHERE deadline IS NOT NULL;

-- Index for faster QC review queries
CREATE INDEX IF NOT EXISTS idx_qc_reviews_task_id ON public.qc_reviews (task_id);

-- Index for faster payout queries by user
CREATE INDEX IF NOT EXISTS idx_payouts_user_status ON public.payouts (user_id, status);

-- Index for task events date range queries
CREATE INDEX IF NOT EXISTS idx_task_events_dates ON public.task_events (starts_at, ends_at);

-- ============================================================================
-- DEFAULT ACHIEVEMENTS
-- ============================================================================

INSERT INTO public.achievements (name, description, icon, category, xp_reward, condition) VALUES
  ('First Task', 'Complete your first task', 'trophy', 'milestone', 50, '{"tasks_completed": 1}'),
  ('Task Master', 'Complete 10 tasks', 'award', 'milestone', 100, '{"tasks_completed": 10}'),
  ('Task Legend', 'Complete 50 tasks', 'crown', 'milestone', 500, '{"tasks_completed": 50}'),
  ('Speed Demon', 'Complete 5 urgent tasks', 'zap', 'performance', 150, '{"urgent_tasks": 5}'),
  ('Quality Star', 'Get 10 tasks approved on first review', 'star', 'quality', 200, '{"first_pass_approvals": 10}'),
  ('Level Up', 'Reach level 2', 'trending-up', 'progression', 100, '{"level": 2}'),
  ('Expert', 'Reach level 5', 'shield', 'progression', 500, '{"level": 5}'),
  ('Streak Starter', 'Complete tasks 3 days in a row', 'flame', 'consistency', 75, '{"streak_days": 3}'),
  ('Streak Master', 'Complete tasks 7 days in a row', 'flame', 'consistency', 200, '{"streak_days": 7}'),
  ('High Roller', 'Complete a task worth over $200', 'dollar-sign', 'earnings', 100, '{"high_value_task": true}')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- FUNCTIONS: XP Calculation and Level Up
-- ============================================================================

-- Function to calculate XP from a completed task
CREATE OR REPLACE FUNCTION calculate_task_xp(
  p_story_points integer,
  p_urgency_multiplier numeric,
  p_required_level integer
) RETURNS integer AS $$
DECLARE
  base_xp integer;
  urgency_bonus integer;
  level_bonus integer;
BEGIN
  -- Base XP from story points or default
  base_xp := COALESCE(p_story_points * 10, 25);

  -- Urgency bonus
  urgency_bonus := FLOOR((p_urgency_multiplier - 1) * 50);

  -- Level bonus
  level_bonus := (p_required_level - 1) * 5;

  RETURN base_xp + urgency_bonus + level_bonus;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate user level from XP
CREATE OR REPLACE FUNCTION calculate_level_from_xp(p_xp integer)
RETURNS integer AS $$
BEGIN
  -- Level thresholds: 0, 100, 300, 600, 1000, 1500, 2100, 2800, 3600, 4500, ...
  -- Level n requires (n-1) * 50 * n XP
  RETURN GREATEST(1, FLOOR(SQRT(p_xp / 50.0) + 1));
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGERS: Auto-update XP and level on task completion
-- ============================================================================

-- Trigger function to award XP when task is approved
CREATE OR REPLACE FUNCTION award_task_xp()
RETURNS TRIGGER AS $$
DECLARE
  task_record RECORD;
  earned_xp integer;
  new_total_xp integer;
  new_level integer;
BEGIN
  -- Only process when task moves to approved status
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
    -- Get task details
    SELECT * INTO task_record FROM public.tasks WHERE id = NEW.id;

    -- Calculate XP
    earned_xp := calculate_task_xp(
      task_record.story_points,
      task_record.urgency_multiplier,
      task_record.required_level
    );

    -- Update user XP and stats
    UPDATE public.users
    SET
      xp = xp + earned_xp,
      xp_this_period = xp_this_period + earned_xp,
      tasks_completed = tasks_completed + 1,
      last_task_completed_at = now(),
      level = calculate_level_from_xp(xp + earned_xp)
    WHERE id = task_record.assignee_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_award_task_xp ON public.tasks;
CREATE TRIGGER trigger_award_task_xp
  AFTER UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION award_task_xp();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on new tables
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_templates ENABLE ROW LEVEL SECURITY;

-- Achievements are readable by all authenticated users
CREATE POLICY "Achievements are viewable by authenticated users"
  ON public.achievements FOR SELECT
  TO authenticated
  USING (true);

-- User achievements: users can see their own
CREATE POLICY "Users can view own achievements"
  ON public.user_achievements FOR SELECT
  TO authenticated
  USING (auth.uid() = (SELECT auth_id FROM public.users WHERE id = user_id));

-- Task events: org members can view
CREATE POLICY "Org members can view task events"
  ON public.task_events FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT org_id FROM public.users WHERE auth_id = auth.uid()));

-- Task templates: org members can view, admins/PMs can manage
CREATE POLICY "Org members can view task templates"
  ON public.task_templates FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT org_id FROM public.users WHERE auth_id = auth.uid()));

CREATE POLICY "Admins and PMs can manage task templates"
  ON public.task_templates FOR ALL
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM public.users
      WHERE auth_id = auth.uid()
      AND role IN ('admin', 'pm')
    )
  );

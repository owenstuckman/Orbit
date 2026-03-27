-- Gamification triggers: XP awards, level-ups, streak tracking on task approval
-- Applied via execute_sql on 2026-03-26

-- Calculate XP for a task based on complexity
CREATE OR REPLACE FUNCTION calculate_task_xp(
  p_story_points integer,
  p_urgency_multiplier numeric,
  p_required_level integer
)
RETURNS integer AS $$
DECLARE
  v_base_xp integer;
  v_level_bonus numeric;
BEGIN
  v_base_xp := COALESCE(p_story_points, 5) * 10;
  v_level_bonus := 1.0 + (COALESCE(p_required_level, 1) * 0.1);
  RETURN FLOOR(v_base_xp * COALESCE(p_urgency_multiplier, 1.0) * v_level_bonus)::integer;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

-- Calculate level from total XP (quadratic: 50 * n * (n-1))
CREATE OR REPLACE FUNCTION calculate_level_from_xp(p_xp integer)
RETURNS integer AS $$
DECLARE
  v_level integer := 1;
  v_xp_needed integer := 0;
BEGIN
  LOOP
    v_level := v_level + 1;
    v_xp_needed := 50 * v_level * (v_level - 1);
    EXIT WHEN v_xp_needed > p_xp;
  END LOOP;
  RETURN v_level - 1;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

-- Trigger: award XP, update level, track streak, send notifications on task approval
CREATE OR REPLACE FUNCTION award_task_xp()
RETURNS trigger AS $$
DECLARE
  v_xp_gained integer;
  v_new_xp integer;
  v_new_level integer;
  v_old_level integer;
  v_user_id uuid;
  v_last_completion timestamptz;
  v_current_streak integer;
  v_longest_streak integer;
  v_days_since integer;
  v_tasks_completed integer;
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
    v_user_id := NEW.assignee_id;

    IF v_user_id IS NOT NULL THEN
      v_xp_gained := calculate_task_xp(
        NEW.story_points,
        COALESCE(NEW.urgency_multiplier, 1.0),
        COALESCE(NEW.required_level, 1)
      );

      SELECT
        COALESCE(level, 1),
        last_task_completed_at,
        COALESCE((metadata->>'current_streak')::integer, 0),
        COALESCE((metadata->>'longest_streak')::integer, 0),
        COALESCE((metadata->>'total_tasks_completed')::integer, 0)
      INTO v_old_level, v_last_completion, v_current_streak, v_longest_streak, v_tasks_completed
      FROM users WHERE id = v_user_id;

      IF v_last_completion IS NOT NULL THEN
        v_days_since := (CURRENT_DATE - DATE(v_last_completion))::integer;
      ELSE
        v_days_since := 999;
      END IF;

      IF v_days_since <= 1 THEN
        v_current_streak := v_current_streak + 1;
      ELSE
        v_current_streak := 1;
      END IF;
      v_longest_streak := GREATEST(v_current_streak, v_longest_streak);
      v_tasks_completed := v_tasks_completed + 1;

      SELECT COALESCE(xp, 0) INTO v_new_xp FROM users WHERE id = v_user_id;
      v_new_xp := v_new_xp + v_xp_gained;
      v_new_level := calculate_level_from_xp(v_new_xp);

      UPDATE users
      SET
        xp = v_new_xp,
        level = v_new_level,
        streak_days = v_current_streak,
        last_task_completed_at = NOW(),
        metadata = jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  COALESCE(metadata, '{}'::jsonb),
                  '{total_xp}', to_jsonb(v_new_xp)
                ),
                '{current_streak}', to_jsonb(v_current_streak)
              ),
              '{longest_streak}', to_jsonb(v_longest_streak)
            ),
            '{total_tasks_completed}', to_jsonb(v_tasks_completed)
          ),
          '{last_xp_gain}', to_jsonb(v_xp_gained)
        )
      WHERE id = v_user_id;

      INSERT INTO notifications (user_id, type, title, message, data)
      VALUES (
        v_user_id,
        'achievement_earned',
        'Task Approved!',
        'You earned ' || v_xp_gained || ' XP for "' || LEFT(NEW.title, 50) || '"',
        jsonb_build_object('task_id', NEW.id, 'xp_gained', v_xp_gained)
      );

      IF v_new_level > v_old_level THEN
        INSERT INTO notifications (user_id, type, title, message, data)
        VALUES (
          v_user_id,
          'level_up',
          'Level Up!',
          'Congratulations! You reached level ' || v_new_level || '!',
          jsonb_build_object('new_level', v_new_level, 'old_level', v_old_level)
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_award_task_xp ON public.tasks;
CREATE TRIGGER trigger_award_task_xp
  AFTER UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION award_task_xp();

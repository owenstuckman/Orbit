-- Fix: notify_qc_review trigger fails when task has no assignee_id
-- Error: null value in column "user_id" of relation "notifications" violates not-null constraint
--
-- The trigger inserts a notification for the task assignee, but doesn't handle
-- the case where assignee_id is null (e.g., AI reviews on unassigned tasks).

CREATE OR REPLACE FUNCTION notify_qc_review()
RETURNS trigger AS $$
DECLARE
  v_task tasks%ROWTYPE;
  v_reviewer_name text;
BEGIN
  -- Get the task for this review
  SELECT * INTO v_task FROM tasks WHERE id = NEW.task_id;

  -- Skip notification if task has no assignee
  IF v_task.assignee_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Skip notification for AI reviews (automated, no human reviewer)
  IF NEW.review_type = 'ai' THEN
    RETURN NEW;
  END IF;

  -- Get reviewer name
  SELECT full_name INTO v_reviewer_name
  FROM users WHERE id = NEW.reviewer_id;

  -- Insert notification for the task assignee
  INSERT INTO notifications (user_id, type, title, message, data)
  VALUES (
    v_task.assignee_id,
    CASE WHEN NEW.passed THEN 'qc_approved' ELSE 'qc_rejected' END,
    CASE WHEN NEW.passed
      THEN 'Task Approved: ' || v_task.title
      ELSE 'Task Needs Revision: ' || v_task.title
    END,
    CASE WHEN NEW.passed
      THEN 'Your submission for "' || v_task.title || '" has been approved by ' || COALESCE(v_reviewer_name, 'a reviewer') || '.'
      ELSE 'Your submission for "' || v_task.title || '" needs revision. ' || COALESCE(NEW.feedback, 'Check reviewer feedback for details.')
    END,
    jsonb_build_object(
      'task_id', NEW.task_id,
      'review_id', NEW.id,
      'passed', NEW.passed,
      'review_type', NEW.review_type
    )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

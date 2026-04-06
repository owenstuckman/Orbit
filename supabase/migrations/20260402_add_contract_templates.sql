-- Migration: Add contract_templates table and template_id FK on contracts

-- 1. Create contract_templates table
CREATE TABLE IF NOT EXISTS contract_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  template_type text NOT NULL DEFAULT 'contractor',
  sections    jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- sections: [{title: string, body: string, order: number}]
  variables   jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- variables: [{key: string, label: string, required: boolean, default: string|null}]
  is_default  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 2. Only one default template per org per template_type
CREATE UNIQUE INDEX IF NOT EXISTS contract_templates_one_default_per_type
  ON contract_templates (org_id, template_type)
  WHERE is_default = true;

-- 3. updated_at trigger (reuse existing function if available)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'set_contract_templates_updated_at'
  ) THEN
    CREATE TRIGGER set_contract_templates_updated_at
      BEFORE UPDATE ON contract_templates
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END
$$;

-- 4. RLS
ALTER TABLE contract_templates ENABLE ROW LEVEL SECURITY;

-- All org members can read templates
CREATE POLICY "org members can read contract templates"
  ON contract_templates FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM users WHERE id = auth.uid()
      UNION
      SELECT org_id FROM user_organization_memberships WHERE user_id = auth.uid()
    )
  );

-- Only admins can insert
CREATE POLICY "admins can insert contract templates"
  ON contract_templates FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM users
      WHERE id = auth.uid()
        AND role = 'admin'
      UNION
      SELECT org_id FROM user_organization_memberships
      WHERE user_id = auth.uid()
        AND role = 'admin'
    )
  );

-- Only admins can update
CREATE POLICY "admins can update contract templates"
  ON contract_templates FOR UPDATE
  USING (
    org_id IN (
      SELECT org_id FROM users
      WHERE id = auth.uid()
        AND role = 'admin'
      UNION
      SELECT org_id FROM user_organization_memberships
      WHERE user_id = auth.uid()
        AND role = 'admin'
    )
  );

-- Only admins can delete
CREATE POLICY "admins can delete contract templates"
  ON contract_templates FOR DELETE
  USING (
    org_id IN (
      SELECT org_id FROM users
      WHERE id = auth.uid()
        AND role = 'admin'
      UNION
      SELECT org_id FROM user_organization_memberships
      WHERE user_id = auth.uid()
        AND role = 'admin'
    )
  );

-- 5. Add template_id FK to contracts (nullable for backwards compat)
ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES contract_templates(id) ON DELETE SET NULL;

-- 6. Seed a default contractor template for each existing org
INSERT INTO contract_templates (org_id, name, description, template_type, is_default, sections, variables)
SELECT
  id AS org_id,
  'Standard Contractor Agreement' AS name,
  'Default contractor agreement with standard terms and conditions.' AS description,
  'contractor' AS template_type,
  true AS is_default,
  '[
    {"title": "Scope of Work", "body": "The Contractor agrees to perform the following services for {{task_title}}:\n\n{{task_description}}", "order": 1},
    {"title": "Compensation", "body": "The Client agrees to pay the Contractor {{compensation}} upon successful completion and approval of the deliverables. Payment shall be made within 30 days.", "order": 2},
    {"title": "Timeline", "body": "Work must be completed by {{deadline}}. The Contractor shall submit all deliverables via the Orbit platform.", "order": 3},
    {"title": "Independent Contractor Status", "body": "The Contractor is an independent contractor and not an employee of the Client. The Contractor is responsible for all taxes and obligations associated with self-employment.", "order": 4},
    {"title": "Intellectual Property", "body": "All work product created under this agreement shall become the exclusive property of {{org_name}} upon payment in full.", "order": 5},
    {"title": "Confidentiality", "body": "The Contractor agrees to maintain the confidentiality of all proprietary information disclosed during this engagement.", "order": 6}
  ]'::jsonb AS sections,
  '[
    {"key": "task_title", "label": "Task Title", "required": true, "default": null},
    {"key": "task_description", "label": "Task Description", "required": false, "default": "See attached task details."},
    {"key": "compensation", "label": "Compensation Amount", "required": true, "default": null},
    {"key": "deadline", "label": "Deadline", "required": false, "default": "To be agreed upon"},
    {"key": "org_name", "label": "Organization Name", "required": true, "default": null}
  ]'::jsonb AS variables
FROM organizations
ON CONFLICT DO NOTHING;

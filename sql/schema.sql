-- ============================================================
-- WAYPOINT — Funeral Director Workflow App
-- Supabase SQL Schema
-- Run this entire file in the Supabase SQL Editor
-- ============================================================


-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ============================================================
-- TEMPLATES
-- ============================================================

CREATE TABLE templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name            TEXT NOT NULL,
  description     TEXT,
  is_default      BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ── TEMPLATE PHASES (tabs) ────────────────────────────────────
CREATE TABLE template_phases (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id     UUID REFERENCES templates(id) ON DELETE CASCADE NOT NULL,
  title           TEXT NOT NULL,
  position        INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ── TEMPLATE SECTIONS ─────────────────────────────────────────
CREATE TABLE template_sections (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id            UUID REFERENCES template_phases(id) ON DELETE CASCADE NOT NULL,
  template_id         UUID REFERENCES templates(id) ON DELETE CASCADE NOT NULL,
  title               TEXT NOT NULL,
  position            INTEGER NOT NULL DEFAULT 0,
  surface_on_card     BOOLEAN DEFAULT FALSE,
  conditional_logic   JSONB,
  -- conditional_logic shape:
  -- {
  --   "operator": "AND" | "OR",
  --   "rules": [
  --     {
  --       "trigger_item_variable": "variable_name",
  --       "condition": "completed" | "not_completed" | "equals" | "not_equals",
  --       "value": "some value"   -- only for equals/not_equals
  --     }
  --   ]
  -- }
  created_at          TIMESTAMPTZ DEFAULT now()
);

-- ── TEMPLATE ITEMS ────────────────────────────────────────────
CREATE TABLE template_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id          UUID REFERENCES template_sections(id) ON DELETE CASCADE NOT NULL,
  template_id         UUID REFERENCES templates(id) ON DELETE CASCADE NOT NULL,
  label               TEXT NOT NULL,
  helper_text         TEXT,
  variable_name       TEXT,
  field_type          TEXT NOT NULL DEFAULT 'checkbox',
  -- field_type options:
  -- 'checkbox' | 'yes_no' | 'radio' | 'short_text' |
  -- 'long_text' | 'date' | 'datetime' | 'phone' | 'email'
  field_options       JSONB,
  -- field_options shape (for radio/list types):
  -- { "options": ["Option A", "Option B", "Option C"] }
  is_important        BOOLEAN DEFAULT FALSE,
  relative_due_days   INTEGER,
  -- number of days from case creation date when this item is due
  -- null = no due date
  position            INTEGER NOT NULL DEFAULT 0,
  conditional_logic   JSONB,
  -- same shape as section conditional_logic above
  created_at          TIMESTAMPTZ DEFAULT now()
);


-- ============================================================
-- FAMILIES
-- ============================================================

CREATE TABLE families (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  template_id           UUID REFERENCES templates(id) ON DELETE SET NULL,

  -- Decedent
  decedent_first_name   TEXT NOT NULL,
  decedent_last_name    TEXT NOT NULL,
  date_of_birth         DATE,
  date_of_death         DATE,

  -- Veteran flags
  is_veteran            BOOLEAN DEFAULT FALSE,
  is_veteran_spouse     BOOLEAN DEFAULT FALSE,

  -- Status
  status                TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'long_term', 'completed')),
  long_term_reason      TEXT,

  -- Case notes
  notes                 TEXT,

  -- Timestamps
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

-- ── FAMILY CONTACTS ───────────────────────────────────────────
CREATE TABLE family_contacts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id       UUID REFERENCES families(id) ON DELETE CASCADE NOT NULL,
  is_primary      BOOLEAN DEFAULT FALSE,
  name            TEXT NOT NULL,
  relationship    TEXT,
  phone           TEXT,
  email           TEXT,
  role_notes      TEXT,
  -- e.g. "Primary decision maker", "Incapacitated — do not call"
  position        INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);


-- ============================================================
-- FAMILY CHECKLIST (copied from template on case creation)
-- ============================================================

-- ── FAMILY PHASES ─────────────────────────────────────────────
CREATE TABLE family_phases (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id             UUID REFERENCES families(id) ON DELETE CASCADE NOT NULL,
  template_phase_id     UUID REFERENCES template_phases(id) ON DELETE SET NULL,
  title                 TEXT NOT NULL,
  position              INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ DEFAULT now()
);

-- ── FAMILY SECTIONS ───────────────────────────────────────────
CREATE TABLE family_sections (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id             UUID REFERENCES families(id) ON DELETE CASCADE NOT NULL,
  phase_id              UUID REFERENCES family_phases(id) ON DELETE CASCADE NOT NULL,
  template_section_id   UUID REFERENCES template_sections(id) ON DELETE SET NULL,
  title                 TEXT NOT NULL,
  position              INTEGER NOT NULL DEFAULT 0,
  is_adhoc              BOOLEAN DEFAULT FALSE,
  surface_on_card       BOOLEAN DEFAULT FALSE,
  conditional_logic     JSONB,
  created_at            TIMESTAMPTZ DEFAULT now()
);

-- ── FAMILY ITEMS ──────────────────────────────────────────────
CREATE TABLE family_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id             UUID REFERENCES families(id) ON DELETE CASCADE NOT NULL,
  section_id            UUID REFERENCES family_sections(id) ON DELETE CASCADE NOT NULL,
  template_item_id      UUID REFERENCES template_items(id) ON DELETE SET NULL,

  -- Content (copied from template, editable per family)
  label                 TEXT NOT NULL,
  helper_text           TEXT,
  variable_name         TEXT,
  field_type            TEXT NOT NULL DEFAULT 'checkbox',
  field_options         JSONB,
  is_important          BOOLEAN DEFAULT FALSE,
  due_date              DATE,
  -- absolute due date (calculated from relative_due_days at case creation)
  position              INTEGER NOT NULL DEFAULT 0,
  is_adhoc              BOOLEAN DEFAULT FALSE,
  conditional_logic     JSONB,

  -- State
  item_state            TEXT NOT NULL DEFAULT 'incomplete'
                        CHECK (item_state IN ('incomplete', 'complete', 'skipped')),
  field_value           JSONB,
  -- stores the entered value regardless of field type:
  -- checkbox:    { "checked": true }
  -- yes_no:      { "value": "yes" } | { "value": "no" }
  -- radio:       { "value": "Option A" }
  -- short_text:  { "value": "some text" }
  -- long_text:   { "value": "longer text" }
  -- date:        { "value": "2026-06-21" }
  -- datetime:    { "value": "2026-06-21T14:30:00" }
  -- phone:       { "value": "(407) 555-0182" }
  -- email:       { "value": "name@example.com" }
  item_notes            TEXT,
  completed_at          TIMESTAMPTZ,
  skipped_at            TIMESTAMPTZ,

  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);


-- ============================================================
-- STANDALONE REMINDERS
-- ============================================================

CREATE TABLE reminders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id       UUID REFERENCES families(id) ON DELETE CASCADE NOT NULL,
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  description     TEXT NOT NULL,
  due_date        DATE NOT NULL,
  is_dismissed    BOOLEAN DEFAULT FALSE,
  dismissed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ── DISMISSED CHECKLIST ITEM REMINDERS ───────────────────────
-- Tracks which item-level due date reminders have been dismissed
CREATE TABLE dismissed_reminders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  family_item_id  UUID REFERENCES family_items(id) ON DELETE CASCADE NOT NULL,
  dismissed_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, family_item_id)
);


-- ============================================================
-- CASE ACTIVITY LOG
-- ============================================================

CREATE TABLE activity_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id       UUID REFERENCES families(id) ON DELETE CASCADE NOT NULL,
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  action_type     TEXT NOT NULL,
  -- action_type values:
  -- 'item_completed'    | 'item_uncompleted'
  -- 'item_skipped'      | 'item_unskipped'
  -- 'item_value_set'    | 'item_value_changed'
  -- 'item_added'        | 'item_edited'
  -- 'section_added'     | 'section_edited'
  -- 'status_changed'    | 'notes_edited'
  -- 'notes_quick_added' | 'reminder_added'
  -- 'reminder_dismissed'| 'contact_added'
  -- 'contact_edited'    | 'case_created'
  description     TEXT NOT NULL,
  -- human readable, e.g. "Marked 'DD214 Received' as complete"
  metadata        JSONB,
  -- optional extra data, e.g. { "old_value": "incomplete", "new_value": "complete" }
  created_at      TIMESTAMPTZ DEFAULT now()
);


-- ============================================================
-- TRIGGERS — auto-update updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER families_updated_at
  BEFORE UPDATE ON families
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER family_items_updated_at
  BEFORE UPDATE ON family_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER reminders_updated_at
  BEFORE UPDATE ON reminders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER templates_updated_at
  BEFORE UPDATE ON templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- TRIGGERS — auto-set completed_at / skipped_at on items
-- ============================================================

CREATE OR REPLACE FUNCTION set_item_timestamps()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.item_state = 'complete' AND OLD.item_state != 'complete' THEN
    NEW.completed_at = now();
    NEW.skipped_at = NULL;
  ELSIF NEW.item_state = 'skipped' AND OLD.item_state != 'skipped' THEN
    NEW.skipped_at = now();
    NEW.completed_at = NULL;
  ELSIF NEW.item_state = 'incomplete' THEN
    NEW.completed_at = NULL;
    NEW.skipped_at = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER family_items_state_timestamps
  BEFORE UPDATE ON family_items
  FOR EACH ROW EXECUTE FUNCTION set_item_timestamps();


-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE templates          ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_phases    ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_sections  ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE families           ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_contacts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_phases      ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_sections    ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders          ENABLE ROW LEVEL SECURITY;
ALTER TABLE dismissed_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log       ENABLE ROW LEVEL SECURITY;

-- ── TEMPLATES ─────────────────────────────────────────────────
CREATE POLICY "templates_own" ON templates
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "template_phases_own" ON template_phases
  FOR ALL USING (
    template_id IN (SELECT id FROM templates WHERE user_id = auth.uid())
  );

CREATE POLICY "template_sections_own" ON template_sections
  FOR ALL USING (
    template_id IN (SELECT id FROM templates WHERE user_id = auth.uid())
  );

CREATE POLICY "template_items_own" ON template_items
  FOR ALL USING (
    template_id IN (SELECT id FROM templates WHERE user_id = auth.uid())
  );

-- ── FAMILIES ──────────────────────────────────────────────────
CREATE POLICY "families_own" ON families
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "family_contacts_own" ON family_contacts
  FOR ALL USING (
    family_id IN (SELECT id FROM families WHERE user_id = auth.uid())
  );

CREATE POLICY "family_phases_own" ON family_phases
  FOR ALL USING (
    family_id IN (SELECT id FROM families WHERE user_id = auth.uid())
  );

CREATE POLICY "family_sections_own" ON family_sections
  FOR ALL USING (
    family_id IN (SELECT id FROM families WHERE user_id = auth.uid())
  );

CREATE POLICY "family_items_own" ON family_items
  FOR ALL USING (
    family_id IN (SELECT id FROM families WHERE user_id = auth.uid())
  );

-- ── REMINDERS ─────────────────────────────────────────────────
CREATE POLICY "reminders_own" ON reminders
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "dismissed_reminders_own" ON dismissed_reminders
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── ACTIVITY LOG ──────────────────────────────────────────────
CREATE POLICY "activity_log_own" ON activity_log
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- ============================================================
-- INDEXES — performance
-- ============================================================

-- Templates
CREATE INDEX idx_templates_user          ON templates(user_id);
CREATE INDEX idx_template_phases_tmpl    ON template_phases(template_id);
CREATE INDEX idx_template_sections_phase ON template_sections(phase_id);
CREATE INDEX idx_template_sections_tmpl  ON template_sections(template_id);
CREATE INDEX idx_template_items_section  ON template_items(section_id);
CREATE INDEX idx_template_items_tmpl     ON template_items(template_id);
CREATE INDEX idx_template_items_varname  ON template_items(variable_name);

-- Families
CREATE INDEX idx_families_user           ON families(user_id);
CREATE INDEX idx_families_status         ON families(status);
CREATE INDEX idx_family_contacts_family  ON family_contacts(family_id);
CREATE INDEX idx_family_phases_family    ON family_phases(family_id);
CREATE INDEX idx_family_sections_family  ON family_sections(family_id);
CREATE INDEX idx_family_sections_phase   ON family_sections(phase_id);
CREATE INDEX idx_family_items_family     ON family_items(family_id);
CREATE INDEX idx_family_items_section    ON family_items(section_id);
CREATE INDEX idx_family_items_state      ON family_items(item_state);
CREATE INDEX idx_family_items_important  ON family_items(is_important);
CREATE INDEX idx_family_items_due        ON family_items(due_date);
CREATE INDEX idx_family_items_varname    ON family_items(variable_name);
CREATE INDEX idx_family_items_tmpl_item  ON family_items(template_item_id);

-- Reminders
CREATE INDEX idx_reminders_family        ON reminders(family_id);
CREATE INDEX idx_reminders_user          ON reminders(user_id);
CREATE INDEX idx_reminders_due           ON reminders(due_date);
CREATE INDEX idx_reminders_dismissed     ON reminders(is_dismissed);
CREATE INDEX idx_dismissed_rem_user      ON dismissed_reminders(user_id);
CREATE INDEX idx_dismissed_rem_item      ON dismissed_reminders(family_item_id);

-- Activity log
CREATE INDEX idx_activity_family         ON activity_log(family_id);
CREATE INDEX idx_activity_user           ON activity_log(user_id);
CREATE INDEX idx_activity_created        ON activity_log(created_at DESC);
CREATE INDEX idx_activity_type           ON activity_log(action_type);


-- ============================================================
-- HELPFUL VIEWS
-- ============================================================

-- Family progress summary (useful for dashboard cards)
CREATE OR REPLACE VIEW family_progress AS
SELECT
  f.id AS family_id,
  f.user_id,
  COUNT(fi.id) FILTER (WHERE fi.item_state != 'skipped') AS total_applicable,
  COUNT(fi.id) FILTER (WHERE fi.item_state = 'complete') AS total_complete,
  COUNT(fi.id) FILTER (WHERE fi.item_state = 'skipped') AS total_skipped,
  COUNT(fi.id) FILTER (WHERE fi.item_state = 'incomplete') AS total_incomplete,
  COUNT(fi.id) FILTER (WHERE fi.is_important AND fi.item_state = 'incomplete') AS total_flagged,
  CASE
    WHEN COUNT(fi.id) FILTER (WHERE fi.item_state != 'skipped') = 0 THEN 0
    ELSE ROUND(
      (COUNT(fi.id) FILTER (WHERE fi.item_state = 'complete'))::NUMERIC /
      (COUNT(fi.id) FILTER (WHERE fi.item_state != 'skipped'))::NUMERIC * 100
    )
  END AS completion_pct
FROM families f
LEFT JOIN family_items fi ON fi.family_id = f.id
GROUP BY f.id, f.user_id;

-- Due and overdue items across all families (useful for notification bell)
CREATE OR REPLACE VIEW due_items AS
SELECT
  fi.id AS item_id,
  fi.family_id,
  fi.label,
  fi.due_date,
  fi.is_important,
  fi.item_state,
  f.decedent_first_name,
  f.decedent_last_name,
  f.user_id,
  CASE
    WHEN fi.due_date < CURRENT_DATE THEN 'overdue'
    WHEN fi.due_date = CURRENT_DATE THEN 'due_today'
    WHEN fi.due_date = CURRENT_DATE + 1 THEN 'due_tomorrow'
    ELSE 'upcoming'
  END AS due_status
FROM family_items fi
JOIN families f ON f.id = fi.family_id
WHERE fi.item_state = 'incomplete'
  AND fi.due_date IS NOT NULL
  AND fi.due_date <= CURRENT_DATE + 7;
-- Shows items due within 7 days or overdue


-- ============================================================
-- NOTES ON CONDITIONAL LOGIC JSON SHAPE
-- ============================================================
-- Stored in template_sections.conditional_logic,
--              template_items.conditional_logic,
--              family_sections.conditional_logic,
--              family_items.conditional_logic
--
-- Shape:
-- {
--   "operator": "AND",           -- "AND" or "OR"
--   "rules": [
--     {
--       "trigger_item_variable": "veteran_status",
--       "condition": "equals",
--       "value": "yes"
--     },
--     {
--       "trigger_item_variable": "urn_ordered",
--       "condition": "completed"
--       -- no value needed for "completed" / "not_completed"
--     }
--   ]
-- }
--
-- Conditions:
--   "completed"     — item has any value / is checked
--   "not_completed" — item has no value / is unchecked
--   "equals"        — item value equals .value
--   "not_equals"    — item value does not equal .value
--
-- All logic evaluation happens in the browser (conditional-engine.js)
-- The database stores and retrieves the rules — it does not evaluate them
-- ============================================================

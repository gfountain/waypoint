-- ─── WAYPOINT v2 SCHEMA ───────────────────────────────────────
-- Drop everything in reverse dependency order
drop trigger if exists set_updated_at_families on families;
drop trigger if exists set_updated_at_templates on templates;
drop trigger if exists set_updated_at_family_items on family_items;
drop trigger if exists set_updated_at_family_sub_items on family_sub_items;

drop table if exists activity_log cascade;
drop table if exists dismissed_reminders cascade;
drop table if exists reminders cascade;
drop table if exists family_sub_items cascade;
drop table if exists family_items cascade;
drop table if exists family_sections cascade;
drop table if exists family_groups cascade;
drop table if exists family_phases cascade;
drop table if exists family_contacts cascade;
drop table if exists families cascade;
drop table if exists template_sub_items cascade;
drop table if exists template_items cascade;
drop table if exists template_sections cascade;
drop table if exists template_groups cascade;
drop table if exists template_phases cascade;
drop table if exists templates cascade;

drop function if exists set_updated_at cascade;
drop view if exists family_progress cascade;
drop view if exists due_items cascade;

-- ─── UPDATED_AT TRIGGER ──────────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

-- ─── TEMPLATES ───────────────────────────────────────────────
create table templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create trigger set_updated_at_templates
  before update on templates
  for each row execute function set_updated_at();
alter table templates enable row level security;
create policy "users manage own templates" on templates
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ─── TEMPLATE GROUPS (replaces phases/tabs) ──────────────────
-- A group is a bold collapsible header (PRE-ARRANGEMENT, etc.)
create table template_groups (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references templates(id) on delete cascade,
  title text not null,
  position integer not null default 0,
  created_at timestamptz default now()
);
alter table template_groups enable row level security;
create policy "users manage own template_groups" on template_groups
  using (exists (select 1 from templates t where t.id = template_id and t.user_id = auth.uid()))
  with check (exists (select 1 from templates t where t.id = template_id and t.user_id = auth.uid()));
create index idx_template_groups_template on template_groups(template_id);

-- ─── TEMPLATE SECTIONS ───────────────────────────────────────
-- Sections are optional — tasks can live directly on a group
create table template_sections (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references templates(id) on delete cascade,
  group_id uuid references template_groups(id) on delete cascade,
  title text not null,
  position integer not null default 0,
  surface_on_card boolean default false,
  conditional_logic jsonb,
  created_at timestamptz default now()
);
alter table template_sections enable row level security;
create policy "users manage own template_sections" on template_sections
  using (exists (select 1 from templates t where t.id = template_id and t.user_id = auth.uid()))
  with check (exists (select 1 from templates t where t.id = template_id and t.user_id = auth.uid()));
create index idx_template_sections_template on template_sections(template_id);
create index idx_template_sections_group on template_sections(group_id);

-- ─── TEMPLATE ITEMS ──────────────────────────────────────────
-- Items can belong to a section OR directly to a group (section_id null)
create table template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references templates(id) on delete cascade,
  group_id uuid references template_groups(id) on delete cascade,
  section_id uuid references template_sections(id) on delete cascade,
  label text not null,
  helper_text text,
  variable_name text,
  field_type text not null default 'checkbox',
  -- field_type options: checkbox, yes_no, radio, dropdown, short_text, long_text,
  --                     number, currency, dc_quantity, date, datetime, phone, email
  field_options jsonb,
  -- field_options shape:
  --   radio/dropdown: { "options": ["Option A", "Option B"] }
  --   dc_quantity: null (always long/short pair)
  is_important boolean default false,
  relative_due_days integer,
  position integer not null default 0,
  conditional_logic jsonb,
  created_at timestamptz default now()
);
alter table template_items enable row level security;
create policy "users manage own template_items" on template_items
  using (exists (select 1 from templates t where t.id = template_id and t.user_id = auth.uid()))
  with check (exists (select 1 from templates t where t.id = template_id and t.user_id = auth.uid()));
create index idx_template_items_template on template_items(template_id);
create index idx_template_items_group on template_items(group_id);
create index idx_template_items_section on template_items(section_id);

-- ─── TEMPLATE SUB-ITEMS ──────────────────────────────────────
create table template_sub_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references templates(id) on delete cascade,
  item_id uuid not null references template_items(id) on delete cascade,
  label text not null,
  helper_text text,
  variable_name text,
  field_type text not null default 'checkbox',
  field_options jsonb,
  is_important boolean default false,
  relative_due_days integer,
  position integer not null default 0,
  conditional_logic jsonb,
  created_at timestamptz default now()
);
alter table template_sub_items enable row level security;
create policy "users manage own template_sub_items" on template_sub_items
  using (exists (select 1 from templates t where t.id = template_id and t.user_id = auth.uid()))
  with check (exists (select 1 from templates t where t.id = template_id and t.user_id = auth.uid()));
create index idx_template_sub_items_item on template_sub_items(item_id);

-- ─── FAMILIES ────────────────────────────────────────────────
create table families (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  template_id uuid references templates(id) on delete set null,
  template_name text, -- snapshot of template name at case creation
  decedent_first_name text not null,
  decedent_last_name text not null,
  date_of_birth date,
  date_of_death date,
  arrangement_date date,
  contract_number text,
  is_veteran boolean default false,
  is_veteran_spouse boolean default false,
  status text not null default 'active',
  -- status: active, long_term, completed
  long_term_reason text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create trigger set_updated_at_families
  before update on families
  for each row execute function set_updated_at();
alter table families enable row level security;
create policy "users manage own families" on families
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create index idx_families_user on families(user_id);
create index idx_families_status on families(status);

-- ─── FAMILY CONTACTS ─────────────────────────────────────────
create table family_contacts (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  is_primary boolean default false,
  name text not null,
  relationship text,
  phone text,
  email text,
  role_notes text,
  position integer default 0,
  created_at timestamptz default now()
);
alter table family_contacts enable row level security;
create policy "users manage own family_contacts" on family_contacts
  using (exists (select 1 from families f where f.id = family_id and f.user_id = auth.uid()))
  with check (exists (select 1 from families f where f.id = family_id and f.user_id = auth.uid()));
create index idx_family_contacts_family on family_contacts(family_id);

-- ─── FAMILY GROUPS ───────────────────────────────────────────
create table family_groups (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  template_group_id uuid references template_groups(id) on delete set null,
  title text not null,
  position integer not null default 0,
  created_at timestamptz default now()
);
alter table family_groups enable row level security;
create policy "users manage own family_groups" on family_groups
  using (exists (select 1 from families f where f.id = family_id and f.user_id = auth.uid()))
  with check (exists (select 1 from families f where f.id = family_id and f.user_id = auth.uid()));
create index idx_family_groups_family on family_groups(family_id);

-- ─── FAMILY SECTIONS ─────────────────────────────────────────
create table family_sections (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  group_id uuid references family_groups(id) on delete cascade,
  template_section_id uuid references template_sections(id) on delete set null,
  title text not null,
  position integer not null default 0,
  is_adhoc boolean default false,
  surface_on_card boolean default false,
  conditional_logic jsonb,
  created_at timestamptz default now()
);
alter table family_sections enable row level security;
create policy "users manage own family_sections" on family_sections
  using (exists (select 1 from families f where f.id = family_id and f.user_id = auth.uid()))
  with check (exists (select 1 from families f where f.id = family_id and f.user_id = auth.uid()));
create index idx_family_sections_family on family_sections(family_id);
create index idx_family_sections_group on family_sections(group_id);

-- ─── FAMILY ITEMS ────────────────────────────────────────────
-- Items belong to a section OR directly to a group (section_id null)
create table family_items (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  group_id uuid references family_groups(id) on delete cascade,
  section_id uuid references family_sections(id) on delete cascade,
  template_item_id uuid references template_items(id) on delete set null,
  label text not null,
  helper_text text,
  variable_name text,
  field_type text not null default 'checkbox',
  field_options jsonb,
  field_value jsonb,
  -- field_value shapes:
  --   checkbox:    { "checked": true/false }
  --   yes_no:      { "value": "yes"/"no" }
  --   radio/dropdown: { "value": "Option A" }
  --   short_text/long_text/phone/email: { "value": "..." }
  --   number:      { "value": 42 }
  --   currency:    { "value": 125.00 }
  --   dc_quantity: { "long": 3, "short": 2 }
  --   date:        { "value": "2024-11-15" }
  --   datetime:    { "value": "2024-11-15T10:00" }
  is_important boolean default false,
  due_date date,
  position integer not null default 0,
  is_adhoc boolean default false,
  item_state text not null default 'incomplete',
  -- item_state: incomplete, complete, skipped
  conditional_logic jsonb,
  completed_at timestamptz,
  skipped_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create trigger set_updated_at_family_items
  before update on family_items
  for each row execute function set_updated_at();
alter table family_items enable row level security;
create policy "users manage own family_items" on family_items
  using (exists (select 1 from families f where f.id = family_id and f.user_id = auth.uid()))
  with check (exists (select 1 from families f where f.id = family_id and f.user_id = auth.uid()));
create index idx_family_items_family on family_items(family_id);
create index idx_family_items_group on family_items(group_id);
create index idx_family_items_section on family_items(section_id);
create index idx_family_items_state on family_items(item_state);

-- ─── FAMILY SUB-ITEMS ────────────────────────────────────────
create table family_sub_items (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  item_id uuid not null references family_items(id) on delete cascade,
  template_sub_item_id uuid references template_sub_items(id) on delete set null,
  label text not null,
  helper_text text,
  variable_name text,
  field_type text not null default 'checkbox',
  field_options jsonb,
  field_value jsonb,
  is_important boolean default false,
  due_date date,
  position integer not null default 0,
  is_adhoc boolean default false,
  item_state text not null default 'incomplete',
  conditional_logic jsonb,
  completed_at timestamptz,
  skipped_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create trigger set_updated_at_family_sub_items
  before update on family_sub_items
  for each row execute function set_updated_at();
alter table family_sub_items enable row level security;
create policy "users manage own family_sub_items" on family_sub_items
  using (exists (select 1 from families f where f.id = family_id and f.user_id = auth.uid()))
  with check (exists (select 1 from families f where f.id = family_id and f.user_id = auth.uid()));
create index idx_family_sub_items_item on family_sub_items(item_id);
create index idx_family_sub_items_family on family_sub_items(family_id);

-- ─── REMINDERS ───────────────────────────────────────────────
create table reminders (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  description text not null,
  due_date date not null,
  is_dismissed boolean default false,
  dismissed_at timestamptz,
  created_at timestamptz default now()
);
alter table reminders enable row level security;
create policy "users manage own reminders" on reminders
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create index idx_reminders_family on reminders(family_id);
create index idx_reminders_due on reminders(due_date);

-- ─── DISMISSED REMINDERS (for checklist item due dates) ──────
create table dismissed_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  family_item_id uuid references family_items(id) on delete cascade,
  family_sub_item_id uuid references family_sub_items(id) on delete cascade,
  dismissed_at timestamptz default now(),
  unique(user_id, family_item_id),
  unique(user_id, family_sub_item_id)
);
alter table dismissed_reminders enable row level security;
create policy "users manage own dismissed_reminders" on dismissed_reminders
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ─── ACTIVITY LOG ────────────────────────────────────────────
create table activity_log (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  action_type text not null,
  description text not null,
  metadata jsonb,
  created_at timestamptz default now()
);
alter table activity_log enable row level security;
create policy "users manage own activity_log" on activity_log
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create index idx_activity_log_family on activity_log(family_id);
create index idx_activity_log_created on activity_log(created_at desc);

-- ─── VIEWS ───────────────────────────────────────────────────
create or replace view family_progress as
select
  f.id as family_id,
  count(*) filter (where fi.item_state != 'skipped') as total_items,
  count(*) filter (where fi.item_state = 'complete') as complete_items,
  count(*) filter (where fi.item_state = 'skipped') as skipped_items,
  count(*) filter (where fsi.item_state != 'skipped') as total_sub_items,
  count(*) filter (where fsi.item_state = 'complete') as complete_sub_items
from families f
left join family_items fi on fi.family_id = f.id
left join family_sub_items fsi on fsi.family_id = f.id
group by f.id;

create or replace view due_items as
select
  fi.id,
  fi.family_id,
  fi.label,
  fi.due_date,
  fi.is_important,
  fi.item_state,
  'item' as item_type
from family_items fi
where fi.due_date is not null and fi.item_state = 'incomplete'
union all
select
  fsi.id,
  fsi.family_id,
  fsi.label,
  fsi.due_date,
  fsi.is_important,
  fsi.item_state,
  'sub_item' as item_type
from family_sub_items fsi
where fsi.due_date is not null and fsi.item_state = 'incomplete';

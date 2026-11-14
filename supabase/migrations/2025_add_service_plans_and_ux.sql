create extension if not exists pgcrypto;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'service_plan_level') then
    create type service_plan_level as enum ('starter','business','professional');
  end if;
end $$;

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create table if not exists plan_templates (
  id uuid primary key default gen_random_uuid(),
  level service_plan_level not null unique,
  name text not null,
  tagline text,
  description text,
  is_recommended boolean not null default false,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_plan_templates_sort on plan_templates(sort_order);
create index if not exists idx_plan_templates_active on plan_templates(is_active);

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'set_plan_templates_updated_at_trigger'
  ) then
    create trigger set_plan_templates_updated_at_trigger
    before update on plan_templates
    for each row
    execute function set_updated_at();
  end if;
end $$;

insert into plan_templates (level, name, is_recommended, sort_order, is_active)
values
  ('starter', 'Starter', false, 1, true),
  ('business', 'Business', true, 2, true),
  ('professional', 'Professional', false, 3, true)
on conflict (level) do update
set
  name = excluded.name,
  is_recommended = excluded.is_recommended,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active;

create table if not exists service_plans (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references services(id) on delete cascade,
  level service_plan_level not null,
  template_id uuid references plan_templates(id) on delete set null,
  title text,
  tagline text,
  description text,
  recommended_for text,
  upgrade_hint text,
  human_touch_cta_text text,
  human_touch_cta_url text,
  price numeric,
  price_min numeric,
  price_max numeric,
  price_type price_type not null default 'fixed',
  delivery_days int,
  revisions int,
  confidence_pct int check (confidence_pct >= 0 and confidence_pct <= 100),
  popularity_pct int check (popularity_pct >= 0 and popularity_pct <= 100),
  is_recommended boolean not null default false,
  sort_order int not null default 0,
  is_active boolean not null default true,
  includes jsonb not null default '[]'::jsonb,
  checklist jsonb not null default '[]'::jsonb,
  sample_outputs jsonb not null default '[]'::jsonb,
  boundaries jsonb not null default '{}'::jsonb,
  demo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (service_id, level)
);

create index if not exists idx_service_plans_service on service_plans(service_id);
create index if not exists idx_service_plans_level on service_plans(level);
create index if not exists idx_service_plans_active on service_plans(is_active);
create index if not exists idx_service_plans_recommended on service_plans(is_recommended);

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'set_service_plans_updated_at_trigger'
  ) then
    create trigger set_service_plans_updated_at_trigger
    before update on service_plans
    for each row
    execute function set_updated_at();
  end if;
end $$;

create table if not exists service_plan_progress_steps (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references service_plans(id) on delete cascade,
  step_key text not null,
  label text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (plan_id, step_key)
);

create index if not exists idx_service_plan_progress_steps_plan_sort
  on service_plan_progress_steps(plan_id, sort_order);

create table if not exists service_recommendations (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references services(id) on delete cascade,
  recommended_service_id uuid not null references services(id) on delete cascade,
  sort_order int not null default 0,
  reason text,
  created_at timestamptz not null default now(),
  unique (service_id, recommended_service_id)
);

create index if not exists idx_service_recommendations_service_sort
  on service_recommendations(service_id, sort_order);

create table if not exists category_recommendations (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references categories(id) on delete cascade,
  recommended_category_id uuid not null references categories(id) on delete cascade,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (category_id, recommended_category_id)
);

create index if not exists idx_category_recommendations_category_sort
  on category_recommendations(category_id, sort_order);

alter table plan_templates enable row level security;
alter table service_plans enable row level security;
alter table service_plan_progress_steps enable row level security;
alter table service_recommendations enable row level security;
alter table category_recommendations enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'plan_templates'
      and policyname = 'plan_templates_select_public'
  ) then
    create policy plan_templates_select_public
      on plan_templates
      for select
      using (is_active = true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'service_plans'
      and policyname = 'service_plans_select_public'
  ) then
    create policy service_plans_select_public
      on service_plans
      for select
      using (
        is_active = true
        and exists (
          select 1
          from services s
          where s.id = service_plans.service_id
            and s.is_active = true
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'service_plan_progress_steps'
      and policyname = 'service_plan_progress_steps_select_public'
  ) then
    create policy service_plan_progress_steps_select_public
      on service_plan_progress_steps
      for select
      using (
        exists (
          select 1
          from service_plans p
          join services s on s.id = p.service_id
          where p.id = service_plan_progress_steps.plan_id
            and p.is_active = true
            and s.is_active = true
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'service_recommendations'
      and policyname = 'service_recommendations_select_public'
  ) then
    create policy service_recommendations_select_public
      on service_recommendations
      for select
      using (
        exists (
          select 1
          from services s
          join services r on r.id = service_recommendations.recommended_service_id
          where s.id = service_recommendations.service_id
            and s.is_active = true
            and r.is_active = true
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'category_recommendations'
      and policyname = 'category_recommendations_select_public'
  ) then
    create policy category_recommendations_select_public
      on category_recommendations
      for select
      using (true);
  end if;
end $$;

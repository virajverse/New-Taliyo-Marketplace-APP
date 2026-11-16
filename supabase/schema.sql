-- Supabase schema for Taliyo Marketplace (idempotent)
-- Run in Supabase SQL editor

create extension if not exists pgcrypto;

-- Types
do $$ begin
  if not exists (select 1 from pg_type where typname = 'price_type') then
    create type price_type as enum ('fixed','hourly','negotiable');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'cta_align') then
    create type cta_align as enum ('left','center','right');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'banner_target') then
    create type banner_target as enum ('all','mobile','desktop');
  end if;
end $$;

-- Tables
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  icon text,
  slug text unique,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ begin
  alter table categories alter column icon type text;
exception
  when others then null;
end $$;

create table if not exists services (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references categories(id) on delete set null,
  subcategory_id uuid,
  title text not null,
  description text,
  price_min numeric,
  price_max numeric,
  price_type price_type not null default 'fixed',
  duration_minutes int,
  location text,
  is_remote boolean not null default false,
  images jsonb not null default '[]'::jsonb,
  provider_name text,
  provider_avatar text,
  provider_bio text,
  provider_phone text,
  provider_verified boolean not null default false,
  rating_average numeric not null default 0,
  rating_count int not null default 0,
  is_active boolean not null default true,
  is_featured boolean not null default false,
  slug text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'services' and column_name = 'tags'
  ) then
    alter table services add column tags text;
  end if;
end $$;

create index if not exists idx_services_category on services(category_id);
create index if not exists idx_services_is_active on services(is_active);
create index if not exists idx_services_is_featured on services(is_featured);

create table if not exists banners (
  id uuid primary key default gen_random_uuid(),
  image_url text,
  video_url text,
  cta_text text,
  cta_url text,
  cta_align cta_align default 'center',
  start_at timestamptz,
  end_at timestamptz,
  target banner_target default 'all',
  duration_ms int,
  overlay_opacity numeric,
  alt_text text,
  aria_label text,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table banners
  add column if not exists target banner_target default 'all';

alter table banners
  add column if not exists overlay_opacity numeric;

create index if not exists idx_banners_active on banners(active);
create index if not exists idx_banners_sort on banners(sort_order);

create table if not exists site_settings (
  key text primary key,
  value text
);

create table if not exists profiles (
  id uuid primary key,
  name text,
  phone text,
  avatar_url text,
  phone_verified boolean DEFAULT false,
  created_at timestamptz not null default now()
);

create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  service_id uuid references services(id) on delete set null,
  service_title text,
  service_price text,
  provider_name text,
  full_name text,
  phone text not null,
  email text,
  whatsapp_number text,
  requirements text,
  budget_range text,
  delivery_preference text,
  additional_notes text,
  cart_items text,
  status text not null default 'pending',
  customer_name text,
  customer_phone text,
  customer_email text,
  message text,
  files jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_bookings_created on bookings(created_at desc);

create table if not exists order_clicks (
  id bigserial primary key,
  service_id uuid references services(id) on delete set null,
  click_source text,
  user_agent text,
  created_at timestamptz not null default now()
);

create table if not exists analytics (
  id bigserial primary key,
  service_id uuid references services(id) on delete set null,
  event_type text not null,
  event_data jsonb,
  user_agent text,
  user_ip text,
  created_at timestamptz not null default now()
);

create table if not exists banner_events (
  id bigserial primary key,
  banner_id uuid references banners(id) on delete set null,
  event_type text not null check (event_type in ('impression','click')),
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create table if not exists wishlists (
  id bigserial primary key,
  user_id uuid not null,
  service_id uuid references services(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, service_id)
);

create table if not exists reviews (
  id bigserial primary key,
  booking_id uuid references bookings(id) on delete cascade,
  service_id uuid references services(id) on delete set null,
  customer_name text,
  customer_email text,
  rating numeric,
  review_text text,
  images jsonb not null default '[]'::jsonb,
  is_approved boolean not null default false,
  is_featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reviews' and column_name = 'rating'
  ) then
    alter table reviews add column rating numeric;
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reviews' and column_name = 'review_text'
  ) then
    alter table reviews add column review_text text;
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reviews' and column_name = 'service_id'
  ) then
    alter table reviews add column service_id uuid references services(id) on delete set null;
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reviews' and column_name = 'customer_name'
  ) then
    alter table reviews add column customer_name text;
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reviews' and column_name = 'customer_email'
  ) then
    alter table reviews add column customer_email text;
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bookings' and column_name = 'quoted_price'
  ) then
    alter table bookings add column quoted_price numeric;
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bookings' and column_name = 'final_price'
  ) then
    alter table bookings add column final_price numeric;
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bookings' and column_name = 'updated_at'
  ) then
    alter table bookings add column updated_at timestamptz not null default now();
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bookings' and column_name = 'payment_method'
  ) then
    alter table bookings add column payment_method text;
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bookings' and column_name = 'payment_ref'
  ) then
    alter table bookings add column payment_ref text;
  end if;
end $$;

create table if not exists notifications (
  id bigserial primary key,
  type text,
  title text not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

-- RLS
alter table services enable row level security;
alter table categories enable row level security;
alter table profiles enable row level security;
alter table order_clicks enable row level security;
alter table analytics enable row level security;
alter table banners enable row level security;
alter table bookings enable row level security;
alter table wishlists enable row level security;
alter table reviews enable row level security;
alter table notifications enable row level security;

-- Service plans and related UX tables
do $$ begin
  if not exists (select 1 from pg_type where typname = 'service_plan_level') then
    create type service_plan_level as enum ('starter','business','professional');
  end if;
end $$;

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
  confidence_pct int,
  popularity_pct int,
  is_recommended boolean not null default false,
  sort_order int not null default 0,
  is_active boolean not null default true,
  includes jsonb not null default '[]'::jsonb,
  checklist jsonb not null default '[]'::jsonb,
  sample_outputs jsonb not null default '[]'::jsonb,
  boundaries jsonb not null default '{}'::jsonb,
  demo_url text,
  estimated_delivery_time text,
  auto_upsell_conditions jsonb not null default '[]'::jsonb,
  branding_removable text,
  branding_removal_price numeric,
  seo_tags text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists service_plan_progress_steps (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references service_plans(id) on delete cascade,
  step_key text not null,
  label text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (plan_id, step_key)
);

create table if not exists service_recommendations (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references services(id) on delete cascade,
  recommended_service_id uuid not null references services(id) on delete cascade,
  sort_order int not null default 0,
  reason text,
  created_at timestamptz not null default now(),
  unique (service_id, recommended_service_id)
);

create table if not exists category_recommendations (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references categories(id) on delete cascade,
  recommended_category_id uuid not null references categories(id) on delete cascade,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (category_id, recommended_category_id)
);

-- Policies (idempotent via checks)
-- Public read of services
do $$ begin
  if not exists (select 1 from pg_policies where tablename='services' and policyname='svc_select_public') then
    create policy svc_select_public on services for select using (true);
  end if;
end $$;

-- Public read of categories
do $$ begin
  if not exists (select 1 from pg_policies where tablename='categories' and policyname='cat_select_public') then
    create policy cat_select_public on categories for select using (true);
  end if;
end $$;

-- Public read of banners
do $$ begin
  if not exists (select 1 from pg_policies where tablename='banners' and policyname='banners_select_public') then
    create policy banners_select_public on banners for select using (true);
  end if;
end $$;

-- Public insert analytics events
do $$ begin
  if not exists (select 1 from pg_policies where tablename='analytics' and policyname='analytics_insert_public') then
    create policy analytics_insert_public on analytics for insert with check (true);
  end if;
end $$;

-- Public insert order_clicks
do $$ begin
  if not exists (select 1 from pg_policies where tablename='order_clicks' and policyname='order_clicks_insert_public') then
    create policy order_clicks_insert_public on order_clicks for insert with check (true);
  end if;
end $$;

-- Profiles: users can select/update their own row
do $$ begin
  if not exists (select 1 from pg_policies where tablename='profiles' and policyname='profiles_select_own') then
    create policy profiles_select_own on profiles for select using (id = auth.uid());
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='profiles' and policyname='profiles_upsert_own') then
    create policy profiles_upsert_own on profiles for insert with check (id = auth.uid());
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='profiles' and policyname='profiles_update_own') then
    create policy profiles_update_own on profiles for update using (id = auth.uid());
  end if;
end $$;

-- Bookings: users can read their own rows by email; admins should use service role
do $$ begin
  if not exists (select 1 from pg_policies where tablename='bookings' and policyname='bookings_select_by_email') then
    create policy bookings_select_by_email on bookings for select
      using (
        auth.email() is not null and (
          coalesce(email, '') = auth.email() or coalesce(customer_email, '') = auth.email()
        )
      );
  end if;
end $$;

-- Add user_id to bookings for stronger ownership (idempotent)
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bookings' and column_name = 'user_id'
  ) then
    alter table bookings add column user_id uuid references auth.users(id);
  end if;
end $$;

-- Bookings: users can read their own rows by user_id
do $$ begin
  if not exists (select 1 from pg_policies where tablename='bookings' and policyname='bookings_select_by_user') then
    create policy bookings_select_by_user on bookings for select using (user_id = auth.uid());
  end if;
end $$;

-- Wishlists: strict per-user access
do $$ begin
  if not exists (select 1 from pg_policies where tablename='wishlists' and policyname='wishlists_select_own') then
    create policy wishlists_select_own on wishlists for select using (user_id = auth.uid());
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='wishlists' and policyname='wishlists_insert_own') then
    create policy wishlists_insert_own on wishlists for insert with check (user_id = auth.uid());
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='wishlists' and policyname='wishlists_update_own') then
    create policy wishlists_update_own on wishlists for update using (user_id = auth.uid());
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='wishlists' and policyname='wishlists_delete_own') then
    create policy wishlists_delete_own on wishlists for delete using (user_id = auth.uid());
  end if;
end $$;

-- Reviews: public can read approved reviews, and owners can read their own pending reviews
do $$ begin
  if not exists (select 1 from pg_policies where tablename='reviews' and policyname='reviews_select_public_approved') then
    create policy reviews_select_public_approved on reviews for select using (is_approved = true);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='reviews' and policyname='reviews_select_own') then
    create policy reviews_select_own on reviews for select using (
      (auth.email() is not null and coalesce(customer_email, '') = auth.email())
      or exists (
        select 1 from bookings b
        where b.id = reviews.booking_id
          and (
            b.user_id = auth.uid()
            or (auth.email() is not null and (coalesce(b.email, '') = auth.email() or coalesce(b.customer_email, '') = auth.email()))
          )
      )
    );
  end if;
end $$;

alter table banner_events enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='banner_events' and policyname='banner_events_insert_public') then
    create policy banner_events_insert_public on banner_events for insert with check (true);
  end if;
end $$;

alter table plan_templates enable row level security;
alter table service_plans enable row level security;
alter table service_plan_progress_steps enable row level security;
alter table service_recommendations enable row level security;
alter table category_recommendations enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='plan_templates' and policyname='plan_templates_select_public') then
    create policy plan_templates_select_public on plan_templates for select using (is_active = true);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='service_plans' and policyname='service_plans_select_public') then
    create policy service_plans_select_public on service_plans for select using (
      is_active = true and exists (
        select 1 from services s where s.id = service_plans.service_id and s.is_active = true
      )
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='service_plan_progress_steps' and policyname='service_plan_progress_steps_select_public') then
    create policy service_plan_progress_steps_select_public on service_plan_progress_steps for select using (
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

-- Notifications: add user_id for per-user notifications (idempotent)
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'notifications' and column_name = 'user_id'
  ) then
    alter table notifications add column user_id uuid references auth.users(id);
  end if;
end $$;

-- Replace public policy to only allow rows where user_id is null (global notifications)
do $$ declare
  pol_exists boolean;
begin
  select exists(select 1 from pg_policies where tablename='notifications' and policyname='notifications_select_public') into pol_exists;
  if pol_exists then
    execute 'drop policy notifications_select_public on notifications';
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='notifications' and policyname='notifications_select_public') then
    create policy notifications_select_public on notifications for select using (user_id is null);
  end if;
end $$;
-- Per-user notifications
do $$ begin
  if not exists (select 1 from pg_policies where tablename='notifications' and policyname='notifications_select_own') then
    create policy notifications_select_own on notifications for select using (user_id = auth.uid());
  end if;
end $$;

-- Allow users to update their own notifications (e.g., mark as read)
do $$ begin
  if not exists (select 1 from pg_policies where tablename='notifications' and policyname='notifications_update_own') then
    create policy notifications_update_own on notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;

-- Site settings: enable RLS and allow public read ONLY for non-sensitive public keys
alter table site_settings enable row level security;
do $$ begin
  if exists (select 1 from pg_policies where tablename='site_settings' and policyname='site_settings_select_public') then
    drop policy site_settings_select_public on site_settings;
  end if;
  create policy site_settings_select_public on site_settings
    for select
    using (key not in ('payment_gateway_config', 'verified_utr_pool', 'platform_coupons'));
end $$;

-- PWA tracking tables (idempotent)
create table if not exists pwa_installs (
  id bigserial primary key,
  device_id text not null,
  source text,
  event text not null,
  ua text,
  platform text,
  lang text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  ref text,
  created_at timestamptz not null default now()
);

alter table pwa_installs enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='pwa_installs' and policyname='pwa_installs_insert_public') then
    create policy pwa_installs_insert_public on pwa_installs for insert with check (true);
  end if;
end $$;

create index if not exists idx_pwa_installs_event_created on pwa_installs(event, created_at);
create index if not exists idx_pwa_installs_device on pwa_installs(device_id);

-- Add user mapping columns to pwa_installs (idempotent)
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pwa_installs' and column_name = 'user_id'
  ) then
    alter table pwa_installs add column user_id uuid references auth.users(id);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pwa_installs' and column_name = 'user_email'
  ) then
    alter table pwa_installs add column user_email text;
  end if;
end $$;

create index if not exists idx_pwa_installs_user on pwa_installs(user_id);

create table if not exists pwa_install_events (
  id bigserial primary key,
  device_id text not null,
  type text not null,
  ua text,
  platform text,
  lang text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  ref text,
  created_at timestamptz not null default now()
);

alter table pwa_install_events enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='pwa_install_events' and policyname='pwa_install_events_insert_public') then
    create policy pwa_install_events_insert_public on pwa_install_events for insert with check (true);
  end if;
end $$;

create index if not exists idx_pwa_install_events_type_created on pwa_install_events(type, created_at);
create index if not exists idx_pwa_install_events_device on pwa_install_events(device_id);

-- Add user mapping columns to pwa_install_events (idempotent)
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pwa_install_events' and column_name = 'user_id'
  ) then
    alter table pwa_install_events add column user_id uuid references auth.users(id);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pwa_install_events' and column_name = 'user_email'
  ) then
    alter table pwa_install_events add column user_email text;
  end if;
end $$;

create index if not exists idx_pwa_install_events_user on pwa_install_events(user_id);

-- Helpful indexes
create index if not exists idx_categories_sort on categories(sort_order);
create index if not exists idx_banners_active_sort on banners(active, sort_order);
-- Admin/analytics & 10K DAU scalability indexes
create index if not exists idx_order_clicks_created on order_clicks(created_at desc);
create index if not exists idx_order_clicks_service on order_clicks(service_id);
create index if not exists idx_bookings_status on bookings(status);
create index if not exists idx_bookings_status_created on bookings(status, created_at);
create index if not exists idx_bookings_user_created on bookings(user_id, created_at desc);
create index if not exists idx_bookings_email on bookings(email);
create index if not exists idx_bookings_customer_email on bookings(customer_email);
create index if not exists idx_notifications_user_read_created on notifications(user_id, is_read, created_at desc);
create index if not exists idx_reviews_booking on reviews(booking_id);
create index if not exists idx_reviews_service_approved on reviews(service_id, is_approved, created_at desc);
create index if not exists idx_wishlists_user on wishlists(user_id);
create index if not exists idx_wishlists_service on wishlists(service_id);

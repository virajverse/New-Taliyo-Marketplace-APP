-- 2026 Backend Scalability, Schema Alignment & 10K DAU Indexes (Idempotent)

do $$ begin
  -- 1. Align reviews table columns
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reviews' and column_name = 'service_id'
  ) then
    alter table public.reviews add column service_id uuid references public.services(id) on delete set null;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reviews' and column_name = 'customer_name'
  ) then
    alter table public.reviews add column customer_name text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reviews' and column_name = 'customer_email'
  ) then
    alter table public.reviews add column customer_email text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reviews' and column_name = 'images'
  ) then
    alter table public.reviews add column images jsonb not null default '[]'::jsonb;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reviews' and column_name = 'is_featured'
  ) then
    alter table public.reviews add column is_featured boolean not null default false;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reviews' and column_name = 'updated_at'
  ) then
    alter table public.reviews add column updated_at timestamptz not null default now();
  end if;

  -- 2. Align bookings table columns
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bookings' and column_name = 'user_id'
  ) then
    alter table public.bookings add column user_id uuid references auth.users(id);
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bookings' and column_name = 'quoted_price'
  ) then
    alter table public.bookings add column quoted_price numeric;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bookings' and column_name = 'final_price'
  ) then
    alter table public.bookings add column final_price numeric;
  end if;

  -- 3. Align banner_events table columns
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'banner_events' and column_name = 'ip_address'
  ) then
    alter table public.banner_events add column ip_address text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'banner_events' and column_name = 'user_agent'
  ) then
    alter table public.banner_events add column user_agent text;
  end if;
end $$;

-- 4. Allow users to view their own unapproved/pending reviews on /reviews page
do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'reviews' and policyname = 'reviews_select_own'
  ) then
    create policy reviews_select_own on public.reviews for select using (
      (auth.email() is not null and coalesce(customer_email, '') = auth.email())
      or exists (
        select 1 from public.bookings b
        where b.id = reviews.booking_id
          and (
            b.user_id = auth.uid()
            or (auth.email() is not null and (coalesce(b.email, '') = auth.email() or coalesce(b.customer_email, '') = auth.email()))
          )
      )
    );
  end if;
end $$;

-- 5. Allow public banner_events inserts
alter table if exists public.banner_events enable row level security;
do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'banner_events' and policyname = 'banner_events_insert_public'
  ) then
    create policy banner_events_insert_public on public.banner_events for insert with check (true);
  end if;
end $$;

-- 6. High-concurrency indexes for 10,000+ DAU
create index if not exists idx_bookings_user_created on public.bookings(user_id, created_at desc);
create index if not exists idx_bookings_email on public.bookings(email);
create index if not exists idx_bookings_customer_email on public.bookings(customer_email);
create index if not exists idx_notifications_user_read_created on public.notifications(user_id, is_read, created_at desc);
create index if not exists idx_reviews_booking on public.reviews(booking_id);
create index if not exists idx_reviews_service_approved on public.reviews(service_id, is_approved, created_at desc);
create index if not exists idx_wishlists_user on public.wishlists(user_id);
create index if not exists idx_wishlists_service on public.wishlists(service_id);

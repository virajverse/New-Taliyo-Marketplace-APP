-- Security Hardening Migration (Idempotent)
-- 1. Lock down sensitive keys inside site_settings from direct anon REST reads
alter table if exists public.site_settings enable row level security;

do $$ begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'site_settings' and policyname = 'site_settings_select_public'
  ) then
    drop policy site_settings_select_public on public.site_settings;
  end if;

  create policy site_settings_select_public on public.site_settings
    for select
    using (key not in ('payment_gateway_config', 'verified_utr_pool', 'platform_coupons'));
end $$;

-- 2. Prevent blocked users from directly reading/modifying profiles or wishlists via anon client
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_update_own') then
    drop policy profiles_update_own on public.profiles;
    create policy profiles_update_own on public.profiles
      for update
      using (
        id = auth.uid()
        and coalesce((auth.jwt() -> 'app_metadata' ->> 'blocked')::boolean, false) = false
      );
  end if;
end $$;

do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'wishlists' and policyname = 'wishlists_insert_own') then
    drop policy wishlists_insert_own on public.wishlists;
    create policy wishlists_insert_own on public.wishlists
      for insert
      with check (
        user_id = auth.uid()
        and coalesce((auth.jwt() -> 'app_metadata' ->> 'blocked')::boolean, false) = false
      );
  end if;
end $$;

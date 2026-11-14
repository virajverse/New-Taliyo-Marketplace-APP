-- Extend service_plans with advanced plan-level configuration fields
-- This migration is idempotent and only adds columns if they do not already exist.

do $$
begin
  -- 1) Estimated delivery time (text)
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'service_plans'
      and column_name = 'estimated_delivery_time'
  ) then
    alter table service_plans
      add column estimated_delivery_time text;
  end if;

  -- 2) Auto upsell conditions (jsonb array)
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'service_plans'
      and column_name = 'auto_upsell_conditions'
  ) then
    alter table service_plans
      add column auto_upsell_conditions jsonb not null default '[]'::jsonb;
  end if;

  -- 3) Branding removable flag (text enum-ish) and optional removal price
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'service_plans'
      and column_name = 'branding_removable'
  ) then
    alter table service_plans
      add column branding_removable text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'service_plans'
      and column_name = 'branding_removal_price'
  ) then
    alter table service_plans
      add column branding_removal_price numeric;
  end if;

  -- 4) SEO tags (internal use only)
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'service_plans'
      and column_name = 'seo_tags'
  ) then
    alter table service_plans
      add column seo_tags text;
  end if;
end $$;

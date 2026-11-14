do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'bookings'
      and column_name = 'updated_at'
  ) then
    alter table bookings
      add column updated_at timestamptz not null default now();
  end if;
end $$;

create or replace function set_bookings_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'set_bookings_updated_at_trigger'
  ) then
    create trigger set_bookings_updated_at_trigger
    before update on bookings
    for each row
    execute function set_bookings_updated_at();
  end if;
end $$;

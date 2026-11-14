create extension if not exists pgcrypto;

create table if not exists ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  device_id text,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz
);

create index if not exists idx_ai_conversations_user_last_message
  on ai_conversations(user_id, last_message_at desc);

create index if not exists idx_ai_conversations_device_last_message
  on ai_conversations(device_id, last_message_at desc);

create table if not exists ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references ai_conversations(id) on delete cascade,
  sender_type text not null check (sender_type in ('user','ai','system')),
  content text not null,
  tool_calls jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_messages_conversation_created
  on ai_messages(conversation_id, created_at);

create or replace function set_ai_conversations_updated_at()
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
    where tgname = 'set_ai_conversations_updated_at_trigger'
  ) then
    create trigger set_ai_conversations_updated_at_trigger
    before update on ai_conversations
    for each row
    execute function set_ai_conversations_updated_at();
  end if;
end $$;

create or replace function ai_messages_update_conversation_last_message()
returns trigger as $$
begin
  update ai_conversations
    set last_message_at = new.created_at,
        updated_at = now()
  where id = new.conversation_id;

  return new;
end;
$$ language plpgsql;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'ai_messages_update_conversation_last_message_trigger'
  ) then
    create trigger ai_messages_update_conversation_last_message_trigger
    after insert on ai_messages
    for each row
    execute function ai_messages_update_conversation_last_message();
  end if;
end $$;

alter table ai_conversations enable row level security;
alter table ai_messages enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'ai_conversations'
      and policyname = 'ai_conversations_select_own'
  ) then
    create policy ai_conversations_select_own
      on ai_conversations
      for select
      using (user_id = auth.uid());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'ai_conversations'
      and policyname = 'ai_conversations_insert_own'
  ) then
    create policy ai_conversations_insert_own
      on ai_conversations
      for insert
      with check (user_id = auth.uid());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'ai_conversations'
      and policyname = 'ai_conversations_update_own'
  ) then
    create policy ai_conversations_update_own
      on ai_conversations
      for update
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'ai_messages'
      and policyname = 'ai_messages_select_own'
  ) then
    create policy ai_messages_select_own
      on ai_messages
      for select
      using (
        exists (
          select 1
          from ai_conversations c
          where c.id = ai_messages.conversation_id
            and c.user_id = auth.uid()
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'ai_messages'
      and policyname = 'ai_messages_insert_user'
  ) then
    create policy ai_messages_insert_user
      on ai_messages
      for insert
      with check (
        sender_type = 'user'
        and exists (
          select 1
          from ai_conversations c
          where c.id = conversation_id
            and c.user_id = auth.uid()
        )
      );
  end if;
end $$;

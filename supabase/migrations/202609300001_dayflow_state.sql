create table if not exists public.dayflow_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  payload jsonb not null default '{"tasks": [], "habits": []}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.dayflow_state enable row level security;

create policy "Users can read their DayFlow state"
  on public.dayflow_state for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their DayFlow state"
  on public.dayflow_state for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their DayFlow state"
  on public.dayflow_state for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
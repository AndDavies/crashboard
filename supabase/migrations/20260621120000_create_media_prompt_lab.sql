create table if not exists public.media_prompt_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workflow_id text not null check (btrim(workflow_id) <> ''),
  workflow_title text not null default '',
  workflow_task text not null default '',
  positive_prompt text not null default '',
  negative_prompt text not null default '',
  prompt_sections jsonb not null default '[]'::jsonb,
  parameter_overrides jsonb not null default '{}'::jsonb,
  selected_presets jsonb not null default '{}'::jsonb,
  rating smallint check (rating is null or rating between 1 and 5),
  keeper boolean not null default false,
  notes text not null default '',
  failure_modes text[] not null default '{}',
  output_label text not null default '',
  output_path text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists media_prompt_runs_user_workflow_created_idx
  on public.media_prompt_runs (user_id, workflow_id, created_at desc);

create index if not exists media_prompt_runs_user_keeper_idx
  on public.media_prompt_runs (user_id, workflow_id, keeper)
  where keeper = true;

create table if not exists public.media_prompt_presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workflow_id text not null check (btrim(workflow_id) <> ''),
  workflow_title text not null default '',
  name text not null check (btrim(name) <> ''),
  brief jsonb not null default '{}'::jsonb,
  parameter_overrides jsonb not null default '{}'::jsonb,
  notes text not null default '',
  source_run_id uuid references public.media_prompt_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists media_prompt_presets_user_workflow_name_key
  on public.media_prompt_presets (user_id, workflow_id, lower(name));

create index if not exists media_prompt_presets_user_workflow_created_idx
  on public.media_prompt_presets (user_id, workflow_id, created_at desc);

create or replace function public.set_media_prompt_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_media_prompt_runs_updated_at on public.media_prompt_runs;
create trigger set_media_prompt_runs_updated_at
before update on public.media_prompt_runs
for each row execute function public.set_media_prompt_updated_at();

drop trigger if exists set_media_prompt_presets_updated_at on public.media_prompt_presets;
create trigger set_media_prompt_presets_updated_at
before update on public.media_prompt_presets
for each row execute function public.set_media_prompt_updated_at();

alter table public.media_prompt_runs enable row level security;
alter table public.media_prompt_presets enable row level security;

grant select, insert, update, delete on public.media_prompt_runs to authenticated;
grant select, insert, update, delete on public.media_prompt_presets to authenticated;
grant all on public.media_prompt_runs to service_role;
grant all on public.media_prompt_presets to service_role;

drop policy if exists "Users can view their media prompt runs" on public.media_prompt_runs;
create policy "Users can view their media prompt runs"
on public.media_prompt_runs
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their media prompt runs" on public.media_prompt_runs;
create policy "Users can insert their media prompt runs"
on public.media_prompt_runs
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their media prompt runs" on public.media_prompt_runs;
create policy "Users can update their media prompt runs"
on public.media_prompt_runs
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their media prompt runs" on public.media_prompt_runs;
create policy "Users can delete their media prompt runs"
on public.media_prompt_runs
for delete
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can view their media prompt presets" on public.media_prompt_presets;
create policy "Users can view their media prompt presets"
on public.media_prompt_presets
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their media prompt presets" on public.media_prompt_presets;
create policy "Users can insert their media prompt presets"
on public.media_prompt_presets
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their media prompt presets" on public.media_prompt_presets;
create policy "Users can update their media prompt presets"
on public.media_prompt_presets
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their media prompt presets" on public.media_prompt_presets;
create policy "Users can delete their media prompt presets"
on public.media_prompt_presets
for delete
to authenticated
using ((select auth.uid()) = user_id);

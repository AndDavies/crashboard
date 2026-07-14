-- Reversible, generation-safe analytical event deduplication. Source event
-- rows and their ingestion clusters remain immutable. A run stages a complete
-- generation, then one lease-validated transaction activates it.

create unique index if not exists intelligence_clusters_owner_id_uidx
  on public.intelligence_clusters (owner_id, id);
create unique index if not exists intelligence_events_owner_id_uidx
  on public.intelligence_events (owner_id, id);

create table if not exists public.intelligence_event_dedup_generations (
  generation_id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  match_version text not null check (btrim(match_version) <> ''),
  holder_run_id uuid not null,
  complete_through date not null,
  expected_cluster_count integer not null check (expected_cluster_count >= 0),
  expected_membership_count integer not null check (expected_membership_count >= 0),
  status text not null default 'staging'
    check (status in ('staging', 'active', 'retired')),
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  retired_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (owner_id, match_version, generation_id),
  check (
    (status = 'staging' and activated_at is null and retired_at is null)
    or (status = 'active' and activated_at is not null and retired_at is null)
    or (status = 'retired' and activated_at is not null and retired_at is not null)
  )
);

create unique index if not exists intelligence_event_dedup_generations_active_uidx
  on public.intelligence_event_dedup_generations (owner_id, match_version)
  where status = 'active';
create index if not exists intelligence_event_dedup_generations_owner_created_idx
  on public.intelligence_event_dedup_generations (
    owner_id, match_version, created_at desc
  );

create table if not exists public.intelligence_event_cluster_memberships (
  owner_id uuid not null references auth.users(id) on delete cascade,
  generation_id uuid not null,
  match_version text not null check (btrim(match_version) <> ''),
  cluster_id uuid not null,
  event_id uuid not null,
  relationship text not null check (relationship in ('canonical', 'member')),
  match_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, generation_id, event_id),
  foreign key (owner_id, match_version, generation_id)
    references public.intelligence_event_dedup_generations (
      owner_id, match_version, generation_id
    ) on delete cascade,
  foreign key (owner_id, cluster_id)
    references public.intelligence_clusters (owner_id, id) on delete cascade,
  foreign key (owner_id, event_id)
    references public.intelligence_events (owner_id, id) on delete cascade
);

create index if not exists intelligence_event_cluster_memberships_generation_cluster_idx
  on public.intelligence_event_cluster_memberships (
    owner_id, match_version, generation_id, cluster_id
  );
create index if not exists intelligence_event_cluster_memberships_owner_event_idx
  on public.intelligence_event_cluster_memberships (owner_id, event_id);
create unique index if not exists intelligence_event_cluster_memberships_canonical_uidx
  on public.intelligence_event_cluster_memberships (
    owner_id, generation_id, cluster_id
  )
  where relationship = 'canonical';

alter table public.intelligence_event_dedup_generations enable row level security;
alter table public.intelligence_event_cluster_memberships enable row level security;

revoke all on table public.intelligence_event_dedup_generations
  from public, anon, authenticated;
revoke all on table public.intelligence_event_cluster_memberships
  from public, anon, authenticated;
grant select on table public.intelligence_event_dedup_generations to authenticated;
grant select on table public.intelligence_event_cluster_memberships to authenticated;
grant all on table public.intelligence_event_dedup_generations to service_role;
grant all on table public.intelligence_event_cluster_memberships to service_role;

create policy "Owners can read intelligence_event_dedup_generations"
  on public.intelligence_event_dedup_generations
  for select to authenticated
  using ((select auth.uid()) = owner_id);
create policy "Owners can read intelligence_event_cluster_memberships"
  on public.intelligence_event_cluster_memberships
  for select to authenticated
  using ((select auth.uid()) = owner_id);

create or replace function public.activate_intelligence_event_dedup_generation(
  query_owner uuid,
  query_match_version text,
  query_generation_id uuid,
  query_lease_token uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_lease public.intelligence_signal_refresh_leases%rowtype;
  target_generation public.intelligence_event_dedup_generations%rowtype;
  actual_cluster_count bigint := 0;
  actual_membership_count bigint := 0;
  previous_generation_id uuid;
  switched_at timestamptz := pg_catalog.clock_timestamp();
begin
  select lease.* into current_lease
  from public.intelligence_signal_refresh_leases lease
  where lease.owner_id = query_owner
  for update;
  if not found
     or current_lease.lease_token is distinct from query_lease_token
     or current_lease.expires_at <= switched_at then
    raise exception 'The event dedup activation lease is missing, expired, or not owned by this run.';
  end if;

  select generation.* into target_generation
  from public.intelligence_event_dedup_generations generation
  where generation.owner_id = query_owner
    and generation.match_version = query_match_version
    and generation.generation_id = query_generation_id
  for update;
  if not found then
    raise exception 'The staged event dedup generation does not exist.';
  end if;
  if target_generation.holder_run_id is distinct from current_lease.holder_run_id then
    raise exception 'The staged event dedup generation belongs to another lease holder.';
  end if;
  if target_generation.status = 'active' then
    return pg_catalog.jsonb_build_object(
      'activated', true,
      'already_active', true,
      'generation_id', query_generation_id,
      'membership_count', target_generation.expected_membership_count
    );
  end if;
  if target_generation.status <> 'staging' then
    raise exception 'Only a staging event dedup generation can be activated.';
  end if;

  select pg_catalog.count(*), pg_catalog.count(distinct membership.cluster_id)
  into actual_membership_count, actual_cluster_count
  from public.intelligence_event_cluster_memberships membership
  where membership.owner_id = query_owner
    and membership.match_version = query_match_version
    and membership.generation_id = query_generation_id;
  if actual_membership_count <> target_generation.expected_membership_count
     or actual_cluster_count <> target_generation.expected_cluster_count then
    raise exception
      'Incomplete event dedup generation: expected % clusters/% memberships, found %/%.',
      target_generation.expected_cluster_count,
      target_generation.expected_membership_count,
      actual_cluster_count,
      actual_membership_count;
  end if;
  if exists (
    select 1
    from public.intelligence_event_cluster_memberships membership
    where membership.owner_id = query_owner
      and membership.match_version = query_match_version
      and membership.generation_id = query_generation_id
    group by membership.cluster_id
    having pg_catalog.count(*) < 2
      or pg_catalog.count(*) filter (
        where membership.relationship = 'canonical'
      ) <> 1
  ) then
    raise exception 'The staged event dedup generation contains an incomplete cluster.';
  end if;
  if exists (
    select 1
    from public.intelligence_event_cluster_memberships membership
    join public.intelligence_clusters cluster_row
      on cluster_row.owner_id = membership.owner_id
     and cluster_row.id = membership.cluster_id
    join public.intelligence_events event_row
      on event_row.owner_id = membership.owner_id
     and event_row.id = membership.event_id
    where membership.owner_id = query_owner
      and membership.match_version = query_match_version
      and membership.generation_id = query_generation_id
      and (
        cluster_row.cluster_type <> 'event'
        or cluster_row.metadata ->> 'dedupe_version'
          is distinct from query_match_version
      )
  ) then
    raise exception 'The staged event dedup generation contains an invalid reference.';
  end if;

  select generation.generation_id into previous_generation_id
  from public.intelligence_event_dedup_generations generation
  where generation.owner_id = query_owner
    and generation.match_version = query_match_version
    and generation.status = 'active'
  for update;

  update public.intelligence_event_dedup_generations
  set status = 'retired', retired_at = switched_at, updated_at = switched_at
  where owner_id = query_owner
    and match_version = query_match_version
    and status = 'active'
    and generation_id <> query_generation_id;
  update public.intelligence_event_dedup_generations
  set
    status = 'active',
    activated_at = switched_at,
    retired_at = null,
    updated_at = switched_at
  where owner_id = query_owner
    and match_version = query_match_version
    and generation_id = query_generation_id
    and status = 'staging';
  if not found then
    raise exception 'The staged event dedup generation could not be promoted.';
  end if;

  return pg_catalog.jsonb_build_object(
    'activated', true,
    'already_active', false,
    'generation_id', query_generation_id,
    'previous_generation_id', previous_generation_id,
    'match_version', query_match_version,
    'cluster_count', actual_cluster_count,
    'membership_count', actual_membership_count,
    'activated_at', switched_at
  );
end;
$$;

revoke all on function public.activate_intelligence_event_dedup_generation(
  uuid, text, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.activate_intelligence_event_dedup_generation(
  uuid, text, uuid, uuid
) to service_role;

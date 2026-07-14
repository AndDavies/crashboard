-- Serialize canonical signal refresh writers across scheduled and local runs.
-- The lease is ordinary application state; it requires no Supabase plan or
-- compute change and expires automatically if a worker disappears.

create table if not exists public.intelligence_signal_refresh_leases (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  lease_token uuid not null,
  holder_run_id uuid not null,
  holder_kind text not null check (holder_kind in ('scheduled', 'local_validation')),
  heartbeat_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists intelligence_signal_refresh_leases_expiry_idx
  on public.intelligence_signal_refresh_leases (expires_at);

alter table public.intelligence_signal_refresh_leases enable row level security;
revoke all on table public.intelligence_signal_refresh_leases
  from public, anon, authenticated;
grant all on table public.intelligence_signal_refresh_leases to service_role;

create or replace function public.claim_intelligence_signal_refresh_lease(
  query_owner uuid,
  query_lease_token uuid,
  query_holder_run_id uuid,
  query_holder_kind text,
  query_ttl_seconds integer default 900
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  claimed public.intelligence_signal_refresh_leases%rowtype;
  current_lease public.intelligence_signal_refresh_leases%rowtype;
  bounded_ttl integer := least(1800, greatest(300, query_ttl_seconds));
begin
  if query_holder_kind not in ('scheduled', 'local_validation') then
    raise exception 'Invalid signal refresh lease holder kind.';
  end if;

  insert into public.intelligence_signal_refresh_leases as active_lease (
    owner_id,
    lease_token,
    holder_run_id,
    holder_kind,
    heartbeat_at,
    expires_at,
    updated_at
  ) values (
    query_owner,
    query_lease_token,
    query_holder_run_id,
    query_holder_kind,
    pg_catalog.now(),
    pg_catalog.now() + pg_catalog.make_interval(secs => bounded_ttl),
    pg_catalog.now()
  )
  on conflict (owner_id) do update
  set
    lease_token = excluded.lease_token,
    holder_run_id = excluded.holder_run_id,
    holder_kind = excluded.holder_kind,
    heartbeat_at = excluded.heartbeat_at,
    expires_at = excluded.expires_at,
    updated_at = excluded.updated_at
  where active_lease.expires_at <= pg_catalog.now()
     or active_lease.lease_token = excluded.lease_token
  returning * into claimed;

  if claimed.owner_id is not null then
    return pg_catalog.jsonb_build_object(
      'claimed', true,
      'holder_run_id', claimed.holder_run_id,
      'holder_kind', claimed.holder_kind,
      'expires_at', claimed.expires_at
    );
  end if;

  select * into current_lease
  from public.intelligence_signal_refresh_leases
  where owner_id = query_owner;
  return pg_catalog.jsonb_build_object(
    'claimed', false,
    'holder_run_id', current_lease.holder_run_id,
    'holder_kind', current_lease.holder_kind,
    'expires_at', current_lease.expires_at
  );
end;
$$;

create or replace function public.release_intelligence_signal_refresh_lease(
  query_owner uuid,
  query_lease_token uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  released_count integer := 0;
begin
  delete from public.intelligence_signal_refresh_leases
  where owner_id = query_owner and lease_token = query_lease_token;
  get diagnostics released_count = row_count;
  return released_count = 1;
end;
$$;

revoke all on function public.claim_intelligence_signal_refresh_lease(
  uuid, uuid, uuid, text, integer
) from public, anon, authenticated;
grant execute on function public.claim_intelligence_signal_refresh_lease(
  uuid, uuid, uuid, text, integer
) to service_role;

revoke all on function public.release_intelligence_signal_refresh_lease(
  uuid, uuid
) from public, anon, authenticated;
grant execute on function public.release_intelligence_signal_refresh_lease(
  uuid, uuid
) to service_role;

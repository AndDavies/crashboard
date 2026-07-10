-- Keep this version aligned with the migration recorded in production.
alter table public.intelligence_runs
  add column if not exists heartbeat_at timestamptz;

alter table public.intelligence_document_entities
  add column if not exists source text not null default 'model';

alter table public.intelligence_document_entities
  drop constraint if exists intelligence_document_entities_source_check;

alter table public.intelligence_document_entities
  add constraint intelligence_document_entities_source_check
  check (source in ('model', 'rule', 'manual'));

alter table public.intelligence_event_entities
  add column if not exists source text not null default 'model';

alter table public.intelligence_event_entities
  drop constraint if exists intelligence_event_entities_source_check;

alter table public.intelligence_event_entities
  add constraint intelligence_event_entities_source_check
  check (source in ('model', 'rule', 'manual'));

update public.intelligence_runs
set
  status = 'failed',
  failed_count = case
    when processed_count + failed_count + excluded_count = 0 then 1
    else failed_count
  end,
  error_summary = coalesce(
    error_summary,
    'Run abandoned after exceeding the production runtime limit.'
  ),
  heartbeat_at = coalesce(heartbeat_at, started_at, created_at),
  completed_at = coalesce(completed_at, now())
where status = 'running'
  and coalesce(heartbeat_at, started_at, created_at) < now() - interval '6 minutes';

create unique index if not exists intelligence_runs_one_running_per_source_idx
  on public.intelligence_runs (source_id)
  where source_id is not null and status = 'running';

create index if not exists intelligence_runs_running_heartbeat_idx
  on public.intelligence_runs (heartbeat_at)
  where status = 'running';

create unique index if not exists intelligence_events_cluster_type_uidx
  on public.intelligence_events (cluster_id, event_type);

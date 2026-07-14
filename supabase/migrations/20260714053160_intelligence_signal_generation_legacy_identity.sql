-- Prepare existing signal rows for immutable generation foreign keys. This is
-- isolated from the registry seed so the brief ACCESS EXCLUSIVE lock used by
-- SET NOT NULL is not held while the archive is aggregated.

update public.intelligence_signal_daily daily
set
  refresh_id = total.refresh_id,
  generation_started_at = coalesce(
    daily.generation_started_at,
    total.generation_started_at
  )
from public.intelligence_signal_daily_totals total
where daily.owner_id = total.owner_id
  and daily.metric_version = total.metric_version
  and daily.signal_date = total.signal_date
  and (
    daily.refresh_id is null
    or daily.generation_started_at is null
  );

update public.intelligence_signal_daily daily
set refresh_id = (
  pg_catalog.substr(
    pg_catalog.md5(
      daily.owner_id::text || ':' || daily.metric_version ||
      ':legacy-signal-generation'
    ),
    1,
    8
  ) || '-' ||
  pg_catalog.substr(
    pg_catalog.md5(
      daily.owner_id::text || ':' || daily.metric_version ||
      ':legacy-signal-generation'
    ),
    9,
    4
  ) || '-' ||
  pg_catalog.substr(
    pg_catalog.md5(
      daily.owner_id::text || ':' || daily.metric_version ||
      ':legacy-signal-generation'
    ),
    13,
    4
  ) || '-' ||
  pg_catalog.substr(
    pg_catalog.md5(
      daily.owner_id::text || ':' || daily.metric_version ||
      ':legacy-signal-generation'
    ),
    17,
    4
  ) || '-' ||
  pg_catalog.substr(
    pg_catalog.md5(
      daily.owner_id::text || ':' || daily.metric_version ||
      ':legacy-signal-generation'
    ),
    21,
    12
  )
)::uuid
where daily.refresh_id is null;

update public.intelligence_signal_daily daily
set generation_started_at = coalesce(daily.computed_at, pg_catalog.now())
where daily.generation_started_at is null;

alter table public.intelligence_signal_daily
  alter column refresh_id set not null,
  alter column generation_started_at set not null;

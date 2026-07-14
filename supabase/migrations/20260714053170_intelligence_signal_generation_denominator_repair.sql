-- Repair legacy dates whose zero-coverage signal rows were written without a
-- matching denominator. Find the small missing-date set with narrow keys, then
-- inspect only those dates instead of grouping the complete signal archive.

create temporary table intelligence_signal_missing_totals_repair
on commit drop
as
with missing_dates as materialized (
  select distinct
    daily.owner_id,
    daily.metric_version,
    daily.signal_date
  from public.intelligence_signal_daily daily
  where not exists (
    select 1
    from public.intelligence_signal_daily_totals total
    where total.owner_id = daily.owner_id
      and total.metric_version = daily.metric_version
      and total.signal_date = daily.signal_date
  )
)
select
  daily.owner_id,
  daily.metric_version,
  daily.signal_date,
  min(daily.eligible_items)::integer as eligible_items,
  max(daily.eligible_items)::integer as max_eligible_items,
  min(daily.eligible_tokens)::bigint as eligible_tokens,
  max(daily.eligible_tokens)::bigint as max_eligible_tokens,
  min(daily.refresh_id::text)::uuid as refresh_id,
  count(distinct daily.refresh_id)::integer as refresh_count,
  min(daily.generation_started_at) as generation_started_at,
  max(daily.generation_started_at) as max_generation_started_at,
  min(daily.computed_at) as computed_at
from missing_dates missing
join public.intelligence_signal_daily daily
  on daily.owner_id = missing.owner_id
 and daily.metric_version = missing.metric_version
 and daily.signal_date = missing.signal_date
group by daily.owner_id, daily.metric_version, daily.signal_date;

do $$
begin
  if exists (
    select 1
    from intelligence_signal_missing_totals_repair repair
    where repair.refresh_count <> 1
      or repair.eligible_items <> repair.max_eligible_items
      or repair.eligible_tokens <> repair.max_eligible_tokens
      or repair.generation_started_at <>
        repair.max_generation_started_at
  ) then
    raise exception 'Legacy signal rows have an ambiguous missing daily denominator.';
  end if;
end
$$;

insert into public.intelligence_signal_daily_totals (
  owner_id,
  metric_version,
  signal_date,
  eligible_items,
  eligible_tokens,
  refresh_id,
  generation_started_at,
  computed_at
)
select
  repair.owner_id,
  repair.metric_version,
  repair.signal_date,
  repair.eligible_items,
  repair.eligible_tokens,
  repair.refresh_id,
  repair.generation_started_at,
  repair.computed_at
from intelligence_signal_missing_totals_repair repair
on conflict (owner_id, metric_version, signal_date) do nothing;

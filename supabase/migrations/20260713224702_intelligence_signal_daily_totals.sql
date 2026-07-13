create or replace function public.get_intelligence_signal_daily_totals(
  query_owner uuid,
  query_metric_version text,
  query_start date,
  query_end date
)
returns table (
  signal_date date,
  eligible_items integer,
  eligible_tokens bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    daily.signal_date,
    max(daily.eligible_items)::integer as eligible_items,
    max(daily.eligible_tokens)::bigint as eligible_tokens
  from public.intelligence_signal_daily as daily
  where daily.owner_id = query_owner
    and daily.metric_version = query_metric_version
    and daily.signal_date between query_start and query_end
  group by daily.signal_date
  order by daily.signal_date;
$$;

revoke all on function public.get_intelligence_signal_daily_totals(uuid, text, date, date)
  from public, anon, authenticated;
grant execute on function public.get_intelligence_signal_daily_totals(uuid, text, date, date)
  to service_role;

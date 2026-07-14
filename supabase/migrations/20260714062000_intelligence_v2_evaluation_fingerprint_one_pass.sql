-- Preserve the exact signal-fingerprint-v2.0.0 contract while removing the
-- 193k-row materialized CTE and its three subsequent scans. Every component is
-- composable, so one aggregate over the immutable refresh produces the same
-- multiset fingerprint, complete-day count, and ordered topic-label digest.
create or replace function public.intelligence_v2_evaluation_signal_fingerprint(
  query_owner uuid,
  query_start date,
  query_complete_through date,
  query_metric_version text,
  query_refresh_id uuid
)
returns jsonb
language sql
stable
parallel safe
security invoker
set search_path = ''
set statement_timeout = '60s'
as $$
with aggregate_values as (
  select
    pg_catalog.count(*) as signal_row_count,
    coalesce(pg_catalog.sum(pg_catalog.hashtextextended(
      pg_catalog.concat_ws(
        E'\x1f',
        daily.signal_key,
        daily.signal_date::text,
        daily.signal_label,
        daily.direction,
        daily.raw_reach::text,
        daily.hidden_rank_score::text
      ),
      0
    )::numeric), 0) as hash_sum,
    coalesce(pg_catalog.bit_xor(pg_catalog.hashtextextended(
      pg_catalog.concat_ws(
        E'\x1f',
        daily.signal_key,
        daily.signal_date::text,
        daily.signal_label,
        daily.direction,
        daily.raw_reach::text,
        daily.hidden_rank_score::text
      ),
      1
    )), 0) as hash_xor,
    coalesce(
      pg_catalog.min(pg_catalog.hashtextextended(daily.signal_key, 2)),
      0
    ) as min_key_hash,
    coalesce(
      pg_catalog.max(pg_catalog.hashtextextended(daily.signal_key, 3)),
      0
    ) as max_key_hash,
    pg_catalog.count(*) filter (
      where daily.signal_date = query_complete_through
    ) as complete_day_signal_count,
    pg_catalog.count(*) filter (
      where daily.signal_date = query_complete_through
        and daily.signal_kind = 'topic'
    ) as topic_label_count,
    pg_catalog.md5(coalesce(
      pg_catalog.string_agg(
        pg_catalog.md5(pg_catalog.jsonb_build_array(
          daily.signal_key,
          daily.signal_label
        )::text),
        '' order by daily.signal_key
      ) filter (
        where daily.signal_date = query_complete_through
          and daily.signal_kind = 'topic'
      ),
      ''
    )) as topic_label_fingerprint
  from public.intelligence_signal_daily daily
  where daily.owner_id = query_owner
    and daily.refresh_id = query_refresh_id
    and daily.metric_version = query_metric_version
    and daily.signal_date between query_start and query_complete_through
)
select pg_catalog.jsonb_build_object(
  'fingerprintVersion', 'signal-fingerprint-v2.0.0',
  'signalRowCount', aggregate_values.signal_row_count,
  'signalSnapshotFingerprint', pg_catalog.md5(pg_catalog.concat_ws(
    E'\x1f',
    aggregate_values.signal_row_count::text,
    aggregate_values.hash_sum::text,
    aggregate_values.hash_xor::text,
    aggregate_values.min_key_hash::text,
    aggregate_values.max_key_hash::text
  )),
  'completeDaySignalCount', aggregate_values.complete_day_signal_count,
  'topicLabelCount', aggregate_values.topic_label_count,
  'topicLabelFingerprint', aggregate_values.topic_label_fingerprint
)
from aggregate_values;
$$;

revoke all on function public.intelligence_v2_evaluation_signal_fingerprint(
  uuid, date, date, text, uuid
) from public, anon, authenticated;
grant execute on function public.intelligence_v2_evaluation_signal_fingerprint(
  uuid, date, date, text, uuid
) to service_role;

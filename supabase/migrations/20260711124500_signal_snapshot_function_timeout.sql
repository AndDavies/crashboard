alter function public.replace_intelligence_signal_snapshots(
  uuid,
  text,
  text,
  date,
  date,
  timestamptz,
  jsonb
) set statement_timeout = '90s';

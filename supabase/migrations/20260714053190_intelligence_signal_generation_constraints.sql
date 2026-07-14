-- Add generation-scoped uniqueness and foreign keys in a bounded transaction.
-- Index construction and runtime functions follow separately so these table
-- locks are not held during unrelated rollout work.
-- The refresh identity is now part of every physical uniqueness boundary.
-- Old and new generations can coexist without an upsert mutating the active
-- series before completion.
do $$
declare
  old_constraint name;
begin
  if exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid =
        'public.intelligence_signal_daily'::pg_catalog.regclass
      and constraint_row.conname = 'intelligence_signal_daily_generation_key'
  ) then
    return;
  end if;

  select constraint_row.conname
  into old_constraint
  from pg_catalog.pg_constraint constraint_row
  where constraint_row.conrelid =
      'public.intelligence_signal_daily'::pg_catalog.regclass
    and constraint_row.contype = 'u'
    and pg_catalog.pg_get_constraintdef(constraint_row.oid) =
      'UNIQUE (owner_id, signal_key, signal_date, metric_version)'
  limit 1;

  if old_constraint is not null then
    execute pg_catalog.format(
      'alter table public.intelligence_signal_daily drop constraint %I',
      old_constraint
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid =
        'public.intelligence_signal_daily'::pg_catalog.regclass
      and constraint_row.conname = 'intelligence_signal_daily_generation_key'
  ) then
    alter table public.intelligence_signal_daily
      add constraint intelligence_signal_daily_generation_key
      unique (owner_id, refresh_id, signal_key, signal_date, metric_version);
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid =
        'public.intelligence_signal_daily_totals'::pg_catalog.regclass
      and constraint_row.conname = 'intelligence_signal_daily_totals_pkey'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) =
        'PRIMARY KEY (owner_id, refresh_id, metric_version, signal_date)'
  ) then
    alter table public.intelligence_signal_daily_totals
      drop constraint if exists intelligence_signal_daily_totals_pkey,
      add constraint intelligence_signal_daily_totals_pkey
        primary key (owner_id, refresh_id, metric_version, signal_date);
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid =
        'public.intelligence_signal_daily'::pg_catalog.regclass
      and constraint_row.conname = 'intelligence_signal_daily_generation_fk'
  ) then
    alter table public.intelligence_signal_daily
      add constraint intelligence_signal_daily_generation_fk
      foreign key (owner_id, metric_version, refresh_id)
      references public.intelligence_signal_generations (
        owner_id,
        metric_version,
        refresh_id
      )
      on delete restrict;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid =
        'public.intelligence_signal_daily_totals'::pg_catalog.regclass
      and constraint_row.conname =
        'intelligence_signal_daily_totals_generation_fk'
  ) then
    alter table public.intelligence_signal_daily_totals
      add constraint intelligence_signal_daily_totals_generation_fk
      foreign key (owner_id, metric_version, refresh_id)
      references public.intelligence_signal_generations (
        owner_id,
        metric_version,
        refresh_id
      )
      on delete restrict;
  end if;
end
$$;

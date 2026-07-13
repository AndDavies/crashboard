-- Private, explicit review for topic merge suggestions. The candidate row and
-- redirect remain durable while current document/event links move atomically to
-- the approved target. Historical signal rows are intentionally left intact.

create or replace function public.review_intelligence_topic_merge_suggestion(
  query_owner uuid,
  query_candidate uuid,
  query_target uuid,
  query_decision text
)
returns table (
  candidate_id uuid,
  target_id uuid,
  decision text,
  candidate_status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate_row public.intelligence_concepts%rowtype;
  target_row public.intelligence_concepts%rowtype;
  suggestion_similarity numeric;
  reviewed_at timestamptz := pg_catalog.now();
begin
  if query_decision not in ('approve', 'reject') then
    raise exception 'Decision must be approve or reject.' using errcode = '22023';
  end if;
  if query_candidate = query_target then
    raise exception 'A topic cannot be merged into itself.' using errcode = '22023';
  end if;

  select * into candidate_row
  from public.intelligence_concepts
  where owner_id = query_owner and id = query_candidate
  for update;
  if not found then
    raise exception 'Topic candidate not found.' using errcode = 'P0002';
  end if;
  if candidate_row.status <> 'candidate' then
    raise exception 'This topic is no longer awaiting review.' using errcode = 'P0001';
  end if;
  if not candidate_row.metadata @> '{"approval_required": true}'::jsonb then
    raise exception 'This topic does not have a pending merge suggestion.' using errcode = 'P0001';
  end if;
  if coalesce(candidate_row.metadata ->> 'merge_review_status', 'pending') <> 'pending' then
    raise exception 'This topic does not have a pending merge suggestion.' using errcode = 'P0001';
  end if;
  if candidate_row.metadata ->> 'suggested_concept_id' is distinct from query_target::text then
    raise exception 'The suggested topic has changed. Refresh and review again.' using errcode = 'P0001';
  end if;
  suggestion_similarity := nullif(candidate_row.metadata ->> 'suggested_similarity', '')::numeric;
  if suggestion_similarity is null or suggestion_similarity < 0.80 or suggestion_similarity >= 0.92 then
    raise exception 'The suggestion is outside the manual review range.' using errcode = 'P0001';
  end if;

  select * into target_row
  from public.intelligence_concepts
  where owner_id = query_owner and id = query_target
  for update;
  if not found then
    raise exception 'Suggested topic not found.' using errcode = 'P0002';
  end if;
  if target_row.status not in ('active', 'candidate') then
    raise exception 'The suggested topic is no longer available.' using errcode = 'P0001';
  end if;

  if query_decision = 'reject' then
    update public.intelligence_concepts
    set
      metadata = candidate_row.metadata || pg_catalog.jsonb_build_object(
        'approval_required', false,
        'merge_review_status', 'rejected',
        'suggestion_suppressed', true,
        'reviewed_suggested_concept_id', query_target::text,
        'rejected_suggested_concept_ids',
          case
            when pg_catalog.jsonb_typeof(
              candidate_row.metadata -> 'rejected_suggested_concept_ids'
            ) = 'array'
              then candidate_row.metadata -> 'rejected_suggested_concept_ids'
            else '[]'::jsonb
          end || pg_catalog.jsonb_build_array(query_target::text),
        'merge_reviewed_at', reviewed_at
      ),
      updated_at = reviewed_at
    where owner_id = query_owner and id = query_candidate;

    return query select query_candidate, query_target, query_decision, 'candidate'::text;
    return;
  end if;

  insert into public.intelligence_concept_aliases (
    owner_id, concept_id, alias, normalized_alias, source, confidence,
    is_ambiguous, metadata
  )
  select
    query_owner,
    query_target,
    alias,
    normalized_alias,
    'manual',
    case when confidence > 0.95 then confidence else 0.95 end,
    is_ambiguous,
    metadata || pg_catalog.jsonb_build_object('merged_from_concept_id', query_candidate::text)
  from public.intelligence_concept_aliases
  where owner_id = query_owner and concept_id = query_candidate
  on conflict (concept_id, normalized_alias) do nothing;

  insert into public.intelligence_concept_aliases (
    owner_id, concept_id, alias, normalized_alias, source, confidence,
    is_ambiguous, metadata
  ) values (
    query_owner,
    query_target,
    candidate_row.canonical_label,
    candidate_row.normalized_key,
    'manual',
    1,
    false,
    pg_catalog.jsonb_build_object('merged_from_concept_id', query_candidate::text)
  )
  on conflict (concept_id, normalized_alias) do nothing;

  delete from public.intelligence_document_concepts candidate_link
  where candidate_link.owner_id = query_owner
    and candidate_link.concept_id = query_candidate
    and exists (
      select 1
      from public.intelligence_document_concepts target_link
      where target_link.owner_id = query_owner
        and target_link.concept_id = query_target
        and target_link.document_id = candidate_link.document_id
        and target_link.segment_id is not distinct from candidate_link.segment_id
        and target_link.scope = candidate_link.scope
    );

  update public.intelligence_document_concepts
  set
    concept_id = query_target,
    metadata = metadata || pg_catalog.jsonb_build_object(
      'merged_from_concept_id', query_candidate::text
    ),
    updated_at = reviewed_at
  where owner_id = query_owner and concept_id = query_candidate;

  delete from public.intelligence_event_concepts candidate_link
  where candidate_link.owner_id = query_owner
    and candidate_link.concept_id = query_candidate
    and exists (
      select 1
      from public.intelligence_event_concepts target_link
      where target_link.owner_id = query_owner
        and target_link.concept_id = query_target
        and target_link.event_id = candidate_link.event_id
        and target_link.relation = candidate_link.relation
    );

  update public.intelligence_event_concepts
  set
    concept_id = query_target,
    metadata = metadata || pg_catalog.jsonb_build_object(
      'merged_from_concept_id', query_candidate::text
    ),
    updated_at = reviewed_at
  where owner_id = query_owner and concept_id = query_candidate;

  update public.intelligence_concepts
  set
    status = 'merged',
    redirect_concept_id = query_target,
    metadata = candidate_row.metadata || pg_catalog.jsonb_build_object(
      'approval_required', false,
      'merge_review_status', 'approved',
      'suggestion_suppressed', true,
      'reviewed_suggested_concept_id', query_target::text,
      'merge_reviewed_at', reviewed_at
    ),
    updated_at = reviewed_at
  where owner_id = query_owner and id = query_candidate;

  return query select query_candidate, query_target, query_decision, 'merged'::text;
end;
$$;

revoke all on function public.review_intelligence_topic_merge_suggestion(
  uuid, uuid, uuid, text
) from public, anon, authenticated;

grant execute on function public.review_intelligence_topic_merge_suggestion(
  uuid, uuid, uuid, text
) to service_role;

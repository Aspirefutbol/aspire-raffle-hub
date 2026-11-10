-- Private read model for paid Sponsor-a-Day progress.
-- This is NOT a donor endpoint or public grant. Only an authenticated adult
-- with seller-management rights for the exact tenant/participant may read it.
-- Uses settled PAID reservations, not incoming checkout sessions, HELD days,
-- or repeated webhook receipts. Supporter PII never leaves this result.
create function calendar_private.read_paid_progress(
  p_organization_id uuid,
  p_campaign_id uuid,
  p_participant_id uuid
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_base bigint := 0;
  v_additional bigint := 0;
  v_total bigint := 0;
  v_sponsor_count bigint := 0;
  v_days jsonb := '[]'::jsonb;
begin
  if auth.uid() is null
     or p_organization_id is null
     or p_campaign_id is null
     or p_participant_id is null
     or not exists (
       select 1 from public.campaign_participants cp
       where cp.id = p_participant_id
         and cp.organization_id = p_organization_id
         and cp.campaign_id = p_campaign_id
     )
     or not public.can_manage_seller_participant(
       p_organization_id, p_participant_id
     ) then
    raise exception 'Calendar progress unavailable.'
      using errcode = '42501';
  end if;

  -- Only one row per settled reservation; processing a second signed Stripe
  -- delivery cannot double count revenue or create a second primary sponsor.
  select coalesce(sum(r.base_cents), 0)::bigint,
         coalesce(sum(r.additional_impact_cents), 0)::bigint,
         coalesce(sum(r.total_cents), 0)::bigint,
         count(*)::bigint
    into v_base, v_additional, v_total, v_sponsor_count
    from calendar_private.reservations r
   where r.organization_id = p_organization_id
     and r.campaign_id = p_campaign_id
     and r.participant_id = p_participant_id
     and r.status = 'PAID';

  select coalesce(jsonb_agg(d.day_no order by d.day_no), '[]'::jsonb)
    into v_days
    from calendar_private.reservation_days d
    join calendar_private.reservations r on r.id = d.reservation_id
   where r.organization_id = p_organization_id
     and r.campaign_id = p_campaign_id
     and r.participant_id = p_participant_id
     and r.status = 'PAID' and d.state = 'PAID';

  return jsonb_build_object(
    'participant_id', p_participant_id,
    'campaign_id', p_campaign_id,
    'paid_days', v_days,
    'sponsor_count', v_sponsor_count,
    'base_cents', v_base,
    'additional_impact_cents', v_additional,
    'total_cents', v_total
  );
end;
$$;

revoke all on function calendar_private.read_paid_progress(uuid,uuid,uuid)
  from public, anon, authenticated, service_role;
comment on function calendar_private.read_paid_progress(uuid,uuid,uuid) is
  'Private adult-scoped read model: only settled PAID inventory and amounts; no donor PII; not accessible via Supabase API.';

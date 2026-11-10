-- Private adult-only inventory snapshot for the Sponsor-a-Day calendar.
-- This is not a public read model and does not grant browser or Data API access.
-- Once the PR #15 seller-link review clears, the public-facing read model must
-- independently enforce link revocation, rate limits and minimal disclosure.
--
-- HELD inventory whose timeout has passed is shown as available because
-- reserve() automatically expires it under the participant lock. In contrast,
-- CHECKOUT_PENDING remains unavailable even beyond its local expiry until a
-- trusted Stripe TEST expiry check safely releases it.

create function calendar_private.read_inventory(
  p_organization_id uuid,
  p_campaign_id uuid,
  p_participant_id uuid
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz := clock_timestamp();
  v_paid jsonb;
  v_pending jsonb;
  v_held jsonb;
  v_refunded jsonb;
  v_unavailable jsonb;
begin
  if auth.uid() is null or p_organization_id is null
      or p_campaign_id is null or p_participant_id is null
      or not exists (
        select 1 from public.campaign_participants cp
        join public.campaigns c
          on c.id = cp.campaign_id and c.organization_id = cp.organization_id
        where cp.id = p_participant_id
          and cp.organization_id = p_organization_id
          and cp.campaign_id = p_campaign_id
          and cp.status = 'active'
          and c.campaign_type in ('calendar', 'sponsor_a_day')
      )
      or not public.can_manage_seller_participant(
        p_organization_id, p_participant_id
      ) then
    raise exception 'Calendar inventory unavailable.' using errcode = '42501';
  end if;

  -- Inventory, not donor identities. The state filters intentionally distinguish
  -- a terminally expired Stripe session from an elapsed local timer.
  select
    coalesce(jsonb_agg(d.day_no order by d.day_no)
      filter (where r.status = 'PAID' and d.state = 'PAID'), '[]'::jsonb),
    coalesce(jsonb_agg(d.day_no order by d.day_no)
      filter (where r.status = 'CHECKOUT_PENDING'
        and d.state = 'CHECKOUT_PENDING'), '[]'::jsonb),
    coalesce(jsonb_agg(d.day_no order by d.day_no)
      filter (where r.status = 'HELD' and d.state = 'HELD'
        and r.expires_at > v_now), '[]'::jsonb),
    coalesce(jsonb_agg(d.day_no order by d.day_no)
      filter (where r.status = 'REFUNDED' and d.state = 'REFUNDED'), '[]'::jsonb),
    coalesce(jsonb_agg(d.day_no order by d.day_no)
      filter (where (r.status = 'PAID' and d.state = 'PAID')
        or (r.status = 'CHECKOUT_PENDING' and d.state = 'CHECKOUT_PENDING')
        or (r.status = 'REFUNDED' and d.state = 'REFUNDED')
        or (r.status = 'HELD' and d.state = 'HELD'
          and r.expires_at > v_now)), '[]'::jsonb)
  into v_paid, v_pending, v_held, v_refunded, v_unavailable
  from calendar_private.reservation_days d
  join calendar_private.reservations r on r.id = d.reservation_id
  where r.organization_id = p_organization_id
    and r.campaign_id = p_campaign_id
    and r.participant_id = p_participant_id;

  return jsonb_build_object(
    'participant_id', p_participant_id,
    'campaign_id', p_campaign_id,
    'paid_days', v_paid,
    'checkout_pending_days', v_pending,
    'held_days', v_held,
    'refunded_days', v_refunded,
    'unavailable_days', v_unavailable
  );
end;
$$;

revoke all on function calendar_private.read_inventory(uuid,uuid,uuid)
  from public, anon, authenticated, service_role;
comment on function calendar_private.read_inventory(uuid,uuid,uuid) is
  'Private authorized-adult inventory snapshot; no PII, no browser grants; expired Stripe pending inventory remains unavailable until verified release.';

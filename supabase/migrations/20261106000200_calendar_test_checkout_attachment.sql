-- Private Stripe TEST checkout handoff; no browser RPC, no public payment endpoint.
-- The trusted application must first obtain a cs_test_ session from Stripe,
-- verify the session's amount/client_reference_id/expiry, then attach it here.
-- If attach fails the server must expire the orphaned Stripe session.
-- This function never marks a reservation PAID (verified webhooks come later).

create function calendar_private.attach_test_checkout(
  p_reservation_id uuid,
  p_session_id text,
  p_session_expires_at timestamptz
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  reservation calendar_private.reservations;
  participant public.campaign_participants;
  checked_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authorized adult account required.' using errcode = '42501';
  end if;
  if p_reservation_id is null or p_session_id is null
    or length(p_session_id) not between 11 and 255
    or p_session_id !~ '^cs_test_[A-Za-z0-9_]+$'
    or p_session_expires_at is null or not isfinite(p_session_expires_at) then
    raise exception 'A valid Stripe TEST checkout session is required.' using errcode = '23514';
  end if;

  -- Read tenant only as a lookup; authority comes from live locked membership.
  select * into reservation from calendar_private.reservations
    where id = p_reservation_id;
  if not found then
    raise exception 'Reservation unavailable.' using errcode = '42501';
  end if;
  perform public.lock_fundraising_membership(reservation.organization_id);

  -- This is the same lock acquired by reserve(), preventing day release
  -- while a checkout association is being committed.
  select * into participant from public.campaign_participants
    where id = reservation.participant_id
      and organization_id = reservation.organization_id
      and campaign_id = reservation.campaign_id
    for update;
  if not found or not public.can_manage_seller_participant(
    reservation.organization_id, reservation.participant_id
  ) then
    raise exception 'Reservation unavailable.' using errcode = '42501';
  end if;

  select * into reservation from calendar_private.reservations
    where id = p_reservation_id for update;
  if reservation.status = 'CHECKOUT_PENDING'
    and reservation.checkout_session_id = p_session_id then
    return jsonb_build_object('id', reservation.id, 'status', reservation.status,
      'checkout_session_id', reservation.checkout_session_id, 'replayed', true);
  end if;
  checked_at := clock_timestamp();
  if reservation.status <> 'HELD' or reservation.expires_at <= checked_at then
    raise exception 'Calendar reservation is no longer held.' using errcode = '23514';
  end if;
  -- Stripe Checkout session expiry is 30 minutes to 24 hours after creation.
  if p_session_expires_at < checked_at + interval '29 minutes'
    or p_session_expires_at > checked_at + interval '24 hours' then
    raise exception 'Stripe TEST session expiry is not valid.' using errcode = '23514';
  end if;

  update calendar_private.reservations
    set status = 'CHECKOUT_PENDING', checkout_session_id = p_session_id,
      expires_at = p_session_expires_at, updated_at = checked_at
    where id = reservation.id;
  update calendar_private.reservation_days
    set state = 'CHECKOUT_PENDING'
    where reservation_id = reservation.id and state = 'HELD';
  if (select count(*) from calendar_private.reservation_days
    where reservation_id = reservation.id and state = 'CHECKOUT_PENDING')
      <> cardinality(reservation.days) then
    raise exception 'Checkout inventory does not reconcile.' using errcode = '23514';
  end if;
  insert into calendar_private.reservation_events(
    reservation_id, organization_id, campaign_id, participant_id,
    event_type, multiplier, base_cents, additional_impact_cents, total_cents
  ) values (
    reservation.id, reservation.organization_id, reservation.campaign_id,
    reservation.participant_id, 'CHECKOUT_PENDING', reservation.multiplier,
    reservation.base_cents, reservation.additional_impact_cents,
    reservation.total_cents
  );
  return jsonb_build_object('id', reservation.id, 'status', 'CHECKOUT_PENDING',
    'checkout_session_id', p_session_id, 'replayed', false);
end;
$$;

revoke all on function calendar_private.attach_test_checkout(uuid,text,timestamptz)
  from public, anon, authenticated, service_role;
comment on function calendar_private.attach_test_checkout(uuid,text,timestamptz) is
  'Private TEST checkout association. No paid transition; caller must verify Stripe session and expire orphans on failure.';

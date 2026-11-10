-- Restore unsold calendar inventory only after a trusted server has
-- retrieved the cs_test_ session from Stripe and verified status='expired',
-- payment_status='unpaid', exact amount, client reference, and expiry.
-- NEVER use the local clock alone as proof: completed Stripe payments can
-- arrive via delayed webhooks and must retain exclusive day ownership.
-- No browser-facing RPC, API grants, or PR #15 sharing-link changes.

create function calendar_private.expire_test_checkout(
  p_reservation_id uuid,
  p_session_id text,
  p_session_expires_at timestamptz
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r calendar_private.reservations;
  claimed_days integer;
begin
  if p_reservation_id is null or p_session_id is null
    or p_session_id !~ '^cs_test_[A-Za-z0-9_]{3,248}$'
    or p_session_expires_at is null or not isfinite(p_session_expires_at) then
    raise exception 'Invalid verified Stripe TEST expiry.' using errcode='23514';
  end if;
  select * into r from calendar_private.reservations
    where id=p_reservation_id for update;
  if not found or r.checkout_session_id is distinct from p_session_id
      or r.expires_at is distinct from p_session_expires_at then
    raise exception 'Stripe TEST expiry does not match this reservation.'
      using errcode='23514';
  end if;

  if r.status='EXPIRED' then
    return jsonb_build_object('id', r.id, 'status', 'EXPIRED', 'replayed', true);
  end if;
  if r.status <> 'CHECKOUT_PENDING'
     or clock_timestamp() < r.expires_at then
    raise exception 'Only verified expired unpaid TEST checkout can release days.'
      using errcode='23514';
  end if;

  -- Row lock serializes expiry against webhook settlement. Once either wins,
  -- the other cannot change the winner's terminal state.
  select count(*) into claimed_days
    from calendar_private.reservation_days
    where reservation_id=r.id and state='CHECKOUT_PENDING';
  if claimed_days <> cardinality(r.days)
      or exists (select 1 from calendar_private.reservation_days
          where reservation_id=r.id and state<>'CHECKOUT_PENDING') then
    raise exception 'Checkout inventory does not reconcile.'
      using errcode='23514';
  end if;

  update calendar_private.reservations
    set status='EXPIRED', updated_at=clock_timestamp()
    where id=r.id;
  update calendar_private.reservation_days
    set state='RELEASED'
    where reservation_id=r.id and state='CHECKOUT_PENDING';
  insert into calendar_private.reservation_events(
    reservation_id, organization_id, campaign_id, participant_id, event_type,
    multiplier, base_cents, additional_impact_cents, total_cents)
  values(r.id, r.organization_id, r.campaign_id, r.participant_id, 'EXPIRED',
    r.multiplier, r.base_cents, r.additional_impact_cents, r.total_cents);

  return jsonb_build_object('id', r.id, 'status', 'EXPIRED', 'replayed', false);
end;
$$;

revoke all on function calendar_private.expire_test_checkout(uuid,text,timestamptz)
  from public, anon, authenticated, service_role;
comment on function calendar_private.expire_test_checkout(uuid,text,timestamptz) is
  'Private TEST-only release, requiring independent Stripe API proof of expired/unpaid session; no web API grant.';

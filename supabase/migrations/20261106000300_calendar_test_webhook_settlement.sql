-- Private, Stripe TEST-only settlement contract. No webhook route or API grant.
-- Caller MUST first verify the Stripe-Signature HMAC over the unmodified raw
-- request body, prove that this is a paid cs_test_ Checkout Session, and pass
-- only the normalized fields from that verified event. A return URL is not proof.
-- This function is intentionally callable only by trusted direct DB operators,
-- not by anon, authenticated, or the Supabase service-role Data API.

create table calendar_private.stripe_test_payment_receipts (
  stripe_event_id text primary key
    check (stripe_event_id ~ '^evt_[A-Za-z0-9_]{3,248}$'),
  reservation_id uuid not null references calendar_private.reservations(id),
  checkout_session_id text not null
    check (checkout_session_id ~ '^cs_test_[A-Za-z0-9_]{3,248}$'),
  amount_cents bigint not null check (amount_cents between 100 and 248000),
  recorded_at timestamptz not null default clock_timestamp()
);

alter table calendar_private.stripe_test_payment_receipts enable row level security;
revoke all on calendar_private.stripe_test_payment_receipts
  from public, anon, authenticated, service_role;

create trigger calendar_test_payment_receipts_immutable
  before update or delete on calendar_private.stripe_test_payment_receipts
  for each row execute function public.prevent_ledger_mutation();

create function calendar_private.confirm_test_checkout_paid(
  p_reservation_id uuid,
  p_session_id text,
  p_stripe_event_id text,
  p_amount_cents bigint
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r calendar_private.reservations;
  prior calendar_private.stripe_test_payment_receipts;
  claimed_days integer;
  current_state text;
begin
  if p_reservation_id is null
     or p_session_id !~ '^cs_test_[A-Za-z0-9_]{3,248}$'
     or p_stripe_event_id !~ '^evt_[A-Za-z0-9_]{3,248}$'
     or p_amount_cents is null or p_amount_cents not between 100 and 248000 then
    raise exception 'Invalid verified TEST checkout payment.' using errcode = '23514';
  end if;

  select * into r from calendar_private.reservations
    where id = p_reservation_id for update;
  if not found
    or r.checkout_session_id is distinct from p_session_id
    or r.total_cents is distinct from p_amount_cents then
    raise exception 'TEST checkout does not match the reserved sponsorship.'
      using errcode = '23514';
  end if;

  -- Both the Stripe event identifier and the reservation/session/amount tuple
  -- must match before an idempotent replay is accepted.
  select * into prior from calendar_private.stripe_test_payment_receipts
    where stripe_event_id = p_stripe_event_id;
  if found then
    if prior.reservation_id <> r.id
      or prior.checkout_session_id <> p_session_id
      or prior.amount_cents <> p_amount_cents
      or r.status <> 'PAID' then
      raise exception 'Stripe event replay did not reconcile.' using errcode = '23505';
    end if;
    return jsonb_build_object('reservation_id', r.id, 'status', 'PAID',
      'replayed', true, 'total_cents', r.total_cents);
  end if;

  -- One Stripe session can produce more than one delivered completed event.
  -- Keep a receipt of each authenticated event without duplicating PAID
  -- transitions, day updates, or sponsor-credit accounting.
  if r.status = 'PAID' then
    insert into calendar_private.stripe_test_payment_receipts(
      stripe_event_id, reservation_id, checkout_session_id, amount_cents)
    values(p_stripe_event_id, r.id, p_session_id, p_amount_cents);
    return jsonb_build_object('reservation_id', r.id, 'status', 'PAID',
      'replayed', true, 'total_cents', r.total_cents);
  end if;

  if r.status <> 'CHECKOUT_PENDING' then
    raise exception 'Only an attached TEST checkout can be settled.'
      using errcode = '23514';
  end if;
  -- This is an auditable, exact inventory transition, never a read-before-
  -- write release. The expiry date is not checked: a completed Stripe payment
  -- may be delivered after session expiration while payment was still valid.
  select count(*), min(state) into claimed_days, current_state
    from calendar_private.reservation_days
    where reservation_id = r.id;
  if claimed_days <> cardinality(r.days)
    or current_state <> 'CHECKOUT_PENDING'
    or exists (select 1 from calendar_private.reservation_days
      where reservation_id = r.id and state <> 'CHECKOUT_PENDING') then
    raise exception 'Paid calendar days did not reconcile.'
      using errcode = '23514';
  end if;

  update calendar_private.reservations
    set status = 'PAID', updated_at = clock_timestamp()
    where id = r.id;
  update calendar_private.reservation_days
    set state = 'PAID'
    where reservation_id = r.id and state = 'CHECKOUT_PENDING';

  insert into calendar_private.stripe_test_payment_receipts(
    stripe_event_id, reservation_id, checkout_session_id, amount_cents)
  values(p_stripe_event_id, r.id, p_session_id, p_amount_cents);

  insert into calendar_private.reservation_events(
    reservation_id, organization_id, campaign_id, participant_id,
    event_type, multiplier, base_cents, additional_impact_cents, total_cents)
  values(r.id, r.organization_id, r.campaign_id, r.participant_id, 'PAID',
    r.multiplier, r.base_cents, r.additional_impact_cents, r.total_cents);

  return jsonb_build_object('reservation_id', r.id, 'status', 'PAID',
    'replayed', false, 'total_cents', r.total_cents);
end;
$$;

revoke all on function calendar_private.confirm_test_checkout_paid(uuid,text,text,bigint)
  from public, anon, authenticated, service_role;
comment on function calendar_private.confirm_test_checkout_paid(uuid,text,text,bigint) is
  'No API grant. Trusted backoffice only: verify raw Stripe TEST webhook first; atomic, idempotent PAID transition with immutable base and additional impact.';

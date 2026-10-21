-- Keep issued raffle ticket artifacts aligned with structured prize records.
-- Compliance-enforced campaigns snapshot the canonical prize description at
-- attestation. Non-enforced/demo campaigns may not have that snapshot, so fall
-- back to the same canonical structured prize projection. Prize records are
-- locked after activation, preserving the issued-ticket disclosure.
create or replace function public.sale_ticket_receipt(p_organization_id uuid, p_sale_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set timezone = 'UTC'
as $$
declare
  s public.campaign_sales;
  c public.campaigns;
  reversed boolean;
  tickets jsonb;
  prize_description text;
begin
  if auth.uid() is null then raise insufficient_privilege; end if;
  select * into s from public.campaign_sales
  where id=p_sale_id and organization_id=p_organization_id;
  if not found or not public.can_read_fundraising_sale(s.id) then raise insufficient_privilege; end if;
  select * into c from public.campaigns where id=s.campaign_id and organization_id=p_organization_id;
  if not found then raise exception 'Campaign not found.' using errcode='no_data_found'; end if;

  select exists(select 1 from public.sale_reversals r where r.sale_id=s.id) into reversed;
  select coalesce(jsonb_agg(jsonb_build_object(
    'ticket_number',t.ticket_number,
    'status',t.status
  ) order by t.sequence_number,t.id),'[]'::jsonb)
  into tickets
  from public.tickets t
  where t.organization_id=p_organization_id and t.campaign_id=s.campaign_id and t.sale_id=s.id;

  prize_description := coalesce(
    nullif(btrim(c.prize_description),''),
    public.campaign_prize_ticket_description(c.id)
  );

  return jsonb_build_object(
    'sale_id',s.id,
    'campaign_id',c.id,
    'campaign_name',c.name,
    'buyer_name',s.buyer_name,
    'sold_at',s.sold_at,
    'amount_cents',s.amount_cents,
    'quantity',s.quantity,
    'payment_method',s.payment_method,
    'reversed',reversed,
    'tickets',tickets,
    'operator_legal_name',c.operator_legal_name,
    'operator_address',c.operator_address,
    'ticket_price_cents',c.ticket_price_cents,
    'prize_description',prize_description,
    'charitable_purpose',c.charitable_purpose,
    'draw_at',c.draw_at,
    'timezone',c.timezone,
    'support_email',c.support_email,
    'support_phone',c.support_phone,
    'rules_text',c.rules_text
  );
end;
$$;

revoke all on function public.sale_ticket_receipt(uuid,uuid) from public, anon;
grant execute on function public.sale_ticket_receipt(uuid,uuid) to authenticated;

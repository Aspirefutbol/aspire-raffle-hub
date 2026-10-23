from pathlib import Path
import json

def replace(text,old,new):
 if text.count(old)!=1: raise ValueError('Unexpected source anchor: '+old)
 return text.replace(old,new)

source=Path('scripts/test-fundraising-concurrency.mjs').read_text().split('async function main() {')[0]
source=replace(source,'const PRICE_CENTS = 200;', 'const PRICE_CENTS = 2000;')
source=replace(source,'ticket_price_cents,ticket_prefix,goal_amount_cents', 'ticket_price_cents,ticket_packages,ticket_prefix,goal_amount_cents')
source=replace(source,"${PRICE_CENTS},'CC',", "${PRICE_CENTS},'[{\"quantity\":5,\"priceCents\":9000}]'::jsonb,'CC',")
source=replace(source,'quantity = 1, extra = {}', 'quantity = 5, extra = {}')
source=replace(source,'p_amount_cents: quantity * PRICE_CENTS', 'p_amount_cents: Math.floor(quantity / 5) * 9000 + (quantity % 5) * PRICE_CENTS')
Path('scripts/test-package-concurrency.mjs').write_text(source+Path('.github/candidates/package-concurrency-main.txt').read_text())
p=Path('package.json'); value=json.loads(p.read_text()); value['scripts']['test:package-concurrency']='node --env-file=.env.local scripts/test-package-concurrency.mjs'; p.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
p=Path('.github/workflows/ci.yml');p.write_text(replace(p.read_text(),'          npm run test:concurrency\n','          npm run test:concurrency\n          npm run test:package-concurrency\n'))
p=Path('AGENTS.md');p.write_text(replace(p.read_text(),'full-face-value integer cents, atomic ledger writes','approved locked-price integer cents (including package snapshots and exact per-ticket allocations), atomic ledger writes'))
p=Path('docs/PROJECT_STATE.md');s=p.read_text();s=replace(s,'_Last updated: 2026-10-16_','_Historical record below; current implementation checkpoint updated 2026-10-23._');p.write_text(s.replace('# Raffle Hub Project State\n','# Raffle Hub Project State\n'+Path('.github/candidates/package-current-state.txt').read_text(),1))
# Exercise the permission-checked projection, never widen access to the private view.
p=Path('supabase/tests/ticket_packages.test.sql');s=p.read_text()
for key in ['expected_cents','received_cents']:
 s=replace(s,f"(select sum({key}) from public.money_sale_balances where campaign_id=pg_temp.id('campaign')),20000::numeric",f"(public.campaign_money(pg_temp.id('org'),pg_temp.id('campaign'),'admin')->'totals'->>'{key}')::bigint,20000::bigint")
# now() is transaction-stable; distinct sale times make the existing FIFO allocation deterministic.
old="'five','Synthetic Buyer',5,9000,'cash')"
if s.count(old)!=2: raise ValueError('Expected original sale and exact replay')
s=s.replace(old,"'five','Synthetic Buyer',5,9000,'cash',p_sold_at=>now()-interval '1 hour')")
p.write_text(s)
# Mirror the existing database attestation lock as well as the new package lock.
p=Path('lib/campaigns/lifecycle.ts');p.write_text(replace(p.read_text(),'"compliance_confirmed_at", "compliance_confirmed_by", "compliance_confirmation_hash",','"compliance_confirmed_at", "compliance_confirmed_by", "compliance_confirmation_hash", "compliance_attestation",'))

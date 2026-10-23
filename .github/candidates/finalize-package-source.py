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

#!/usr/bin/env node
// Real multi-session tests against the disposable local Supabase stack.
// Requires the normal dev seed. Leaves isolated fixtures for the next db reset;
// never resets, deletes, or changes existing seed rows. Uses user JWTs for RPCs.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { localDockerSocket } from "./lib/local-docker.mjs";

const DB_CONTAINER = "supabase_db_aspire-raffle-hub";
const DOCKER_SOCKET = localDockerSocket();
const PRICE_CENTS = 200;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const password = process.env.SEED_PASSWORD ?? "RaffleHub!dev1";
if (!url || !publicKey) throw new Error("Set local NEXT_PUBLIC_SUPABASE_URL and its public publishable/anon key.");
const endpoint = new URL(url);
if (endpoint.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(endpoint.hostname)
    || endpoint.port !== "54321" || !["", "/"].includes(endpoint.pathname)
    || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
  throw new Error("Concurrency tests require the loopback Supabase API on port 54321; remote projects are refused.");
}
if (process.env.NODE_ENV === "production") throw new Error("Concurrency tests refuse NODE_ENV=production.");

function uuid(value) {
  assert.match(value, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Expected a validated UUID.");
  return `'${value}'::uuid`;
}
function psql() {
  return spawn("docker", ["--host", DOCKER_SOCKET, "exec", "-i", DB_CONTAINER,
    "psql", "-U", "postgres", "-d", "postgres", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"],
  { stdio: ["pipe", "pipe", "pipe"] });
}
function completion(child) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    // SQL inputs contain only fixture values/validated UUIDs, never credentials.
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0) reject(new Error(`Local fixture SQL failed (${code}); ${stderr.trim()}`));
      else resolve(stdout.trim());
    });
  });
}
async function sql(statement) {
  const child = psql();
  const finished = completion(child);
  child.stdin.end(statement);
  return finished;
}
async function sqlJson(statement) {
  return JSON.parse(await sql(statement));
}
async function rpc(client, name, args) {
  return client.rpc(name, args).abortSignal(AbortSignal.timeout(20_000));
}
function requireData(result, operation) {
  if (result.error) throw new Error(`${operation} failed (${result.error.code ?? result.error.status ?? "request error"}).`);
  return result.data;
}
async function account(email) {
  const client = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const data = requireData(await client.auth.signInWithPassword({ email, password }), "Seed account sign-in");
  assert.ok(data.user?.id, "Seed account must return a user ID.");
  uuid(data.user.id);
  return { client, userId: data.user.id };
}

// Hold a real campaign row lock until every competing HTTP request is waiting.
// This proves separate PostgreSQL sessions overlap, rather than relying on fast
// sequential Promise scheduling. The local observer follows blocker chains.
async function simultaneous(fixture, actions) {
  const barrier = psql();
  const finished = completion(barrier);
  let pid;
  let output = "";
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Campaign concurrency barrier timed out.")), 10_000);
    barrier.stdout.on("data", (chunk) => {
      output += chunk;
      const match = /lock-ready:(\d+)/.exec(output);
      if (match) { pid = Number(match[1]); clearTimeout(timer); resolve(); }
    });
    finished.catch((error) => { clearTimeout(timer); reject(error); });
  });
  barrier.stdin.write(`begin; select id from public.campaigns where id=${uuid(fixture.campaignId)} for update;
    select 'lock-ready:' || pg_backend_pid();\n`);
  let pending;
  try {
    await ready;
    pending = Promise.allSettled(actions.map((action) => action()));
    const deadline = Date.now() + 10_000;
    let waiting = 0;
    do {
      waiting = Number(await sql(`with recursive blocked(pid) as (
        select a.pid from pg_catalog.pg_stat_activity a where ${pid}=any(pg_catalog.pg_blocking_pids(a.pid))
        union select a.pid from pg_catalog.pg_stat_activity a join blocked b
          on b.pid=any(pg_catalog.pg_blocking_pids(a.pid))
      ) select count(distinct pid) from blocked;`));
      if (waiting >= actions.length) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    } while (Date.now() < deadline);
    assert.ok(waiting >= actions.length, `Expected ${actions.length} competing database sessions, observed ${waiting}.`);
  } finally {
    barrier.stdin.end("rollback;\n");
    await finished;
  }
  const settled = await pending;
  return settled.map((result) => {
    if (result.status === "rejected") throw new Error("A concurrent HTTP request failed before returning an RPC result.");
    return result.value;
  });
}

async function fixture(name, stock, admin, family) {
  const ids = {
    orgId: randomUUID(), campaignId: randomUUID(), teamId: randomUUID(),
    adminMemberId: randomUUID(), familyMemberId: randomUUID(),
    householdId: randomUUID(), guardianId: randomUUID(),
    playerId: randomUUID(), otherPlayerId: randomUUID(),
  };
  const slug = `concurrency-${name.replaceAll("_", "-")}-${randomUUID().slice(0, 8)}`;
  assert.match(slug, /^[a-z0-9-]{1,48}$/);
  await sql(`begin;
    select set_config('request.jwt.claims',jsonb_build_object('sub',${uuid(admin.userId)},'role','authenticated')::text,true);
    insert into public.organizations(id,name,legal_name,slug,address_line1,city,region,support_email,jurisdiction_profile)
      values(${uuid(ids.orgId)},'Concurrency fixture','Concurrency Fixture Inc','${slug}',
        '100 Test Way','Houston','TX','support@example.test','TEXAS_CREA_OFFLINE_PAYMENT');
    insert into public.organization_members(id,organization_id,user_id) values
      (${uuid(ids.adminMemberId)},${uuid(ids.orgId)},${uuid(admin.userId)}),
      (${uuid(ids.familyMemberId)},${uuid(ids.orgId)},${uuid(family.userId)});
    insert into public.organization_member_roles(organization_id,member_id,role_key) values
      (${uuid(ids.orgId)},${uuid(ids.adminMemberId)},'ORGANIZATION_ADMIN'),
      (${uuid(ids.orgId)},${uuid(ids.adminMemberId)},'DIRECTOR'),
      (${uuid(ids.orgId)},${uuid(ids.familyMemberId)},'PARTICIPANT_FAMILY'),
      (${uuid(ids.orgId)},${uuid(ids.familyMemberId)},'TEAM_CAPTAIN');
    insert into public.teams(id,organization_id,name) values(${uuid(ids.teamId)},${uuid(ids.orgId)},'Fixture Team');
    insert into public.households(id,organization_id,name) values(${uuid(ids.householdId)},${uuid(ids.orgId)},'Fixture Household');
    insert into public.guardians(id,organization_id,household_id,first_name,last_name)
      values(${uuid(ids.guardianId)},${uuid(ids.orgId)},${uuid(ids.householdId)},'Fixture','Guardian');
    insert into public.players(id,organization_id,household_id,first_name,last_name) values
      (${uuid(ids.playerId)},${uuid(ids.orgId)},${uuid(ids.householdId)},'Own','Player'),
      (${uuid(ids.otherPlayerId)},${uuid(ids.orgId)},null,'Other','Player');
    insert into public.team_memberships(organization_id,player_id,team_id) values
      (${uuid(ids.orgId)},${uuid(ids.playerId)},${uuid(ids.teamId)}),
      (${uuid(ids.orgId)},${uuid(ids.otherPlayerId)},${uuid(ids.teamId)});
    insert into public.guardian_user_links(organization_id,guardian_id,member_id)
      values(${uuid(ids.orgId)},${uuid(ids.guardianId)},${uuid(ids.familyMemberId)});
    insert into public.team_staff_assignments(organization_id,team_id,member_id)
      values(${uuid(ids.orgId)},${uuid(ids.teamId)},${uuid(ids.familyMemberId)});
    insert into public.campaigns(id,organization_id,name,starts_at,sales_close_at,draw_at,
      ticket_price_cents,ticket_prefix,goal_amount_cents,player_goal_default_cents,team_goal_default_cents,default_allocation)
      values(${uuid(ids.campaignId)},${uuid(ids.orgId)},'Concurrency raffle',now()-interval '1 hour',
        now()+interval '7 days',now()+interval '8 days',${PRICE_CENTS},'CC',20000,5000,10000,${stock});
    commit;`);
  requireData(await rpc(admin.client, "enroll_campaign_players", {
    p_organization_id: ids.orgId, p_campaign_id: ids.campaignId, p_all_active: true,
  }), "Fixture enrollment");
  const participants = requireData(await admin.client.from("campaign_participants").select("id,player_id")
    .eq("organization_id", ids.orgId).eq("campaign_id", ids.campaignId), "Fixture participants");
  assert.equal(participants.length, 2);
  ids.participantId = participants.find((row) => row.player_id === ids.playerId)?.id;
  ids.otherParticipantId = participants.find((row) => row.player_id === ids.otherPlayerId)?.id;
  uuid(ids.participantId); uuid(ids.otherParticipantId);
  for (const status of ["READY", "ACTIVE"]) requireData(await rpc(admin.client, "transition_campaign", {
    p_campaign_id: ids.campaignId, p_to: status, p_reason: "Concurrency fixture preparation",
  }), "Fixture lifecycle transition");
  requireData(await rpc(admin.client, "prepare_campaign_inventory", {
    p_organization_id: ids.orgId, p_campaign_id: ids.campaignId,
  }), "Fixture assigned inventory");
  return ids;
}

function saleArgs(fixture, key, quantity = 1, extra = {}) {
  return {
    p_organization_id: fixture.orgId, p_campaign_id: fixture.campaignId,
    p_participant_id: fixture.participantId, p_idempotency_key: key,
    p_buyer_name: "Concurrency Buyer", p_quantity: quantity,
    p_amount_cents: quantity * PRICE_CENTS, p_payment_method: "cash", ...extra,
  };
}

async function custody(f,admin,key,kind,extra={}) {
  return rpc(admin.client,'record_money_custody',{p_organization_id:f.orgId,p_campaign_id:f.campaignId,
    p_request:{kind,idempotency_key:key,reason:'Synthetic overlapping custody test',...extra}});
}
async function balances(f,admin) {
  return requireData(await rpc(admin.client,'campaign_money',{p_organization_id:f.orgId,p_campaign_id:f.campaignId,p_view:'admin'}),'Money projection');
}
async function integrity(f,admin) {
  const chains=requireData(await rpc(admin.client,'verify_campaign_ledgers',{p_campaign_id:f.campaignId}),'Ledger verification');
  assert.ok(chains.every(x=>x.ok),'Every existing campaign/ticket/money chain must verify');
  const audit=requireData(await rpc(admin.client,'verify_audit_chain',{p_organization_id:f.orgId}),'Audit verification');
  assert.ok(audit.every ? audit.every(x=>x.ok) : audit.ok,'Audit chain must verify');
}
async function main() {
  const admin=await account('admin@aspire.test');
  const family=await account('coach@aspire.test');
  const receipt={seller_id:family.userId,amount_cents:500,payment_method:'cash'};
  {
    const f=await fixture('money_retry',10,admin,family);
    requireData(await rpc(family.client,'record_campaign_sale',saleArgs(f,'one',2)),'First sale');
    requireData(await rpc(family.client,'record_campaign_sale',saleArgs(f,'two',2)),'Second sale');
    const r=await simultaneous(f,Array.from({length:4},()=>()=>custody(f,admin,'same-receipt','receipt',receipt)));
    const ids=r.map(x=>requireData(x,'Overlapping same-key receipt').event_id);
    assert.equal(new Set(ids).size,1);
    const b=await balances(f,admin); assert.equal(b.events.length,1); assert.equal(b.totals.received_cents,500); assert.equal(b.totals.outstanding_cents,300);
    const counts=await sqlJson(`select jsonb_build_object('allocations',(select count(*) from public.money_custody_allocations where campaign_id=${uuid(f.campaignId)}));`);
    assert.equal(counts.allocations,2,'Partial FIFO covers two sales exactly once');
    await integrity(f,admin); console.log('PASS receipt retry: four truly overlapping sessions; one receipt, two immutable FIFO allocations.');
  }
  {
    const f=await fixture('money_contention',8,admin,family);
    requireData(await rpc(family.client,'record_campaign_sale',saleArgs(f,'sale',2)),'Sale');
    const r=await simultaneous(f,Array.from({length:4},(_,i)=>()=>custody(f,admin,`compete-${i}`,'receipt',{...receipt,amount_cents:200})));
    assert.equal(r.filter(x=>!x.error).length,2); assert.equal(r.filter(x=>x.error?.code==='23514').length,2);
    const b=await balances(f,admin); assert.equal(b.totals.received_cents,400); assert.equal(b.totals.outstanding_cents,0);
    await integrity(f,admin); console.log('PASS receipt contention: four sessions cannot overreceive one obligation.');
  }
  {
    const f=await fixture('money_reversal',8,admin,family);
    const sale=requireData(await rpc(family.client,'record_campaign_sale',saleArgs(f,'sale',2)),'Sale');
    const r=await simultaneous(f,[()=>custody(f,admin,'receive','receipt',{...receipt,amount_cents:400}),
      ()=>rpc(admin.client,'reverse_campaign_sale',{p_organization_id:f.orgId,p_sale_id:sale.sale_id,p_reason:'Synthetic concurrent reversal'})]);
    requireData(r[1],'Reversal');
    const b=await balances(f,admin); assert.equal(b.totals.expected_cents,0);
    assert.equal(b.totals.received_cents,r[0].error?0:400); assert.equal(b.totals.credit_cents,r[0].error?0:400);
    await integrity(f,admin); console.log('PASS receipt/reversal race: a committed physical receipt survives the reversal.');
  }
  {
    const f=await fixture('money_return',8,admin,family);
    requireData(await rpc(family.client,'record_campaign_sale',saleArgs(f,'sale',2)),'Sale');
    const received=requireData(await custody(f,admin,'check','receipt',{...receipt,amount_cents:400,payment_method:'check'}),'Check');
    const r=await simultaneous(f,[()=>custody(f,admin,'bounce-a','check_returned',{receipt_id:received.event_id}),
      ()=>custody(f,admin,'bounce-b','check_returned',{receipt_id:received.event_id})]);
    assert.equal(r.filter(x=>!x.error).length,1); assert.equal(r.filter(x=>x.error?.code==='23514').length,1);
    const b=await balances(f,admin); assert.equal(b.totals.received_cents,0); assert.equal(b.totals.exception_cents,400);
    const tickets=await sql(`select count(*) from public.tickets where campaign_id=${uuid(f.campaignId)} and status='ISSUED';`);
    assert.equal(Number(tickets),2,'Returned check never voids tickets');
    await integrity(f,admin); console.log('PASS returned-check race: one exception, no double debit or ticket change.');
  }
  {
    const f=await fixture('money_credit',10,admin,family);
    const sale=requireData(await rpc(family.client,'record_campaign_sale',saleArgs(f,'original',2)),'Sale');
    const received=requireData(await custody(f,admin,'receipt','receipt',{...receipt,amount_cents:400}),'Receipt');
    requireData(await rpc(admin.client,'reverse_campaign_sale',{p_organization_id:f.orgId,p_sale_id:sale.sale_id,p_reason:'Synthetic correction'}),'Reversal');
    const replacement=requireData(await rpc(admin.client,'record_campaign_sale',saleArgs(f,'replacement',2,{p_corrects_sale_id:sale.sale_id})),'Replacement');
    const shared={receipt_id:received.event_id,sale_id:sale.sale_id,amount_cents:400};
    const r=await simultaneous(f,[()=>custody(f,admin,'refund','refund',shared),
      ()=>custody(f,admin,'credit','credit',{...shared,target_sale_id:replacement.sale_id})]);
    assert.equal(r.filter(x=>!x.error).length,1); assert.equal(r.filter(x=>x.error?.code==='23514').length,1);
    const b=await balances(f,admin); assert.equal(b.events.filter(x=>x.kind==='receipt').length,1);
    assert.equal(b.totals.received_cents,r[0].error?400:0);
    await integrity(f,admin); console.log('PASS refund/credit race: original receipt funds cannot be spent twice.');
  }
  console.log('PASS 5 real money concurrency groups; canonical ledger/audit chains verified. Disposable fixtures retained.');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});

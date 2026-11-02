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
const PRICE_CENTS = 2000;
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
    insert into public.organizations(id,name,legal_name,slug,address_line1,city,region,support_email,jurisdiction_profile,platform_config)
      values(${uuid(ids.orgId)},'Concurrency fixture','Concurrency Fixture Inc','${slug}',
        '100 Test Way','Houston','TX','support@example.test','TEXAS_CREA_OFFLINE_PAYMENT',jsonb_build_object('texas_crea_compliance_required',false));
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
      ticket_price_cents,ticket_packages,ticket_prefix,goal_amount_cents,player_goal_default_cents,team_goal_default_cents,default_allocation)
      values(${uuid(ids.campaignId)},${uuid(ids.orgId)},'Concurrency raffle',now()-interval '1 hour',
        now()+interval '7 days',now()+interval '8 days',${PRICE_CENTS},'[{"quantity":5,"priceCents":9000}]'::jsonb,'CC',20000,5000,10000,${stock});
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

function saleArgs(fixture, key, quantity = 5, extra = {}) {
  return {
    p_organization_id: fixture.orgId, p_campaign_id: fixture.campaignId,
    p_participant_id: fixture.participantId, p_idempotency_key: key,
    p_buyer_name: "Concurrency Buyer", p_quantity: quantity,
    p_amount_cents: Math.floor(quantity / 5) * 9000 + (quantity % 5) * PRICE_CENTS, p_payment_method: "cash", ...extra,
  };
}
async function facts(fixture) {
  return sqlJson(`select jsonb_build_object(
    'sales',(select count(*) from public.campaign_sales where campaign_id=${uuid(fixture.campaignId)}),
    'collections',(select count(*) from public.money_events where campaign_id=${uuid(fixture.campaignId)} and event_type='SALE_COLLECTED'),
    'reversals',(select count(*) from public.sale_reversals where campaign_id=${uuid(fixture.campaignId)}),
    'negative_events',(select count(*) from public.money_events where campaign_id=${uuid(fixture.campaignId)} and event_type='REVERSAL'),
    'issued_events',(select count(*) from public.ticket_events where campaign_id=${uuid(fixture.campaignId)} and event_type='ISSUED'),
    'void_events',(select count(*) from public.ticket_events where campaign_id=${uuid(fixture.campaignId)} and event_type='VOIDED'),
    'net_money',coalesce((select sum(amount_cents) from public.money_events where campaign_id=${uuid(fixture.campaignId)} and event_type in('SALE_COLLECTED','REVERSAL')),0),
    'active_tickets',(select count(*) from public.tickets where campaign_id=${uuid(fixture.campaignId)} and status='ISSUED'),
    'own_available',(select count(*) from public.tickets where participant_id=${uuid(fixture.participantId)} and status='ALLOCATED'),
    'ticket_count',(select count(*) from public.tickets where campaign_id=${uuid(fixture.campaignId)}),
    'unique_numbers',(select count(distinct ticket_number) from public.tickets where campaign_id=${uuid(fixture.campaignId)}),
    'audit_count',(select count(*) from public.audit_events where organization_id=${uuid(fixture.orgId)})
  );`);
}
async function verify(fixture, admin, family, expected) {
  const stored = await facts(fixture);
  for (const [field, value] of Object.entries(expected)) assert.equal(stored[field], value, `Stored ${field} disagrees with committed concurrency outcomes.`);
  assert.equal(stored.ticket_count, stored.unique_numbers, "Ticket numbers must remain unique, including voided numbers.");
  assert.equal(stored.active_tickets, stored.issued_events - stored.void_events, "Ticket projection must match its append-only events.");
  for (const [client, view] of [[admin.client, "admin"], [family.client, "family"], [family.client, "team"]]) {
    const progress = requireData(await rpc(client, "campaign_progress", {
      p_organization_id: fixture.orgId, p_campaign_id: fixture.campaignId, p_view: view,
    }), "Scoped progress");
    assert.equal(progress.totals.raised_cents, stored.net_money);
    assert.equal(progress.totals.tickets_sold, stored.active_tickets);
    assert.equal(progress.participants.length, view === "family" ? 1 : 2);
    const own = progress.participants.find((row) => row.id === fixture.participantId);
    assert.ok(own); assert.equal(own.raised_cents, stored.net_money);
    assert.equal(own.tickets_sold, stored.active_tickets); assert.equal(own.available_tickets, stored.own_available);
    assert.equal(progress.teams.length, 1);
    assert.equal(progress.teams[0].raised_cents, stored.net_money);
    assert.equal(progress.teams[0].tickets_sold, stored.active_tickets);
  }
  const ledgers = requireData(await rpc(admin.client, "verify_campaign_ledgers", { p_campaign_id: fixture.campaignId }), "Campaign ledger verification");
  assert.equal(ledgers.length, 3);
  assert.ok(ledgers.every((row) => row.ok && row.first_bad_pos == null));
  assert.equal(Number(ledgers.find((row) => row.ledger === "money_events").rows_checked), stored.collections + stored.negative_events);
  const audit = requireData(await rpc(admin.client, "verify_audit_chain", { p_organization_id: fixture.orgId }), "Audit verification");
  assert.equal(audit.length, 1); assert.equal(audit[0].ok, true);
  assert.equal(Number(audit[0].rows_checked), stored.audit_count);
  return stored;
}

async function main() {
  const admins = await Promise.all(Array.from({ length: 4 }, () => account("admin@aspire.test")));
  const families = await Promise.all(Array.from({ length: 6 }, () => account("coach@aspire.test")));
  const admin = admins[0], family = families[0];
  const same = await fixture("package_same", 10, admin, family);
  const key = randomUUID();
  const outcomes = await simultaneous(same, families.slice(0, 4).map((actor) => () => rpc(actor.client, "record_campaign_sale", saleArgs(same, key))));
  const sales = outcomes.map((result) => requireData(result, "Concurrent package retry"));
  assert.equal(new Set(sales.map((sale) => sale.sale_id)).size, 1);
  assert.equal(sales.filter((sale) => !sale.replayed).length, 1);
  for (const sale of sales) {
    assert.equal(sale.amount_cents, 9000);
    assert.deepEqual(sale.ticket_numbers, sales[0].ticket_numbers);
    assert.deepEqual(sale.pricing_snapshot, sales[0].pricing_snapshot);
  }
  await verify(same, admin, family, { sales: 1, collections: 1, reversals: 0, negative_events: 0, issued_events: 5, void_events: 0, net_money: 9000, active_tickets: 5, own_available: 5 });
  assert.equal((await rpc(family.client, "record_campaign_sale", saleArgs(same, randomUUID(), 5, { p_amount_cents: 8000 }))).error?.code, "23514");
  assert.equal((await rpc(family.client, "record_campaign_sale", saleArgs(same, randomUUID(), 5, { p_participant_id: same.otherParticipantId }))).error?.code, "42501");
  console.log("PASS package replay: four overlapping requests produce one $90 sale, one snapshot, and five tickets; underpayment and widened captain scope rejected.");

  const stock = await fixture("package_stock", 10, admin, family);
  const races = await simultaneous(stock, families.map((actor) => () => rpc(actor.client, "record_campaign_sale", saleArgs(stock, randomUUID()))));
  assert.equal(races.filter((result) => !result.error).length, 2);
  assert.equal(races.filter((result) => result.error?.code === "23514").length, 4);
  await verify(stock, admin, family, { sales: 2, collections: 2, issued_events: 10, void_events: 0, net_money: 18000, active_tickets: 10, own_available: 0 });
  console.log("PASS package stock race: six overlapping five-ticket purchases consume exactly ten assigned tickets, no partial bundle issuance.");

  const reverse = await fixture("package_reverse", 10, admin, family);
  const original = requireData(await rpc(family.client, "record_campaign_sale", saleArgs(reverse, randomUUID())), "Original package sale");
  const originalFacts = requireData(await admin.client.from("campaign_sales").select("*").eq("id", original.sale_id).single(), "Original package evidence");
  const reversal = await simultaneous(reverse, admins.map((actor) => () => rpc(actor.client, "reverse_campaign_sale", { p_organization_id: reverse.orgId, p_sale_id: original.sale_id, p_reason: "Concurrent package correction" })));
  assert.equal(new Set(reversal.map((result) => requireData(result, "Concurrent package reversal"))).size, 1);
  const replacement = requireData(await rpc(family.client, "record_campaign_sale", saleArgs(reverse, randomUUID(), 5, { p_corrects_sale_id: original.sale_id })), "Package replacement");
  assert.ok(replacement.ticket_numbers.every((number) => !original.ticket_numbers.includes(number)));
  assert.deepEqual(requireData(await admin.client.from("campaign_sales").select("*").eq("id", original.sale_id).single(), "Preserved package evidence"), originalFacts);
  await verify(reverse, admin, family, { sales: 2, collections: 2, reversals: 1, negative_events: 1, issued_events: 10, void_events: 5, net_money: 9000, active_tickets: 5, own_available: 0 });
  console.log("PASS package reversal race: immutable $90 history, one reversal, and five fresh correction tickets.");

  const close = await fixture("package_close", 5, admin, family);
  const closeKey = randomUUID();
  const [sale, closed] = await simultaneous(close, [
    () => rpc(family.client, "record_campaign_sale", saleArgs(close, closeKey)),
    () => rpc(admin.client, "transition_campaign", { p_campaign_id: close.campaignId, p_to: "CLOSED", p_reason: "Synthetic concurrent package close" }),
  ]);
  assert.equal(requireData(closed, "Package close"), "CLOSED");
  if (sale.error) assert.equal(sale.error.code, "23514");
  else assert.equal(requireData(await rpc(family.client, "record_campaign_sale", saleArgs(close, closeKey)), "Package retry after close").sale_id, sale.data.sale_id);
  assert.equal((await rpc(family.client, "record_campaign_sale", saleArgs(close, randomUUID()))).error?.code, "23514");
  await verify(close, admin, family, { sales: sale.error ? 0 : 1, collections: sale.error ? 0 : 1, net_money: sale.error ? 0 : 9000, active_tickets: sale.error ? 0 : 5 });
  console.log("PASS package close race: sale and cutoff remain atomic; no issuance after closure.");
}
main().catch((error) => { console.error(`Package concurrency failed: ${error.message}`); process.exitCode = 1; });

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
  // The repository seed's family-capable account is also a captain. Tests give
  // it both roles in the new org to exercise the explicit own-family sell path.
  const families = await Promise.all(Array.from({ length: 6 }, () => account("coach@aspire.test")));
  assert.ok(admins.every((actor) => actor.userId === admins[0].userId));
  assert.ok(families.every((actor) => actor.userId === families[0].userId));
  const admin = admins[0], family = families[0];

  const same = await fixture("same_key", 4, admin, family);
  const sameKey = randomUUID();
  const replies = await simultaneous(same, families.slice(0, 4).map((actor) => () => rpc(actor.client, "record_campaign_sale", saleArgs(same, sameKey, 2))));
  const sales = replies.map((result) => requireData(result, "Identical sale race"));
  assert.equal(new Set(sales.map((sale) => sale.sale_id)).size, 1);
  assert.equal(sales.filter((sale) => !sale.replayed).length, 1);
  for (const sale of sales) assert.deepEqual(sale.ticket_numbers, sales[0].ticket_numbers);
  await verify(same, admin, family, { sales: 1, collections: 1, reversals: 0, negative_events: 0, issued_events: 2, void_events: 0, net_money: 400, active_tickets: 2, own_available: 2 });
  const forbidden = await rpc(family.client, "record_campaign_sale", saleArgs(same, randomUUID(), 1, { p_participant_id: same.otherParticipantId }));
  assert.equal(forbidden.error?.code, "42501", "Captain+Family cannot sell for another team player's family.");
  await verify(same, admin, family, { sales: 1, collections: 1, issued_events: 2 });
  console.log("PASS same key: four overlapping sessions, one sale/collection and identical tickets; combined-role scope enforced.");

  const stock = await fixture("stock_race", 3, admin, family);
  const stockResults = await simultaneous(stock, families.map((actor) => () => rpc(actor.client, "record_campaign_sale", saleArgs(stock, randomUUID()))));
  assert.equal(stockResults.filter((result) => !result.error).length, 3);
  assert.equal(stockResults.filter((result) => result.error?.code === "23514").length, 3);
  const issued = stockResults.filter((result) => !result.error).flatMap((result) => result.data.ticket_numbers);
  assert.equal(new Set(issued).size, 3);
  await verify(stock, admin, family, { sales: 3, collections: 3, reversals: 0, negative_events: 0, issued_events: 3, void_events: 0, net_money: 600, active_tickets: 3, own_available: 0 });
  console.log("PASS stock race: six overlapping sessions, three committed sales, three atomic rejections, no overselling.");

  const reverse = await fixture("reverse_race", 4, admin, family);
  const original = requireData(await rpc(family.client, "record_campaign_sale", saleArgs(reverse, randomUUID(), 2)), "Original reversal sale");
  const originalFacts = requireData(await admin.client.from("campaign_sales").select("*").eq("id", original.sale_id).single(), "Original immutable sale fact");
  const originalMoney = requireData(await admin.client.from("money_events").select("*").eq("id", originalFacts.collection_event_id).single(), "Original collection event");
  const reversed = await simultaneous(reverse, admins.map((actor) => () => rpc(actor.client, "reverse_campaign_sale", {
    p_organization_id: reverse.orgId, p_sale_id: original.sale_id, p_reason: "Concurrent duplicate correction",
  })));
  assert.equal(new Set(reversed.map((result) => requireData(result, "Reversal race"))).size, 1);
  await verify(reverse, admin, family, { sales: 1, collections: 1, reversals: 1, negative_events: 1, issued_events: 2, void_events: 2, net_money: 0, active_tickets: 0, own_available: 2 });
  const replacement = requireData(await rpc(family.client, "record_campaign_sale", saleArgs(reverse, randomUUID(), 2, { p_corrects_sale_id: original.sale_id })), "Approved replacement sale");
  assert.ok(replacement.ticket_numbers.every((number) => !original.ticket_numbers.includes(number)), "Voided numbers must never be reused.");
  const voided = requireData(await admin.client.from("tickets").select("ticket_number,status").eq("sale_id", original.sale_id), "Voided tickets");
  assert.equal(voided.length, 2); assert.ok(voided.every((ticket) => ticket.status === "VOIDED"));
  assert.deepEqual(requireData(await admin.client.from("campaign_sales").select("*").eq("id", original.sale_id).single(), "Unchanged original sale"), originalFacts);
  assert.deepEqual(requireData(await admin.client.from("money_events").select("*").eq("id", originalFacts.collection_event_id).single(), "Unchanged original collection"), originalMoney);
  await verify(reverse, admin, family, { sales: 2, collections: 2, reversals: 1, negative_events: 1, issued_events: 4, void_events: 2, net_money: 400, active_tickets: 2, own_available: 0 });
  console.log("PASS reversal race: four overlapping approver sessions, one negative event, immutable originals and fresh replacement numbers.");

  const close = await fixture("close_race", 2, admin, family);
  const closeKey = randomUUID();
  const [saleResult, closeResult] = await simultaneous(close, [
    () => rpc(family.client, "record_campaign_sale", saleArgs(close, closeKey)),
    () => rpc(admin.client, "transition_campaign", { p_campaign_id: close.campaignId, p_to: "CLOSED", p_reason: "Concurrent sales close" }),
  ]);
  assert.equal(requireData(closeResult, "Concurrent close"), "CLOSED");
  const won = !saleResult.error;
  if (!won) assert.equal(saleResult.error.code, "23514", "Sale must be rejected once close wins its row lock.");
  await verify(close, admin, family, { sales: won ? 1 : 0, collections: won ? 1 : 0, reversals: 0, negative_events: 0, issued_events: won ? 1 : 0, void_events: 0, net_money: won ? 200 : 0, active_tickets: won ? 1 : 0, own_available: won ? 1 : 2 });
  if (won) {
    const trail = requireData(await admin.client.from("audit_events").select("chain_pos,action,entity_id,after_data").eq("organization_id", close.orgId), "Close audit ordering");
    const recorded = trail.find((event) => event.action === "SALE_CREATED" && event.entity_id === saleResult.data.sale_id);
    const closed = trail.find((event) => event.action === "CAMPAIGN_STATUS_CHANGED" && event.entity_id === close.campaignId && event.after_data?.status === "CLOSED");
    assert.ok(recorded && closed && Number(recorded.chain_pos) < Number(closed.chain_pos), "A committed sale must precede closure in the audit chain.");
    const replay = requireData(await rpc(family.client, "record_campaign_sale", saleArgs(close, closeKey)), "Retry after close");
    assert.equal(replay.sale_id, saleResult.data.sale_id); assert.equal(replay.replayed, true);
  }
  const afterClose = await rpc(family.client, "record_campaign_sale", saleArgs(close, randomUUID()));
  assert.equal(afterClose.error?.code, "23514");
  await verify(close, admin, family, { sales: won ? 1 : 0, collections: won ? 1 : 0, issued_events: won ? 1 : 0 });
  console.log(`PASS close race: overlapping seller/Director sessions; ${won ? "sale committed before closure" : "close rejected the sale"}; later issuance rejected.`);
  console.log("PASS 4 real concurrency groups; campaign/player/team projections and all ledger/audit chains verified. Disposable fixtures retained for db reset.");
}

main().catch((error) => {
  console.error(`Fundraising concurrency tests failed: ${error.message}`);
  process.exitCode = 1;
});

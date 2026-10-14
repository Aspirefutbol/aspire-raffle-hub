#!/usr/bin/env node
// Real overlapping PostgreSQL sessions against a disposable local Supabase.
// Requires the normal dev seed. Uses user JWTs for every business transaction;
// retains isolated fixtures until the next reset without touching seed rows.
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
  throw new Error("Drawing concurrency tests require the loopback Supabase API on port 54321; remote projects are refused.");
}
if (process.env.NODE_ENV === "production") throw new Error("Drawing concurrency tests refuse NODE_ENV=production.");

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
    let stdout = "", stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    // SQL contains synthetic fixture values and validated UUIDs, never keys/passwords.
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0) reject(new Error(`Local drawing fixture SQL failed (${code}); ${stderr.trim()}`));
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
function expectError(result, code, operation) {
  assert.equal(result.error?.code, code, `${operation} must reject with ${code}.`);
}
async function account(email) {
  const client = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const data = requireData(await client.auth.signInWithPassword({ email, password }), "Seed account sign-in");
  assert.ok(data.user?.id, "Seed sign-in must return a user ID.");
  uuid(data.user.id);
  return { client, userId: data.user.id };
}

// A held campaign lock and its blocker tree prove that every HTTP request has
// reached a separate live PostgreSQL session before releasing the transactions.
async function simultaneous(fixture, actions) {
  const barrier = psql();
  const finished = completion(barrier);
  let pid, output = "";
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Drawing concurrency barrier timed out.")), 10_000);
    barrier.stdout.on("data", (chunk) => {
      output += chunk;
      const match = /lock-ready:(\d+)/.exec(output);
      if (match) {
        pid = Number(match[1]);
        clearTimeout(timer);
        resolve();
      }
    });
    finished.catch((error) => { clearTimeout(timer); reject(error); });
  });
  barrier.stdin.write(`begin; select id from public.campaigns where id=${uuid(fixture.campaignId)} for update;
    select 'lock-ready:' || pg_backend_pid();\n`);
  let pending;
  try {
    await ready;
    assert.ok(Number.isSafeInteger(pid) && pid > 0, "The barrier must provide a valid PostgreSQL PID.");
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
    assert.ok(waiting >= actions.length, `Expected ${actions.length} competing drawing sessions, observed ${waiting}.`);
  } finally {
    barrier.stdin.end("rollback;\n");
    await finished;
  }
  const settled = await pending;
  return settled.map((result) => {
    if (result.status === "rejected") throw new Error("A concurrent drawing request failed before returning an RPC result.");
    return result.value;
  });
}

function saleArgs(fixture) {
  return {
    p_organization_id: fixture.orgId, p_campaign_id: fixture.campaignId,
    p_participant_id: fixture.participantId, p_idempotency_key: fixture.saleKey,
    p_buyer_name: "Synthetic drawing buyer", p_quantity: 1,
    p_amount_cents: PRICE_CENTS, p_payment_method: "cash",
  };
}
function freezeArgs(fixture, key, reason = "Synthetic local drawing readiness approved") {
  return {
    p_organization_id: fixture.orgId, p_campaign_id: fixture.campaignId,
    p_idempotency_key: key, p_reason: reason, p_prize_readiness_confirmed: true,
  };
}
function snapshotArgs(fixture, snapshotId, key, reason) {
  return {
    p_organization_id: fixture.orgId, p_snapshot_id: snapshotId,
    p_idempotency_key: key, p_reason: reason,
  };
}
function reversalArgs(fixture) {
  return {
    p_organization_id: fixture.orgId, p_sale_id: fixture.sale.sale_id,
    p_reason: "Synthetic concurrent reversal approved",
  };
}
function resultArgs(fixture, snapshotId, key, drawnAt) {
  return {
    ...snapshotArgs(fixture, snapshotId, key, "Synthetic external result recorded for local testing"),
    p_drawn_at: drawnAt, p_location: "Disposable local test room", p_operator: "Synthetic test operator",
    p_witnesses: ["Synthetic Witness One"], p_method: "external",
    p_winning_ticket_number: fixture.sale.ticket_numbers[0],
    p_result: "Synthetic test operator supplied the stated winning ticket",
    p_evidence_ref: "https://example.test/drawing-concurrency-synthetic",
  };
}

async function fixture(name, admin, family) {
  const ids = {
    orgId: randomUUID(), campaignId: randomUUID(), teamId: randomUUID(),
    adminMemberId: randomUUID(), familyMemberId: randomUUID(),
    householdId: randomUUID(), guardianId: randomUUID(), playerId: randomUUID(), otherPlayerId: randomUUID(),
    saleKey: randomUUID(),
  };
  const slug = `drawing-${name.replaceAll("_", "-")}-${randomUUID().slice(0, 8)}`;
  assert.match(slug, /^[a-z0-9-]{1,48}$/);
  await sql(`begin;
    select set_config('request.jwt.claims',jsonb_build_object('sub',${uuid(admin.userId)},'role','authenticated')::text,true);
    insert into public.organizations(id,name,legal_name,slug,address_line1,city,region,support_email,jurisdiction_profile)
      values(${uuid(ids.orgId)},'Drawing concurrency fixture','Drawing Fixture Inc','${slug}',
        '100 Test Way','Houston','TX','support@example.test','TEXAS_CREA_OFFLINE_PAYMENT');
    insert into public.organization_members(id,organization_id,user_id) values
      (${uuid(ids.adminMemberId)},${uuid(ids.orgId)},${uuid(admin.userId)}),
      (${uuid(ids.familyMemberId)},${uuid(ids.orgId)},${uuid(family.userId)});
    insert into public.organization_member_roles(organization_id,member_id,role_key) values
      (${uuid(ids.orgId)},${uuid(ids.adminMemberId)},'ORGANIZATION_ADMIN'),
      (${uuid(ids.orgId)},${uuid(ids.adminMemberId)},'DIRECTOR'),
      (${uuid(ids.orgId)},${uuid(ids.familyMemberId)},'PARTICIPANT_FAMILY');
    insert into public.teams(id,organization_id,name) values(${uuid(ids.teamId)},${uuid(ids.orgId)},'Drawing fixture team');
    insert into public.households(id,organization_id,name) values(${uuid(ids.householdId)},${uuid(ids.orgId)},'Drawing fixture household');
    insert into public.guardians(id,organization_id,household_id,first_name,last_name)
      values(${uuid(ids.guardianId)},${uuid(ids.orgId)},${uuid(ids.householdId)},'Synthetic','Guardian');
    insert into public.players(id,organization_id,household_id,first_name,last_name) values
      (${uuid(ids.playerId)},${uuid(ids.orgId)},${uuid(ids.householdId)},'Family','Seller'),
      (${uuid(ids.otherPlayerId)},${uuid(ids.orgId)},null,'Withdrawn','Seller');
    insert into public.team_memberships(organization_id,player_id,team_id) values
      (${uuid(ids.orgId)},${uuid(ids.playerId)},${uuid(ids.teamId)}),
      (${uuid(ids.orgId)},${uuid(ids.otherPlayerId)},${uuid(ids.teamId)});
    insert into public.guardian_user_links(organization_id,guardian_id,member_id)
      values(${uuid(ids.orgId)},${uuid(ids.guardianId)},${uuid(ids.familyMemberId)});
    insert into public.campaigns(id,organization_id,name,starts_at,sales_close_at,draw_at,
      ticket_price_cents,ticket_prefix,rules_text,default_allocation)
      values(${uuid(ids.campaignId)},${uuid(ids.orgId)},'Synthetic drawing concurrency raffle',clock_timestamp()-interval '1 hour',
        clock_timestamp()+interval '30 seconds',clock_timestamp()+interval '31 seconds',${PRICE_CENTS},'DC',
        'Synthetic local drawing rules: issued unreversed tickets remain eligible despite withdrawal or pending turn-in.',4);
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
    p_campaign_id: ids.campaignId, p_to: status, p_reason: "Synthetic local drawing fixture approved",
  }), "Fixture lifecycle transition");
  assert.equal(requireData(await rpc(admin.client, "prepare_campaign_inventory", {
    p_organization_id: ids.orgId, p_campaign_id: ids.campaignId,
  }), "Fixture inventory"), 8);
  ids.sale = requireData(await rpc(family.client, "record_campaign_sale", saleArgs(ids)), "Family fixture sale");
  ids.retainedSale = requireData(await rpc(admin.client, "record_campaign_sale", {
    ...saleArgs(ids), p_participant_id: ids.otherParticipantId, p_idempotency_key: randomUUID(),
    p_buyer_name: "Synthetic unreconciled check buyer", p_payment_method: "check",
  }), "Retained fixture sale");
  assert.equal(ids.sale.replayed, false);
  assert.equal(ids.retainedSale.replayed, false);
  assert.equal(ids.sale.ticket_numbers.length, 1);
  assert.equal(ids.retainedSale.ticket_numbers.length, 1);
  requireData(await rpc(admin.client, "withdraw_campaign_participant", {
    p_organization_id: ids.orgId, p_participant_id: ids.otherParticipantId,
    p_reason: "Synthetic withdrawal preserves the issued unreconciled check ticket",
  }), "Fixture participant withdrawal");
  assert.equal(requireData(await rpc(admin.client, "transition_campaign", {
    p_campaign_id: ids.campaignId, p_to: "CLOSED", p_reason: "Synthetic sales closed for drawing",
  }), "Fixture close"), "CLOSED");
  return ids;
}

async function facts(fixture) {
  return sqlJson(`select jsonb_build_object(
    'status',(select status from public.campaigns where id=${uuid(fixture.campaignId)}),
    'snapshots',(select count(*) from public.drawing_snapshots where campaign_id=${uuid(fixture.campaignId)}),
    'entries',(select count(*) from public.drawing_snapshot_entries where campaign_id=${uuid(fixture.campaignId)}),
    'frozen',(select count(*) from public.drawing_events where campaign_id=${uuid(fixture.campaignId)} and event_type='FROZEN'),
    'reopened',(select count(*) from public.drawing_events where campaign_id=${uuid(fixture.campaignId)} and event_type='REOPENED'),
    'certified',(select count(*) from public.drawing_events where campaign_id=${uuid(fixture.campaignId)} and event_type='CERTIFIED'),
    'results',(select count(*) from public.drawing_results where campaign_id=${uuid(fixture.campaignId)}),
    'reversals',(select count(*) from public.sale_reversals where campaign_id=${uuid(fixture.campaignId)}),
    'negative_events',(select count(*) from public.money_events where campaign_id=${uuid(fixture.campaignId)} and event_type='REVERSAL'),
    'turn_ins',(select count(*) from public.money_events where campaign_id=${uuid(fixture.campaignId)} and event_type='TURN_IN'),
    'issued',(select count(*) from public.tickets where campaign_id=${uuid(fixture.campaignId)} and status='ISSUED'),
    'voided',(select count(*) from public.tickets where campaign_id=${uuid(fixture.campaignId)} and status='VOIDED'),
    'net_money',coalesce((select sum(amount_cents) from public.money_events where campaign_id=${uuid(fixture.campaignId)} and event_type in ('SALE_COLLECTED','REVERSAL')),0),
    'ticket_head',(select max(chain_pos) from public.ticket_events where campaign_id=${uuid(fixture.campaignId)}),
    'money_head',(select max(chain_pos) from public.money_events where campaign_id=${uuid(fixture.campaignId)}),
    'audit_head',(select max(chain_pos) from public.audit_events where organization_id=${uuid(fixture.orgId)})
  );`);
}
async function verify(fixture, snapshot, admin, expected) {
  const stored = await facts(fixture);
  for (const [field, value] of Object.entries(expected)) assert.equal(stored[field], value, `Committed drawing ${field} disagrees with the race outcome.`);
  assert.equal(stored.status, "CLOSED", "Drawing operations must not automatically mark a campaign DRAWN.");
  assert.equal(stored.turn_ins, 0, "Fixture eligibility must include money still held by sellers.");
  const header = requireData(await admin.client.from("drawing_snapshots").select("id,version,ticket_count,total_face_value_cents,manifest_hash")
    .eq("id", snapshot.snapshot_id).eq("organization_id", fixture.orgId).single(), "Frozen header");
  assert.equal(header.id, snapshot.snapshot_id);
  assert.equal(header.version, snapshot.version);
  assert.equal(Number(header.ticket_count), snapshot.count);
  assert.equal(Number(header.total_face_value_cents), snapshot.count * PRICE_CENTS);
  assert.equal(header.manifest_hash, snapshot.manifest_hash);
  assert.match(header.manifest_hash, /^[a-f0-9]{64}$/);
  const entries = requireData(await admin.client.from("drawing_snapshot_entries")
    .select("ticket_number,participant_id,face_value_cents").eq("snapshot_id", snapshot.snapshot_id).order("sequence_number"), "Frozen population");
  assert.equal(entries.length, snapshot.count);
  assert.equal(new Set(entries.map((entry) => entry.ticket_number)).size, entries.length);
  assert.ok(entries.every((entry) => Number(entry.face_value_cents) === PRICE_CENTS));
  assert.deepEqual(entries.map((entry) => entry.ticket_number).sort(),
    (snapshot.count === 2 ? [...fixture.sale.ticket_numbers, ...fixture.retainedSale.ticket_numbers] : fixture.retainedSale.ticket_numbers).slice().sort(),
    "Frozen entries must contain the exact issued, unreversed fixture population.");
  assert.ok(entries.some((entry) => entry.participant_id === fixture.otherParticipantId
    && entry.ticket_number === fixture.retainedSale.ticket_numbers[0]), "Withdrawal and pending check turn-in must not remove an issued ticket.");
  const integrity = requireData(await rpc(admin.client, "verify_drawing_snapshot", {
    p_organization_id: fixture.orgId, p_snapshot_id: snapshot.snapshot_id,
  }), "Drawing integrity");
  assert.equal(integrity.snapshot_id, snapshot.snapshot_id);
  for (const field of ["ok", "count_ok", "entries_ok", "manifest_ok", "source_anchors_ok", "ledger_chains_ok", "audit_anchor_ok"]) {
    assert.equal(integrity[field], true, `Snapshot ${field} must verify after the concurrency operation.`);
  }
  const ledger = requireData(await rpc(admin.client, "verify_campaign_ledgers", { p_campaign_id: fixture.campaignId }), "Campaign ledgers");
  assert.equal(ledger.length, 3);
  assert.ok(ledger.every((row) => row.ok === true && row.first_bad_pos == null));
  const audit = requireData(await rpc(admin.client, "verify_audit_chain", { p_organization_id: fixture.orgId }), "Organization audit chain");
  assert.equal(audit.length, 1);
  assert.equal(audit[0].ok, true);
  assert.equal(Number(audit[0].rows_checked), stored.audit_head);
  return { stored, entries };
}

// Honor the production chronology with a real short timeline. The database
// supplies its current time; the only wait is a bounded Node timer, never a
// changed date, disabled guard, fake clock, or pg_sleep inside a transaction.
async function waitForDisclosedDraw(fixtures) {
  const timing = await sqlJson(`select jsonb_build_object('server_now',clock_timestamp(),'draw_at',max(draw_at))
    from public.campaigns where id in (${fixtures.map((item) => uuid(item.campaignId)).join(",")});`);
  const delay = Math.max(0, Math.ceil(Date.parse(timing.draw_at) - Date.parse(timing.server_now)) + 20);
  assert.ok(delay <= 31_000, "The synthetic disclosed drawing wait must stay within 31 seconds.");
  if (delay) {
    console.log(`Waiting ${(delay / 1000).toFixed(1)} seconds for the disclosed local drawing dates.`);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}
async function evidenceTime(fixture, snapshotId) {
  const timing = await sqlJson(`select jsonb_build_object('now',clock_timestamp(),'draw_at',c.draw_at,'frozen_at',s.created_at)
    from public.campaigns c join public.drawing_snapshots s on s.campaign_id=c.id
    where c.id=${uuid(fixture.campaignId)} and s.id=${uuid(snapshotId)};`);
  assert.ok(Date.parse(timing.now) >= Date.parse(timing.draw_at), "Evidence must follow the disclosed drawing date.");
  assert.ok(Date.parse(timing.now) >= Date.parse(timing.frozen_at), "Evidence must follow the frozen snapshot.");
  return timing.now;
}

async function main() {
  // Reuse two signed-in clients. Concurrent requests obtain separate database
  // sessions, which the barrier observer independently proves for each race.
  const [admin, family] = await Promise.all([account("admin@aspire.test"), account("coach@aspire.test")]);
  const [same, reverse, reopen, certify] = await Promise.all(
    ["same_key", "reverse_race", "reopen_race", "certify_race"].map((name) => fixture(name, admin, family)));

  const freezeKey = randomUUID();
  const identical = await simultaneous(same, Array.from({ length: 4 }, () => () => rpc(admin.client, "freeze_drawing", freezeArgs(same, freezeKey))));
  const snapshots = identical.map((result) => requireData(result, "Identical freeze race"));
  assert.equal(new Set(snapshots.map((snapshot) => snapshot.snapshot_id)).size, 1);
  assert.equal(snapshots.filter((snapshot) => snapshot.replayed === false).length, 1);
  assert.equal(snapshots.filter((snapshot) => snapshot.replayed === true).length, 3);
  const frozen = snapshots[0];
  uuid(frozen.snapshot_id);
  assert.equal(frozen.version, 1);
  assert.equal(frozen.count, 2);
  for (const snapshot of snapshots) {
    assert.equal(snapshot.manifest_hash, frozen.manifest_hash);
    assert.equal(snapshot.count, frozen.count);
    assert.equal(snapshot.version, frozen.version);
  }
  await verify(same, frozen, admin, { snapshots: 1, entries: 2, frozen: 1, reopened: 0, certified: 0, results: 0, reversals: 0, issued: 2, voided: 0, net_money: 400 });
  const beforeDenied = await facts(same);
  expectError(await rpc(admin.client, "freeze_drawing", freezeArgs(same, freezeKey, "Changed freeze reason")), "23505", "Changed freeze retry");
  expectError(await rpc(admin.client, "freeze_drawing", freezeArgs(same, randomUUID())), "23514", "Second current freeze");
  expectError(await rpc(family.client, "freeze_drawing", freezeArgs(same, randomUUID())), "42501", "Family freeze");
  expectError(await rpc(family.client, "verify_drawing_snapshot", { p_organization_id: same.orgId, p_snapshot_id: frozen.snapshot_id }), "42501", "Family drawing verification");
  expectError(await rpc(admin.client, "verify_drawing_snapshot", { p_organization_id: same.orgId, p_snapshot_id: randomUUID() }), "P0002", "Missing snapshot verification");
  const replay = requireData(await rpc(family.client, "record_campaign_sale", saleArgs(same)), "Committed sale replay after freeze");
  assert.equal(replay.sale_id, same.sale.sale_id);
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.ticket_numbers, same.sale.ticket_numbers);
  assert.deepEqual(await facts(same), beforeDenied, "Rejected and replayed requests must not append any drawing, financial, or audit records.");
  console.log("PASS same-key freeze: four overlapping sessions, one immutable population and FROZEN event, three exact replays.");

  const [freezeResult, reversalResult] = await simultaneous(reverse, [
    () => rpc(admin.client, "freeze_drawing", freezeArgs(reverse, randomUUID())),
    () => rpc(admin.client, "reverse_campaign_sale", reversalArgs(reverse)),
  ]);
  const raceSnapshot = requireData(freezeResult, "Freeze/reversal race freeze");
  assert.equal(raceSnapshot.replayed, false);
  const reversedFirst = !reversalResult.error;
  if (reversedFirst) uuid(requireData(reversalResult, "Reversal before freeze"));
  else expectError(reversalResult, "23514", "Reversal after freeze");
  assert.equal(raceSnapshot.count, reversedFirst ? 1 : 2);
  const reversalFacts = await verify(reverse, raceSnapshot, admin, {
    snapshots: 1, entries: reversedFirst ? 1 : 2, frozen: 1, reopened: 0, certified: 0, results: 0,
    reversals: reversedFirst ? 1 : 0, negative_events: reversedFirst ? 1 : 0,
    issued: reversedFirst ? 1 : 2, voided: reversedFirst ? 1 : 0, net_money: reversedFirst ? 200 : 400,
  });
  assert.equal(reversalFacts.entries.some((entry) => entry.ticket_number === reverse.sale.ticket_numbers[0]), !reversedFirst,
    "The frozen population must follow the winner of the campaign row lock.");
  if (reversedFirst) assert.equal(requireData(await rpc(admin.client, "reverse_campaign_sale", reversalArgs(reverse)), "Committed reversal replay after freeze"), reversalResult.data);
  expectError(await rpc(admin.client, "reverse_campaign_sale", {
    ...reversalArgs(reverse), p_sale_id: reverse.retainedSale.sale_id,
  }), "23514", "New reversal while drawing frozen");
  assert.deepEqual(await facts(reverse), reversalFacts.stored, "Freeze must make a rejected reversal entirely atomic.");
  console.log(`PASS freeze/reversal: overlapping sessions; ${reversedFirst ? "reversal committed first and its ticket is excluded" : "freeze committed first and reversal fully rolled back"}.`);

  const reopenSnapshot = requireData(await rpc(admin.client, "freeze_drawing", freezeArgs(reopen, randomUUID())), "Reopen fixture freeze");
  const certifySnapshot = requireData(await rpc(admin.client, "freeze_drawing", freezeArgs(certify, randomUUID())), "Certification fixture freeze");
  await waitForDisclosedDraw([reopen, certify]);

  const reopening = snapshotArgs(reopen, reopenSnapshot.snapshot_id, randomUUID(), "Synthetic Director reopens before external evidence");
  const recording = resultArgs(reopen, reopenSnapshot.snapshot_id, randomUUID(), await evidenceTime(reopen, reopenSnapshot.snapshot_id));
  const [reopenResult, externalResult] = await simultaneous(reopen, [
    () => rpc(admin.client, "reopen_drawing", reopening),
    () => rpc(admin.client, "record_external_drawing_result", recording),
  ]);
  assert.equal([reopenResult, externalResult].filter((result) => !result.error).length, 1,
    "Reopening and recording external evidence cannot both commit.");
  const reopenedFirst = !reopenResult.error;
  const winningOperation = requireData(reopenedFirst ? reopenResult : externalResult, "Reopen/evidence race winner");
  assert.equal(winningOperation.snapshot_id, reopenSnapshot.snapshot_id);
  assert.equal(winningOperation.replayed, false);
  expectError(reopenedFirst ? externalResult : reopenResult, "23514", "Reopen/evidence race loser");
  const reopenedFacts = await verify(reopen, reopenSnapshot, admin, {
    snapshots: 1, entries: 2, frozen: 1, reopened: reopenedFirst ? 1 : 0,
    certified: 0, results: reopenedFirst ? 0 : 1, reversals: 0, issued: 2, voided: 0,
  });
  if (reopenedFirst) {
    const reopenedReplay = requireData(await rpc(admin.client, "reopen_drawing", reopening), "Committed reopen replay");
    assert.equal(reopenedReplay.event_id, winningOperation.event_id);
    assert.equal(reopenedReplay.replayed, true);
    expectError(await rpc(admin.client, "record_external_drawing_result", { ...recording, p_idempotency_key: randomUUID() }), "23514", "New result after reopen");
  } else {
    const resultReplay = requireData(await rpc(admin.client, "record_external_drawing_result", recording), "Committed external result replay");
    assert.equal(resultReplay.result_id, winningOperation.result_id);
    assert.equal(resultReplay.replayed, true);
    expectError(await rpc(admin.client, "reopen_drawing", { ...reopening, p_idempotency_key: randomUUID() }), "23514", "New reopen after result");
  }
  assert.deepEqual(await facts(reopen), reopenedFacts.stored, "State-denied and exact retry requests must leave the winning state unchanged.");
  console.log(`PASS reopen/evidence: overlapping sessions; ${reopenedFirst ? "reopen committed and external result rejected" : "external result committed and reopen rejected"}.`);

  const certificateRecording = resultArgs(certify, certifySnapshot.snapshot_id, randomUUID(), await evidenceTime(certify, certifySnapshot.snapshot_id));
  const external = requireData(await rpc(admin.client, "record_external_drawing_result", certificateRecording), "Certification external evidence");
  uuid(external.result_id);
  assert.equal(external.replayed, false);
  const certification = snapshotArgs(certify, certifySnapshot.snapshot_id, randomUUID(), "Synthetic Director certification approved");
  const certificates = (await simultaneous(certify, Array.from({ length: 2 }, () => () => rpc(admin.client, "certify_drawing", certification))))
    .map((result) => requireData(result, "Identical certification race"));
  assert.equal(new Set(certificates.map((result) => result.event_id)).size, 1);
  assert.equal(certificates.filter((result) => result.replayed === false).length, 1);
  assert.equal(certificates.filter((result) => result.replayed === true).length, 1);
  assert.ok(certificates.every((result) => result.snapshot_id === certifySnapshot.snapshot_id));
  const certifiedFacts = await verify(certify, certifySnapshot, admin, {
    snapshots: 1, entries: 2, frozen: 1, reopened: 0, certified: 1, results: 1,
    reversals: 0, negative_events: 0, issued: 2, voided: 0, net_money: 400,
  });
  expectError(await rpc(admin.client, "certify_drawing", { ...certification, p_reason: "Changed certification reason" }), "23505", "Changed certification retry");
  expectError(await rpc(family.client, "certify_drawing", certification), "42501", "Family certification");
  expectError(await rpc(admin.client, "record_external_drawing_result", { ...certificateRecording, p_idempotency_key: randomUUID() }), "23514", "New result after certification");
  expectError(await rpc(admin.client, "reopen_drawing", snapshotArgs(certify, certifySnapshot.snapshot_id, randomUUID(), "Forbidden reopen after certification")), "23514", "Reopen after certification");
  const finalResultReplay = requireData(await rpc(admin.client, "record_external_drawing_result", certificateRecording), "Committed evidence replay after certification");
  assert.equal(finalResultReplay.result_id, external.result_id);
  assert.equal(finalResultReplay.replayed, true);
  assert.deepEqual(await facts(certify), certifiedFacts.stored, "Certification retries and denied transitions cannot append duplicate facts.");
  console.log("PASS certification: two overlapping Director sessions, one CERTIFIED event and one replay; campaign stays CLOSED.");
  console.log("PASS 4 real drawing concurrency groups; withdrawn/unreconciled eligibility, snapshot hashes, source anchors, and ledger/audit chains verified. Isolated fixtures retained for db reset.");
}

main().catch((error) => {
  console.error(`Drawing concurrency tests failed: ${error.message}`);
  process.exitCode = 1;
});

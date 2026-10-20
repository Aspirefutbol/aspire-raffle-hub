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
  const lockTable = fixture.requestId ? "seller_interest_requests" : "campaigns";
  const lockId = fixture.requestId ?? fixture.campaignId;
  barrier.stdin.write(`begin; select id from public.${lockTable} where id=${uuid(lockId)} for update;
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

async function main() {
 const admin=await account('admin@aspire.test'), family=await account('coach@aspire.test');
 const f=await fixture('sharing',10,admin,family);
 const args={p_organization_id:f.orgId,p_participant_id:f.participantId};
 const rotate=()=>rpc(family.client,'manage_seller_link',args);
 const rotated=await simultaneous(f,[rotate,rotate,rotate]);
 const tokens=rotated.map(r=>requireData(r,'Rotate').token);
 assert.equal(new Set(tokens).size,3);
 assert.equal(Number(await sql(`select count(*) from public.campaign_seller_links where campaign_id=${uuid(f.campaignId)} and revoked_at is null;`)),1);
 const publicClient=createClient(url,publicKey,{auth:{persistSession:false,autoRefreshToken:false}});
 let token;
 for(const t of tokens) if(requireData(await rpc(publicClient,'public_seller_page',{p_token:t}),'Page')) token=t;
 assert.ok(token);
 console.log('PASS concurrent link rotation: one active link; distinct tokens and retained revoked history.');
 const submission={p_token:token,p_submission_key:randomUUID(),p_request:{name:'Concurrent supporter',email:'request@example.test',contact:'email',quantity:2}};
 await simultaneous(f,Array.from({length:4},()=>()=>rpc(publicClient,'submit_seller_interest_request',submission)));
 const inbox=requireData(await rpc(family.client,'seller_request_inbox',{p_organization_id:f.orgId,p_campaign_id:f.campaignId}),'Inbox');
 assert.equal(inbox.length,1);
 console.log('PASS concurrent request retries: one request and one initial event.');
 const requestId=inbox[0].id;
 const statusArgs={p_organization_id:f.orgId,p_request_id:requestId,p_status:'contacted'};
 const statuses=await simultaneous({...f,requestId},Array.from({length:3},()=>()=>rpc(family.client,'update_seller_request_status',statusArgs)));
 statuses.forEach(r=>requireData(r,'Status retry'));
 assert.equal(Number(await sql(`select count(*) from public.seller_request_events where request_id=${uuid(requestId)};`)),2);
 console.log('PASS concurrent status retries: three blocked sessions append one contacted event.');
 const terminal=await simultaneous({...f,requestId},['declined','expired'].map(status=>()=>rpc(family.client,'update_seller_request_status',{...statusArgs,p_status:status})));
 assert.equal(terminal.filter(r=>!r.error).length,1);
 assert.equal(terminal.filter(r=>r.error?.code==='23514').length,1);
 assert.equal(Number(await sql(`select count(*) from public.seller_request_events where request_id=${uuid(requestId)};`)),3);
 console.log('PASS terminal status race: one outcome wins, immutable history cannot be rewritten.');

 const results=await simultaneous(f,[()=>rpc(publicClient,'submit_seller_interest_request',{...submission,p_submission_key:randomUUID(),p_request:{...submission.p_request,name:'Race supporter'}}),()=>rpc(family.client,'manage_seller_link',{...args,p_revoke:true})]);
 results.forEach(r=>requireData(r,'Revoke/submit race'));
 assert.equal(requireData(await rpc(publicClient,'public_seller_page',{p_token:token}),'Revoked page'),null);
 const totals=await sqlJson(`select jsonb_build_object('sales',(select count(*) from public.campaign_sales where campaign_id=${uuid(f.campaignId)}),'issued',(select count(*) from public.tickets where campaign_id=${uuid(f.campaignId)} and status='ISSUED'),'money',(select count(*) from public.money_events where campaign_id=${uuid(f.campaignId)}));`);
 assert.deepEqual(totals,{sales:0,issued:0,money:0});
 const chains=requireData(await rpc(admin.client,'verify_campaign_ledgers',{p_campaign_id:f.campaignId}),'Chains');
 assert.ok(chains.every(x=>x.ok));
 console.log('PASS revoke/submit race: no post-revocation access; no sales, issuance or money events.');
}
main().catch(()=>{console.error('Sharing concurrency failed; inspect local fixture state.');process.exitCode=1;});

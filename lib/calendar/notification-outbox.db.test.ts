import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/*
 * Batch 2A outbox concurrency on the DISPOSABLE local Supabase database (CI).
 * Separate psql sessions give real concurrency: refund vs claim/ack/enqueue, the audit
 * advisory lock, concurrent approvals and randomized interleavings. Synthetic data only;
 * every run uses fresh ids. Refuses any non-local database.
 *
 * Evidence, not proof: "no deadlock observed" across these schedules (proposal §17.1).
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const socket = process.env.DOCKER_HOST ?? "unix:///var/run/docker.sock";
const RUN = randomUUID().slice(0, 8);

type Result = { code: number; stdout: string; stderr: string; ms: number };

function psql(commands: string[], timeoutMs = 60_000): Promise<Result> {
  const args = ["--host", socket, "exec", "supabase_db_aspire-raffle-hub", "psql", "-U", "postgres", "-d", "postgres",
    "-AtX", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose"];
  for (const c of commands) args.push("-c", c);
  const started = Date.now();
  return new Promise((resolve) => {
    execFile("docker", args, { encoding: "utf8", timeout: timeoutMs, maxBuffer: 8_000_000 }, (error, stdout, stderr) => {
      resolve({ code: error ? (typeof error.code === "number" ? error.code : 1) : 0, stdout: stdout.trim(), stderr, ms: Date.now() - started });
    });
  });
}
async function ok(commands: string[]) {
  const r = await psql(commands);
  if (r.code !== 0) throw new Error(`psql failed: ${r.stderr}`);
  return r.stdout;
}
const sqlstate = (r: Result) => /ERROR:\s+([0-9A-Z]{5}):/.exec(r.stderr)?.[1] ?? null;
const lastLine = (s: string) => {
  const lines = s.split("\n").filter(Boolean);
  return lines[lines.length - 1] ?? "";
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;
function id(key: string) {
  const h = createHash("md5").update(`outbox-conc:${RUN}:${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
const ORG = id("org");
const CAMPAIGN = id("campaign");
const claims = (user: string, aal = "aal2") =>
  `select set_config('request.jwt.claims', ${lit(JSON.stringify({ sub: id(`user-${user}`), role: "authenticated", aal }))}, false)`;
const participant = (player: string) =>
  `(select id from public.campaign_participants where campaign_id = ${lit(CAMPAIGN)} and player_id = ${lit(id(player))})`;
const resId = (label: string) =>
  `(select r.id from calendar_private.reservations r where r.request_key = ${lit(id(`rk-${label}`))})`;
const keyOf = (label: string) => `(select key from calendar_private.notification_outbox where reservation_id = ${resId(label)})`;
// Intent built from the PAID record exactly as Batch 1 prepares it; digests via the SQL canonical functions.
const intent = (label: string) => `(select jsonb_build_object('key', x.k, 'kind', 'calendar_donor_confirmation', 'mode', 'test',
  'organizationId', r.organization_id, 'campaignId', r.campaign_id, 'participantId', r.participant_id, 'reservationId', r.id,
  'recipient', r.supporter_email, 'language', r.supporter_language,
  'facts', jsonb_build_object('currency', 'usd', 'days', to_jsonb(x.days), 'multiplier', r.multiplier, 'baseCents', r.base_cents,
    'additionalImpactCents', r.additional_impact_cents, 'totalCents', r.total_cents),
  'templateVersion', 'calendar-donor-confirmation/2026-11-07.1', 'subject', 'Thank you', 'text', 'Thank you.', 'html', '<p>Thank you.</p>',
  'factsDigest', calendar_private.outbox_sha256_hex(calendar_private.outbox_facts_canonical(x.k, r.organization_id, r.campaign_id,
    r.participant_id, r.id, r.supporter_email, r.supporter_language, x.days, r.multiplier, r.base_cents, r.additional_impact_cents, r.total_cents)),
  'contentDigest', calendar_private.outbox_sha256_hex(calendar_private.outbox_content_canonical(
    'calendar-donor-confirmation/2026-11-07.1', 'Thank you', 'Thank you.', '<p>Thank you.</p>')))
  from calendar_private.reservations r,
  lateral (select 'calendar:test:' || r.organization_id || ':' || r.id || ':donor-confirmation:v1' as k,
                  array(select d from unnest(r.days) d order by d) as days) x
  where r.id = ${resId(label)})`;
const enqueue = (label: string) => `select calendar_private.enqueue_donor_confirmation(${intent(label)})->>'status'`;
// Only the row under test is due; everything else in this organization is parked.
const onlyDue = (label: string) => [
  `update calendar_private.notification_outbox set next_attempt_at = clock_timestamp() + interval '1 day'
     where state = 'PENDING' and reservation_id <> ${resId(label)}`,
  `update calendar_private.notification_outbox set next_attempt_at = clock_timestamp() - interval '1 second'
     where state = 'PENDING' and reservation_id = ${resId(label)}`,
];
const claim = (worker = "worker-c", account = "acct-test-1") =>
  `select calendar_private.claim_donor_confirmation(${lit(worker)}, ${lit(account)})`;
const refundOpen = (label: string, holdSeconds: number) => [
  "begin",
  `select 1 from calendar_private.reservations where id = ${resId(label)} for no key update`,
  `select pg_sleep(${holdSeconds})`,
  `update calendar_private.reservations set status = 'REFUNDED' where id = ${resId(label)}`,
  "commit",
];

const LABELS = Array.from({ length: 40 }, (_, i) => `p${i}`);
let policyBefore = "";

describe.skipIf(!url)("Batch 2A outbox concurrency on disposable local DB", () => {
  beforeAll(async () => {
    if (!url || !["localhost", "127.0.0.1"].includes(new URL(url).hostname)) throw new Error("Outbox concurrency tests refuse hosted databases.");
    if (!/^unix:\/\/\/[^\s?#\0]+$/.test(socket)) throw new Error("Only a local Docker socket is permitted.");
    const users = ["a-admin", "rev-1", "rev-2", "rev-3", "appointer"];
    await ok([
      `insert into auth.users(id, email, email_confirmed_at) values ${users.map((u) => `(${lit(id(`user-${u}`))}, ${lit(`${u}-${RUN}@example.test`)}, now())`).join(", ")}`,
      `insert into public.organizations(id, name, slug, legal_name, jurisdiction_profile, address_line1, city, region, support_email, platform_config)
       values (${lit(ORG)}, 'Outbox Concurrency TEST', ${lit(`outbox-conc-${RUN}`)}, 'Outbox Concurrency TEST', 'TEXAS_CREA_OFFLINE_PAYMENT',
               '1 Testing Way', 'Houston', 'TX', 'conc@example.test', '{"texas_crea_compliance_required":false}'::jsonb)`,
      `insert into public.organization_members(id, organization_id, user_id) values ${users.map((u) => `(${lit(id(`member-${u}`))}, ${lit(ORG)}, ${lit(id(`user-${u}`))})`).join(", ")}`,
      `insert into public.organization_member_roles(organization_id, member_id, role_key) values
         (${lit(ORG)}, ${lit(id("member-a-admin"))}, 'ORGANIZATION_ADMIN'), (${lit(ORG)}, ${lit(id("member-a-admin"))}, 'DIRECTOR')`,
      `insert into public.households(id, organization_id, name) values (${lit(id("house"))}, ${lit(ORG)}, 'Synthetic Family')`,
      `insert into public.players(id, organization_id, household_id, first_name, last_name) values
         (${lit(id("player-1"))}, ${lit(ORG)}, ${lit(id("house"))}, 'Ana', 'Sample'), (${lit(id("player-2"))}, ${lit(ORG)}, ${lit(id("house"))}, 'Leo', 'Sample')`,
      `insert into public.campaigns(id, organization_id, name, campaign_type, ticket_price_cents, ticket_prefix, starts_at, sales_close_at, draw_at, support_email, description)
       values (${lit(CAMPAIGN)}, ${lit(ORG)}, 'Outbox Concurrency Calendar TEST', 'calendar', 100, 'OBXCONC', now() - interval '1 day',
               now() + interval '10 days', now() + interval '11 days', 'conc@example.test', 'Synthetic test only')`,
      "set role authenticated",
      claims("a-admin", "aal1"),
      `select public.enroll_campaign_players(${lit(ORG)}, ${lit(CAMPAIGN)}, true)`,
      `select public.transition_campaign(${lit(CAMPAIGN)}, 'READY')`,
      `select public.transition_campaign(${lit(CAMPAIGN)}, 'ACTIVE', 'Synthetic outbox concurrency test')`,
      "reset role",
      `insert into calendar_private.campaign_config(campaign_id, organization_id, mode, enabled) values (${lit(CAMPAIGN)}, ${lit(ORG)}, 'supporter_choice', true)`,
      `do $$ declare v integer;
       begin
         if calendar_private.outbox_active_fingerprint_key_version() is null then
           select coalesce(max(version), 0) + 1 into v from calendar_private.notification_fingerprint_keys;
           perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'base64'), 'calendar_outbox_fp_v' || v);
           insert into calendar_private.notification_fingerprint_keys(version, vault_secret_name, activated_at)
             values (v, 'calendar_outbox_fp_v' || v, clock_timestamp());
         end if;
       end $$`,
      `insert into calendar_private.notification_reviewer_events (organization_id, user_id, event_type, basis, expires_at, actor_user_id, reason_code)
       values ${["rev-1", "rev-2", "rev-3"].map((u) => `(${lit(ORG)}, ${lit(id(`user-${u}`))}, 'GRANTED', 'org_member', now() + interval '30 days', ${lit(id("user-appointer"))}, 'synthetic_test')`).join(", ")}`,
    ]);
    // 40 real PAID reservations through the reviewed reserve -> attach -> settle path.
    const paid = LABELS.map((label, i) => {
      const player = i < 20 ? "player-1" : "player-2";
      const day = (i % 20) + 1;
      const email = `donor-${label}-${RUN}@example.test`;
      const session = `cs_test_conc_${RUN}_${label}`;
      return `do $$ declare r jsonb; v uuid; begin
        r := calendar_private.reserve(${lit(ORG)}, ${lit(CAMPAIGN)}, ${participant(player)}, ${lit(id(`rk-${label}`))}, array[${day}], 1, 'Synthetic Supporter', ${lit(email)});
        v := (r->>'id')::uuid;
        perform calendar_private.attach_test_checkout(v, ${lit(session)}, clock_timestamp() + interval '45 minutes');
        perform calendar_private.confirm_test_checkout_paid(v, ${lit(session)}, ${lit(`evt_conc_${RUN}_${label}`)}, (r->>'total_cents')::bigint);
        update calendar_private.reservations set supporter_language = ${i % 10 === 9 ? "null" : "'en'"} where id = v;
      end $$`;
    });
    await ok([claims("a-admin", "aal1"), ...paid,
      `insert into calendar_private.test_recipient_allowlist(organization_id, recipient)
       select ${lit(ORG)}, supporter_email from calendar_private.reservations where organization_id = ${lit(ORG)}`]);
    policyBefore = await ok([`select row_to_json(p)::text from calendar_private.notification_policy p`]);
  }, 180_000);

  afterAll(async () => {
    if (!url || !policyBefore) return;
    const p = JSON.parse(policyBefore);
    await psql([`update calendar_private.notification_policy set provider_idempotency_window = ${lit(p.provider_idempotency_window)}::interval,
      idempotency_safety_margin = ${lit(p.idempotency_safety_margin)}::interval, lease_interval = ${lit(p.lease_interval)}::interval`]);
  });

  it("C1: 20 concurrent enqueues of one reservation create exactly one row", async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => psql([enqueue("p0")])));
    expect(results.map((r) => r.code)).toEqual(Array(20).fill(0));
    const statuses = results.map((r) => lastLine(r.stdout)).sort();
    expect(statuses.filter((s) => s === "queued")).toHaveLength(1);
    expect(statuses.filter((s) => s === "already_queued")).toHaveLength(19);
    expect(await ok([`select count(*) from calendar_private.notification_outbox where reservation_id = ${resId("p0")}`])).toBe("1");
  }, 120_000);

  it("C2: 10 concurrent claims never release the same row twice", async () => {
    await ok([enqueue("p1"), ...onlyDue("p1"),
      `update calendar_private.notification_outbox set next_attempt_at = clock_timestamp() - interval '1 second' where reservation_id = ${resId("p0")}`]);
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => psql([claim(`w${i}`)])));
    expect(results.map((r) => r.code)).toEqual(Array(10).fill(0));
    const keys = results.map((r) => lastLine(r.stdout)).filter(Boolean).map((j) => JSON.parse(j).key as string);
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(2);
  }, 120_000);

  it("C4: a stale acknowledgement loses to the re-claimed lease", async () => {
    await ok([`update calendar_private.notification_policy set provider_idempotency_window = '24 hours', idempotency_safety_margin = '1 hour', lease_interval = '2 minutes'`]);
    await ok([enqueue("p2"), ...onlyDue("p2")]);
    const first = JSON.parse(lastLine(await ok([claim("w-old")])));
    await ok([`update calendar_private.notification_outbox set lease_expires_at = clock_timestamp() - interval '1 second' where reservation_id = ${resId("p2")}`,
      `select calendar_private.expire_donor_confirmation_leases()`, ...onlyDue("p2")]);
    const second = JSON.parse(lastLine(await ok([claim("w-new")])));
    expect(second.leaseId).not.toBe(first.leaseId);
    const ack = (lease: string, msg: string) => psql([`select calendar_private.acknowledge_donor_confirmation(${lit(first.key)}, ${lit(lease)}::uuid, 'accepted', ${lit(msg)})->>'state'`]);
    const [stale, current] = await Promise.all([ack(first.leaseId, "msg_stale"), ack(second.leaseId, "msg_current")]);
    expect(sqlstate(stale)).toBe("23514");
    expect(stale.stderr).toContain("STALE_LEASE");
    expect(lastLine(current.stdout)).toBe("SENT");
    await ok([`update calendar_private.notification_policy set provider_idempotency_window = '0', idempotency_safety_margin = '1 hour'`]);
  }, 120_000);

  it("R2/R3: a refund holding the reservation lock never blocks claim; the race is flagged at ack", async () => {
    await ok([enqueue("p3"), ...onlyDue("p3")]);
    const refund = psql(refundOpen("p3", 3));
    await sleep(700);
    const c = await psql(["set lock_timeout = '2s'", claim("w-r2")]);
    expect(c.code, c.stderr).toBe(0);
    expect(c.ms).toBeLessThan(2_500);
    const claimed = JSON.parse(lastLine(c.stdout));
    expect((await refund).code).toBe(0);
    const ack = await ok([`select calendar_private.acknowledge_donor_confirmation(${lit(claimed.key)}, ${lit(claimed.leaseId)}::uuid, 'accepted', 'msg_r3')->>'sentAfterRefund'`]);
    expect(lastLine(ack)).toBe("true");
  }, 120_000);

  it("R6: enqueue waits for an open refund and then refuses the refunded reservation", async () => {
    const refund = psql(refundOpen("p4", 2));
    await sleep(500);
    const e = await psql([enqueue("p4")]);
    expect((await refund).code).toBe(0);
    expect(e.ms).toBeGreaterThan(1_000);
    expect(sqlstate(e)).toBe("23514");
    expect(e.stderr).toContain("SCOPE_MISMATCH");
    expect(e.stderr).not.toMatch(/40P01|deadlock/i);
  }, 120_000);

  it("R9: a reviewer decision waits for the organization's audit lock and then completes", async () => {
    await ok([enqueue("p5"), ...onlyDue("p5")]);
    const c = JSON.parse(lastLine(await ok([claim("w-r9")])));
    await ok([`select calendar_private.acknowledge_donor_confirmation(${lit(c.key)}, ${lit(c.leaseId)}::uuid, 'unknown')`]);
    const holder = psql(["begin",
      `insert into public.audit_events (organization_id, action, entity_type, metadata) values (${lit(ORG)}, 'CALENDAR_TEST_LOCK', 'calendar_test', '{}')`,
      "select pg_sleep(2)", "commit"]);
    await sleep(500);
    const decision = await psql([claims("rev-1"),
      `select calendar_private.resolve_donor_confirmation(${lit(c.key)}, 'abandon', 'donor_contacted_directly', 'internal_record', 'TICKET-R9', 1)->>'state'`]);
    expect((await holder).code).toBe(0);
    expect(decision.code, decision.stderr).toBe(0);
    expect(lastLine(decision.stdout)).toBe("DEAD_LETTER");
    expect(decision.ms).toBeGreaterThan(1_000);
  }, 120_000);

  it("C5: two different reviewers approving the same restart at once — exactly one wins", async () => {
    await ok([enqueue("p6"), ...onlyDue("p6")]);
    const c = JSON.parse(lastLine(await ok([claim("w-c5")])));
    await ok([`select calendar_private.acknowledge_donor_confirmation(${lit(c.key)}, ${lit(c.leaseId)}::uuid, 'unknown')`]);
    await ok([claims("rev-1"), `select calendar_private.resolve_donor_confirmation(${lit(c.key)}, 'provider_confirmed_not_accepted',
      'provider_reports_not_accepted', 'provider_api_lookup', 'LOOKUP-C5', 1, null, true)`]);
    const request = await ok([`select restart_request_id from calendar_private.notification_outbox where key = ${lit(c.key)}`]);
    const approve = (u: string) => psql([claims(u), `select calendar_private.approve_epoch_restart(${lit(c.key)}, ${lit(lastLine(request))}::uuid, 1, true, true)->>'state'`]);
    const [a, b] = await Promise.all([approve("rev-2"), approve("rev-3")]);
    const wins = [a, b].filter((r) => r.code === 0);
    const losses = [a, b].filter((r) => r.code !== 0);
    expect(wins).toHaveLength(1);
    expect(lastLine(wins[0]!.stdout)).toBe("PENDING");
    expect(sqlstate(losses[0]!)).toBe("23514");
    expect(await ok([`select count(*) from calendar_private.notification_events where key = ${lit(c.key)} and event_type = 'RESTART_APPROVED'`])).toBe("1");
    expect(await ok([`select count(*) from calendar_private.verify_notification_audit_coverage(${lit(ORG)})`])).toBe("0");
  }, 120_000);

  it("N4: calendar functions refuse to run outside READ COMMITTED", async () => {
    const r = await psql(["begin isolation level repeatable read", claim("w-iso"), "commit"]);
    expect(sqlstate(r)).toBe("25000");
    expect(r.stderr).toContain("INVALID_TRANSITION");
  }, 60_000);

  it("R8: 200 randomized interleavings — no deadlock observed, invariants hold", async () => {
    const pool = LABELS.slice(10);
    await ok(pool.filter((_, i) => i % 10 !== 9).map((l) => enqueue(l)));
    const before = Number(await ok([`select count(*) from calendar_private.notification_outbox where organization_id = ${lit(ORG)}`]));
    const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)] as T;
    const ops: Array<(label: string) => string[]> = [
      (l: string) => [enqueue(l)],
      () => [`update calendar_private.notification_outbox set next_attempt_at = clock_timestamp() - interval '1 second'
               where organization_id = ${lit(ORG)} and state = 'PENDING'`, claim(`w-${randomUUID().slice(0, 6)}`)],
      () => [`select calendar_private.expire_donor_confirmation_leases()`],
      (l: string) => [`select calendar_private.acknowledge_donor_confirmation(k, lease_id, ${lit(pick(["accepted", "unknown", "rejected_retryable"]))}, 'msg_r8')
               from (select key k, lease_id from calendar_private.notification_outbox where reservation_id = ${resId(l)} and state = 'SENDING') s`],
      (l: string) => ["begin", `select 1 from calendar_private.reservations where id = ${resId(l)} for no key update`,
               "select pg_sleep(0.05)", `update calendar_private.reservations set status = 'REFUNDED' where id = ${resId(l)}`, "commit"],
      (l: string) => [claims("rev-1"), `select calendar_private.record_supporter_language(${resId(l)}, 'es', 'donor_statement', 'CALL-R8')`],
      (l: string) => [claims("rev-1"), `select calendar_private.resolve_donor_confirmation(${keyOf(l)}, 'abandon', 'donor_contacted_directly', 'internal_record', 'TICKET-R8', 1)`],
      () => [`update calendar_private.notification_outbox set updated_at = updated_at where false`, `select calendar_private.purge_donor_confirmation_payloads()`],
    ];
    const deadlocks: string[] = [];
    const unexpected: string[] = [];
    for (let i = 0; i < 200; i++) {
      const batch = await Promise.all(Array.from({ length: 4 }, () => psql(pick(ops)(pick(pool)), 30_000)));
      for (const r of batch) {
        if (/40P01|deadlock detected/i.test(r.stderr)) deadlocks.push(r.stderr);
        const s = sqlstate(r);
        if (r.code !== 0 && s && !["23514", "42501", "55000", "23505"].includes(s)) unexpected.push(r.stderr);
      }
    }
    expect(deadlocks, deadlocks.join("\n---\n")).toEqual([]);
    expect(unexpected, unexpected.join("\n---\n")).toEqual([]);
    const after = Number(await ok([`select count(*) from calendar_private.notification_outbox where organization_id = ${lit(ORG)}`]));
    expect(after).toBeGreaterThanOrEqual(before);
    expect(await ok([`select count(*) from (select key, epoch, attempt from calendar_private.notification_events
      where organization_id = ${lit(ORG)} and event_type = 'CLAIMED' group by 1, 2, 3 having count(*) > 1) d`])).toBe("0");
    expect(await ok([`select count(*) from (select key from calendar_private.notification_events
      where organization_id = ${lit(ORG)} and event_type = 'ACCEPTED' group by key having count(*) > 1) d`])).toBe("0");
    expect(await ok([`select count(*) from calendar_private.verify_notification_audit_coverage(${lit(ORG)})`])).toBe("0");
  }, 600_000);
});

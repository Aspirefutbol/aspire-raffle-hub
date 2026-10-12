#!/usr/bin/env node
// DEVELOPMENT-ONLY seed data for Raffle Hub.
//
// Creates demo organizations, users, teams, households, guardians and players so
// the UI can be exercised. All people and contact details are fictional.
//
// Usage:  npm run seed:dev          (reads .env.local)
// Needs:  NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (service role).
//
// Safety: refuses to run when NODE_ENV=production, and refuses non-local
// Supabase URLs unless --allow-remote-dev is passed explicitly. It never
// deletes data; if the demo organization already exists it stops.

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.SEED_PASSWORD ?? "RaffleHub!dev1";

function fail(message) {
  console.error(`seed-dev: ${message}`);
  process.exit(1);
}

if (process.env.NODE_ENV === "production") fail("refusing to seed with NODE_ENV=production.");
if (!url || !serviceKey) fail("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set.");
const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url);
if (!isLocal && !process.argv.includes("--allow-remote-dev")) {
  fail(`${url} is not local. Pass --allow-remote-dev only for a dedicated development project.`);
}

const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function must(promise, what) {
  const { data, error } = await promise;
  if (error) fail(`${what}: ${error.message}`);
  return data;
}

async function ensureUser(email, fullName) {
  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (!error) return data.user.id;
  if (!/already been registered|already exists/i.test(error.message)) fail(`create user ${email}: ${error.message}`);
  const list = await must(db.auth.admin.listUsers({ page: 1, perPage: 1000 }), "list users");
  const existing = list.users.find((u) => u.email === email);
  if (!existing) fail(`user ${email} exists but could not be found`);
  return existing.id;
}

async function seedOrganization({ org, members, season, teams, households, players }) {
  const existing = await must(db.from("organizations").select("id").eq("slug", org.slug).maybeSingle(), "lookup org");
  if (existing) {
    console.log(`• ${org.name} already exists — skipping (seed never overwrites).`);
    return;
  }

  const { id: orgId } = await must(db.from("organizations").insert(org).select("id").single(), "insert organization");

  const memberIds = {};
  for (const m of members) {
    const userId = await ensureUser(m.email, m.fullName);
    const member = await must(
      db.from("organization_members").insert({ organization_id: orgId, user_id: userId }).select("id").single(),
      `add member ${m.email}`,
    );
    await must(
      db.from("organization_member_roles").insert(m.roles.map((role_key) => ({ organization_id: orgId, member_id: member.id, role_key }))),
      `grant roles to ${m.email}`,
    );
    await must(db.from("profiles").update({ last_organization_id: orgId }).eq("id", userId), "set last org");
    memberIds[m.email] = member.id;
  }

  const { id: seasonId } = await must(
    db.from("seasons").insert({ organization_id: orgId, ...season, is_current: true }).select("id").single(),
    "insert season",
  );

  const teamIds = {};
  for (const t of teams) {
    const row = await must(
      db.from("teams").insert({ organization_id: orgId, season_id: seasonId, gender_division: "boys", ...t }).select("id").single(),
      `insert team ${t.name}`,
    );
    teamIds[t.name] = row.id;
  }

  const householdIds = {};
  const guardianIds = {};
  for (const h of households) {
    const row = await must(
      db.from("households").insert({ organization_id: orgId, name: h.name }).select("id").single(),
      `insert household ${h.name}`,
    );
    householdIds[h.key] = row.id;
    for (const [index, g] of h.guardians.entries()) {
      const { key, ...fields } = g;
      const gRow = await must(
        db
          .from("guardians")
          .insert({ organization_id: orgId, household_id: row.id, is_primary_contact: index === 0, ...fields })
          .select("id")
          .single(),
        `insert guardian ${g.first_name}`,
      );
      guardianIds[key] = gRow.id;
    }
  }

  for (const p of players) {
    const { team, household, guardians = [], ...fields } = p;
    const row = await must(
      db
        .from("players")
        .insert({ organization_id: orgId, household_id: household ? householdIds[household] : null, ...fields })
        .select("id")
        .single(),
      `insert player ${p.first_name} ${p.last_name}`,
    );
    if (team) {
      await must(
        db.from("team_memberships").insert({ organization_id: orgId, player_id: row.id, team_id: teamIds[team] }),
        "insert membership",
      );
    }
    for (const [index, g] of guardians.entries()) {
      await must(
        db.from("player_guardians").insert({
          organization_id: orgId,
          player_id: row.id,
          guardian_id: guardianIds[g.key],
          relationship: g.relationship,
          is_primary: index === 0,
        }),
        "link guardian",
      );
    }
  }

  // Scoped access: captain → teams, family account → guardian record.
  for (const m of members) {
    for (const team of m.teams ?? []) {
      await must(
        db.from("team_staff_assignments").insert({ organization_id: orgId, team_id: teamIds[team], member_id: memberIds[m.email] }),
        `assign ${m.email} to ${team}`,
      );
    }
    if (m.familyGuardian) {
      await must(
        db.from("guardian_user_links").insert({ organization_id: orgId, guardian_id: guardianIds[m.familyGuardian], member_id: memberIds[m.email] }),
        `link ${m.email} to guardian ${m.familyGuardian}`,
      );
    }
  }

  console.log(`✓ ${org.name}: ${teams.length} teams, ${households.length} households, ${players.length} players`);
}

// ---------------------------------------------------------------------------

const superAdminEmail = "superadmin@rafflehub.test";
const superAdminId = await ensureUser(superAdminEmail, "Platform Operator");
await must(db.from("platform_admins").upsert({ user_id: superAdminId }), "grant super admin");

await seedOrganization({
  org: {
    name: "Aspire Sports Group",
    legal_name: "Aspire Sports Group",
    slug: "aspire",
    organization_type: "sports_club",
    timezone: "America/Chicago",
    address_line1: "100 Example Way (dev placeholder)",
    city: "Houston",
    region: "TX",
    postal_code: "77000",
    support_email: "support@aspire.test",
    jurisdiction_profile: "TEXAS_CREA_OFFLINE_PAYMENT",
  },
  members: [
    { email: "admin@aspire.test", fullName: "Alex Admin", roles: ["ORGANIZATION_ADMIN", "DIRECTOR"] },
    { email: "auditor@aspire.test", fullName: "Avery Auditor", roles: ["AUDITOR"] },
    // Multi-role example: a parent who is also a team manager.
    // Captain of U13 Boys only; also the parent account for the Smith household (guardian Dana).
    { email: "coach@aspire.test", fullName: "Casey Coach", roles: ["TEAM_CAPTAIN", "PARTICIPANT_FAMILY"], teams: ["U13 Boys"], familyGuardian: "dana" },
  ],
  season: { name: "2026–27", starts_on: "2026-08-01", ends_on: "2027-07-31" },
  teams: [
    { name: "U13 Boys", age_group: "U13", coach_name: "Coach Rivera", team_code: "U13B" },
    { name: "U14 Boys", age_group: "U14", coach_name: "Coach Chen", team_code: "U14B" },
    { name: "U15 Boys", age_group: "U15", coach_name: "Coach Adeyemi", team_code: "U15B" },
    { name: "U16 Boys", age_group: "U16", coach_name: "Coach Walsh", team_code: "U16B" },
    { name: "U17 Boys", age_group: "U17", coach_name: "Coach Moreno", team_code: "U17B" },
    { name: "U19 Boys", age_group: "U19", coach_name: "Coach Fischer", team_code: "U19B" },
  ],
  households: [
    {
      key: "garcia",
      name: "Garcia Household",
      guardians: [
        { key: "maria", first_name: "Maria", last_name: "Garcia", email: "maria.garcia@example.test", phone: "(713) 555-0101" },
        { key: "luis", first_name: "Luis", last_name: "Garcia", phone: "(713) 555-0102" },
      ],
    },
    {
      key: "johnson",
      name: "Johnson Household",
      guardians: [{ key: "sarah", first_name: "Sarah", last_name: "Johnson", email: "sarah.johnson@example.test" }],
    },
    {
      key: "nguyen",
      name: "Nguyen Household",
      guardians: [{ key: "linh", first_name: "Linh", last_name: "Nguyen", email: "linh.nguyen@example.test", phone: "(281) 555-0110" }],
    },
    {
      key: "okafor",
      name: "Okafor Household",
      guardians: [{ key: "grace", first_name: "Grace", last_name: "Okafor", email: "grace.okafor@example.test" }],
    },
    {
      key: "smith",
      name: "Smith Household",
      // Deliberately missing contact info → shows in Action Needed.
      guardians: [{ key: "dana", first_name: "Dana", last_name: "Smith" }],
    },
    {
      key: "patel",
      name: "Patel Household",
      guardians: [
        { key: "priya", first_name: "Priya", last_name: "Patel", email: "priya.patel@example.test", phone: "(832) 555-0120" },
        { key: "raj", first_name: "Raj", last_name: "Patel", email: "raj.patel@example.test" },
      ],
    },
    {
      key: "williams",
      name: "Williams Household",
      guardians: [{ key: "keisha", first_name: "Keisha", last_name: "Williams", phone: "(713) 555-0130" }],
    },
    {
      key: "rossi",
      name: "Rossi Household",
      // No guardians yet → missing contact.
      guardians: [],
    },
  ],
  players: [
    { first_name: "Mateo", last_name: "Garcia", date_of_birth: "2013-04-12", gender: "male", team: "U13 Boys", household: "garcia",
      guardians: [{ key: "maria", relationship: "mother" }, { key: "luis", relationship: "father" }] },
    { first_name: "Diego", last_name: "Garcia", date_of_birth: "2010-09-03", gender: "male", team: "U16 Boys", household: "garcia",
      guardians: [{ key: "maria", relationship: "mother" }, { key: "luis", relationship: "father" }] },
    { first_name: "Ethan", last_name: "Johnson", date_of_birth: "2012-02-20", gender: "male", team: "U14 Boys", household: "johnson",
      external_player_id: "ASG-1001", guardians: [{ key: "sarah", relationship: "mother" }] },
    { first_name: "Ryan", last_name: "Nguyen", date_of_birth: "2011-06-15", gender: "male", team: "U15 Boys", household: "nguyen",
      guardians: [{ key: "linh", relationship: "mother" }] },
    { first_name: "Daniel", last_name: "Okafor", date_of_birth: "2009-11-30", gender: "male", team: "U17 Boys", household: "okafor",
      guardians: [{ key: "grace", relationship: "mother" }] },
    { first_name: "Samuel", last_name: "Okafor", date_of_birth: "2007-08-08", gender: "male", team: "U19 Boys", household: "okafor",
      guardians: [{ key: "grace", relationship: "mother" }] },
    { first_name: "Liam", last_name: "Smith", date_of_birth: "2013-01-05", gender: "male", team: "U13 Boys", household: "smith",
      guardians: [{ key: "dana", relationship: "parent" }] },
    { first_name: "Arjun", last_name: "Patel", preferred_name: "AJ", date_of_birth: "2010-03-22", gender: "male", team: "U16 Boys",
      household: "patel", guardians: [{ key: "priya", relationship: "mother" }, { key: "raj", relationship: "father" }] },
    { first_name: "Marco", last_name: "Rossi", date_of_birth: "2007-12-01", gender: "male", team: "U19 Boys", household: "rossi" },
    // Twins: same DOB and household, different first names — must NOT be flagged as duplicates.
    { first_name: "Noah", last_name: "Williams", date_of_birth: "2012-05-17", gender: "male", team: "U14 Boys", household: "williams",
      guardians: [{ key: "keisha", relationship: "mother" }] },
    { first_name: "Jacob", last_name: "Williams", date_of_birth: "2012-05-17", gender: "male", team: "U14 Boys", household: "williams",
      guardians: [{ key: "keisha", relationship: "mother" }] },
    { first_name: "Lucas", last_name: "Brown", date_of_birth: "2011-10-10", gender: "male", team: "U15 Boys" },
    { first_name: "Gabriel", last_name: "Lopez", date_of_birth: "2009-07-04", gender: "male", team: "U17 Boys" },
    { first_name: "Isaac", last_name: "Martinez", date_of_birth: "2013-03-14", gender: "male", team: "U13 Boys" },
    { first_name: "Aiden", last_name: "Thomas", date_of_birth: "2010-01-25", gender: "male", team: "U16 Boys" },
    { first_name: "Elijah", last_name: "Moore", date_of_birth: "2008-02-11", gender: "male", team: "U19 Boys" },
    // Unassigned players → Action Needed.
    { first_name: "Owen", last_name: "Davis", date_of_birth: "2012-09-09", gender: "male" },
    { first_name: "Caleb", last_name: "Wilson", gender: "male" },
    // Possible duplicate of Ethan Johnson (no DOB, no team).
    { first_name: "Ethan", last_name: "Johnson", gender: "male" },
  ],
});

// A second tenant to demonstrate isolation: Aspire's admin must never see it.
await seedOrganization({
  org: {
    name: "Northside Youth Soccer",
    slug: "northside",
    organization_type: "nonprofit",
    timezone: "America/New_York",
  },
  members: [{ email: "admin@northside.test", fullName: "Nora Northside", roles: ["ORGANIZATION_ADMIN", "DIRECTOR"] }],
  season: { name: "2026", starts_on: "2026-01-01", ends_on: "2026-12-31" },
  teams: [{ name: "U12 Girls", age_group: "U12", gender_division: "girls", team_code: "U12G" }],
  households: [],
  players: [
    { first_name: "Zoe", last_name: "Park", team: "U12 Girls" },
    { first_name: "Mia", last_name: "Hughes", team: "U12 Girls" },
  ],
});

console.log(`
Development accounts (password: ${password})
  ${superAdminEmail.padEnd(28)} SUPER_ADMIN (all organizations)
  ${"admin@aspire.test".padEnd(28)} ORGANIZATION_ADMIN + DIRECTOR — Aspire Sports Group
  ${"auditor@aspire.test".padEnd(28)} AUDITOR (read-only) — Aspire Sports Group
  ${"coach@aspire.test".padEnd(28)} TEAM_CAPTAIN (U13 Boys) + PARTICIPANT_FAMILY (Smith household) — Aspire Sports Group
  ${"admin@northside.test".padEnd(28)} ORGANIZATION_ADMIN + DIRECTOR — Northside Youth Soccer
`);

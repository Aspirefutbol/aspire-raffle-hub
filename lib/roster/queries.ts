import "server-only";
import { cache } from "react";
import type { OrgContext } from "@/lib/auth/org-context";
import { can } from "@/lib/auth/org-context";
import type { Tables } from "@/lib/database/types.gen";
import { createClient } from "@/lib/supabase/server";

export const PAGE_SIZE = 50;

type QueryResult = { data: unknown; error: { message: string } | null };

/** For list queries: throws on error, returns the (non-null) rows. */
function unwrap<R extends QueryResult>(result: R, what: string): NonNullable<R["data"]> {
  if (result.error) throw new Error(`Could not load ${what}: ${result.error.message}`);
  return result.data as NonNullable<R["data"]>;
}

/** For maybeSingle(): throws on error, returns the row or null. */
function unwrapMaybe<R extends QueryResult>(result: R, what: string): R["data"] {
  if (result.error) throw new Error(`Could not load ${what}: ${result.error.message}`);
  return result.data;
}

/** Escapes user input for PostgREST ilike patterns. */
function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`).replace(/[,()]/g, " ")}%`;
}

// ── Seasons & teams ──────────────────────────────────────────────────────────

export type Season = Pick<Tables<"seasons">, "id" | "name" | "is_current" | "starts_on" | "ends_on" | "archived_at">;

export const listSeasons = cache(async (orgId: string): Promise<Season[]> => {
  const supabase = await createClient();
  return unwrap(
    await supabase
      .from("seasons")
      .select("id, name, is_current, starts_on, ends_on, archived_at")
      .eq("organization_id", orgId)
      .order("is_current", { ascending: false })
      .order("starts_on", { ascending: false, nullsFirst: false }),
    "seasons",
  );
});

export type TeamRow = Tables<"teams"> & { season_name: string | null; player_count: number };

export async function listTeams(
  orgId: string,
  opts: { includeArchived?: boolean; seasonId?: string | null; q?: string } = {},
): Promise<TeamRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("teams")
    .select("*, seasons(name)")
    .eq("organization_id", orgId)
    .order("name");
  if (!opts.includeArchived) query = query.is("archived_at", null);
  if (opts.seasonId) query = query.eq("season_id", opts.seasonId);
  if (opts.q) query = query.ilike("name", likePattern(opts.q));

  const [teams, memberships] = await Promise.all([
    query,
    supabase.from("team_memberships").select("team_id").eq("organization_id", orgId).is("ended_at", null),
  ]);
  const counts = new Map<string, number>();
  for (const m of unwrap(memberships, "team memberships")) counts.set(m.team_id, (counts.get(m.team_id) ?? 0) + 1);

  return unwrap(teams, "teams").map(({ seasons, ...t }) => ({
    ...t,
    season_name: seasons?.name ?? null,
    player_count: counts.get(t.id) ?? 0,
  }));
}

/** Compact list for pickers (active teams, current season first). */
export const listTeamOptions = cache(async (orgId: string) => {
  const teams = await listTeams(orgId);
  return teams
    .filter((t) => t.status === "active")
    .map((t) => ({ value: t.id, label: t.season_name ? `${t.name} · ${t.season_name}` : t.name, name: t.name, team_code: t.team_code, season_id: t.season_id }));
});

export async function getTeam(orgId: string, teamId: string) {
  const supabase = await createClient();
  const team = unwrapMaybe(
    await supabase.from("teams").select("*, seasons(name)").eq("organization_id", orgId).eq("id", teamId).maybeSingle(),
    "team",
  );
  if (!team) return null;
  const players = unwrap(
    await supabase
      .from("player_directory")
      .select("id, first_name, last_name, preferred_name, date_of_birth, status, household_name, primary_guardian_name, primary_guardian_email, primary_guardian_phone")
      .eq("organization_id", orgId)
      .eq("team_id", teamId)
      .is("archived_at", null)
      .order("last_name")
      .order("first_name"),
    "team players",
  );
  return { team, players };
}

// ── Players ──────────────────────────────────────────────────────────────────

export type PlayerIssue = "unassigned" | "no-guardian" | "duplicates";
export type PlayerStatusFilter = "active" | "inactive" | "archived" | "all";

export interface PlayerFilters {
  q?: string;
  team?: string; // team id or "none"
  season?: string;
  status?: PlayerStatusFilter;
  issue?: PlayerIssue;
  importId?: string;
  page?: number;
}

export type DirectoryRow = Tables<"player_directory">;

export async function listPlayers(orgId: string, filters: PlayerFilters) {
  const supabase = await createClient();
  const page = Math.max(1, filters.page ?? 1);

  let query = supabase
    .from("player_directory")
    .select("*", { count: "exact" })
    .eq("organization_id", orgId)
    .order("last_name")
    .order("first_name")
    .order("id")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const status = filters.status ?? "active";
  if (status === "archived") query = query.not("archived_at", "is", null);
  else if (status !== "all") query = query.is("archived_at", null).eq("status", status);

  if (filters.q) query = query.ilike("search_text", likePattern(filters.q.toLowerCase()));
  if (filters.team === "none") query = query.is("team_id", null);
  else if (filters.team) query = query.eq("team_id", filters.team);
  if (filters.season) query = query.eq("season_id", filters.season);
  if (filters.importId) query = query.eq("source_import_id", filters.importId);

  let duplicateReasons = new Map<string, string>();
  if (filters.issue === "unassigned") query = query.is("team_id", null);
  if (filters.issue === "no-guardian") query = query.is("primary_guardian_id", null);
  if (filters.issue === "duplicates") {
    const pairs = await listDuplicatePairs(orgId);
    duplicateReasons = new Map(pairs.flatMap((p) => [[p.player_a_id, p.reason], [p.player_b_id, p.reason]]));
    query = query.in("id", duplicateReasons.size ? [...duplicateReasons.keys()] : ["00000000-0000-0000-0000-000000000000"]);
  }

  const { data, count, error } = await query;
  if (error) throw new Error(`Could not load players: ${error.message}`);
  return { rows: data ?? [], total: count ?? 0, page, pageSize: PAGE_SIZE, duplicateReasons };
}

export async function listDuplicatePairs(orgId: string) {
  const supabase = await createClient();
  return unwrap(await supabase.rpc("possible_duplicate_players", { p_organization_id: orgId }), "possible duplicates");
}

export async function getPlayerProfile(ctx: OrgContext, playerId: string) {
  const supabase = await createClient();
  const orgId = ctx.organization.id;
  const player = unwrapMaybe(
    await supabase.from("player_directory").select("*").eq("organization_id", orgId).eq("id", playerId).maybeSingle(),
    "player",
  );
  if (!player) return null;

  const [guardians, history, activity] = await Promise.all([
    supabase
      .from("player_guardians")
      .select("relationship, is_primary, guardians(id, first_name, last_name, email, phone, household_id, is_primary_contact, communication_preferences, archived_at)")
      .eq("player_id", playerId)
      .order("is_primary", { ascending: false })
      .order("created_at"),
    supabase
      .from("team_memberships")
      .select("id, started_at, ended_at, end_reason, teams(id, name, seasons(name))")
      .eq("player_id", playerId)
      .order("started_at", { ascending: false }),
    can(ctx, "audit.read")
      ? supabase
          .from("audit_events")
          .select("id, action, occurred_at, changed_fields, metadata, actor_id")
          .eq("organization_id", orgId)
          .eq("entity_id", playerId)
          .order("occurred_at", { ascending: false })
          .limit(25)
      : Promise.resolve({ data: [], error: null }),
  ]);

  return {
    player,
    guardians: unwrap(guardians, "guardians").flatMap((g) =>
      g.guardians && !g.guardians.archived_at ? [{ ...g.guardians, relationship: g.relationship, is_primary: g.is_primary }] : [],
    ),
    history: unwrap(history, "team history"),
    activity: unwrap(activity, "activity"),
  };
}

// ── Households & guardians ───────────────────────────────────────────────────

export type HouseholdIssue = "no-contact";

export async function listHouseholds(orgId: string, filters: { q?: string; issue?: HouseholdIssue; page?: number; archived?: boolean }) {
  const supabase = await createClient();
  const page = Math.max(1, filters.page ?? 1);
  let query = supabase
    .from("households")
    .select(
      "id, name, city, region, archived_at, created_at, players!players_household_id_organization_id_fkey(id, first_name, last_name, preferred_name, archived_at), guardians!guardians_household_id_organization_id_fkey(id, first_name, last_name, email, phone, is_primary_contact, archived_at)",
      { count: "exact" },
    )
    .eq("organization_id", orgId)
    .order("name")
    .order("id");
  query = filters.archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  if (filters.q) query = query.ilike("name", likePattern(filters.q));

  const { data, error } = await query;
  if (error) throw new Error(`Could not load households: ${error.message}`);

  // Contact completeness is derived, so filter + paginate after shaping.
  const shaped = (data ?? []).map((h) => {
    const guardians = h.guardians.filter((g) => !g.archived_at);
    const players = h.players.filter((p) => !p.archived_at);
    return {
      ...h,
      guardians,
      players,
      hasContact: guardians.some((g) => g.email || g.phone),
      primary: guardians.find((g) => g.is_primary_contact) ?? guardians[0] ?? null,
    };
  });
  const filtered = filters.issue === "no-contact" ? shaped.filter((h) => !h.hasContact) : shaped;
  return {
    rows: filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    total: filtered.length,
    page,
    pageSize: PAGE_SIZE,
  };
}

export async function getHousehold(orgId: string, householdId: string) {
  const supabase = await createClient();
  const household = unwrapMaybe(
    await supabase.from("households").select("*").eq("organization_id", orgId).eq("id", householdId).maybeSingle(),
    "household",
  );
  if (!household) return null;
  const [players, guardians] = await Promise.all([
    supabase
      .from("player_directory")
      .select("id, first_name, last_name, preferred_name, date_of_birth, team_name, status, archived_at")
      .eq("household_id", householdId)
      .order("first_name"),
    supabase
      .from("guardians")
      .select("*, player_guardians(player_id, relationship, is_primary)")
      .eq("household_id", householdId)
      .is("archived_at", null)
      .order("is_primary_contact", { ascending: false })
      .order("created_at"),
  ]);
  return { household, players: unwrap(players, "household players"), guardians: unwrap(guardians, "guardians") };
}

/** Small lists for pickers in sheets. */
export async function listHouseholdOptions(orgId: string) {
  const supabase = await createClient();
  const rows = unwrap(
    await supabase.from("households").select("id, name").eq("organization_id", orgId).is("archived_at", null).order("name").limit(2000),
    "households",
  );
  return rows.map((h) => ({ value: h.id, label: h.name }));
}

export async function searchGuardians(orgId: string, q: string) {
  const supabase = await createClient();
  const pattern = likePattern(q.trim());
  return unwrap(
    await supabase
      .from("guardians")
      .select("id, first_name, last_name, email, phone, household_id, households(name)")
      .eq("organization_id", orgId)
      .is("archived_at", null)
      .or(`first_name.ilike.${pattern},last_name.ilike.${pattern},email.ilike.${pattern}`)
      .order("last_name")
      .limit(10),
    "guardians",
  );
}

export async function searchPlayers(orgId: string, q: string, opts: { withoutHousehold?: boolean; withoutTeam?: boolean } = {}) {
  const supabase = await createClient();
  let query = supabase
    .from("player_directory")
    .select("id, first_name, last_name, preferred_name, team_name, household_name")
    .eq("organization_id", orgId)
    .is("archived_at", null)
    .order("last_name")
    .limit(15);
  if (q.trim()) query = query.ilike("search_text", likePattern(q.trim().toLowerCase()));
  if (opts.withoutHousehold) query = query.is("household_id", null);
  if (opts.withoutTeam) query = query.is("team_id", null);
  return unwrap(await query, "players");
}

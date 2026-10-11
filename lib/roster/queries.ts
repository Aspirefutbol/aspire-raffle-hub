import "server-only";
import { cache } from "react";
import type { OrgContext } from "@/lib/auth/org-context";
import { can } from "@/lib/auth/org-context";
import type { Tables } from "@/lib/database/types.gen";
import { fetchAll } from "@/lib/supabase/fetch-all";
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
  const [teams, counts] = await Promise.all([
    fetchAll((from, to) => {
      let query = supabase
        .from("teams")
        .select("*, seasons(name)")
        .eq("organization_id", orgId)
        .order("name")
        .order("id");
      if (!opts.includeArchived) query = query.is("archived_at", null);
      if (opts.seasonId) query = query.eq("season_id", opts.seasonId);
      if (opts.q) query = query.ilike("name", likePattern(opts.q));
      return query.range(from, to);
    }),
    // Counted in SQL: one row per team, never truncated by max_rows.
    fetchAll((from, to) => supabase.rpc("team_player_counts", { p_organization_id: orgId }).range(from, to)),
  ]);
  const countByTeam = new Map(counts.map((c) => [c.team_id, Number(c.player_count)]));

  return teams.map(({ seasons, ...t }) => ({
    ...t,
    season_name: seasons?.name ?? null,
    player_count: countByTeam.get(t.id) ?? 0,
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

  if (filters.issue === "unassigned") query = query.is("team_id", null);
  if (filters.issue === "no-guardian") query = query.is("primary_guardian_id", null);
  if (filters.issue === "duplicates") return listDuplicatePlayers(orgId, page);

  const { data, count, error } = await query;
  if (error) throw new Error(`Could not load players: ${error.message}`);
  return { rows: data ?? [], total: count ?? 0, page, pageSize: PAGE_SIZE, pairs: [] as DuplicatePair[] };
}

export const DUPLICATE_PAGE_SIZE = 25;
export type DuplicatePair = { player_a_id: string; player_b_id: string; reason: string };

/** Duplicate review is paginated by pair in SQL; only this page's players are loaded. */
async function listDuplicatePlayers(orgId: string, page: number) {
  const supabase = await createClient();
  const result = unwrap(
    await supabase.rpc("list_possible_duplicates", {
      p_organization_id: orgId,
      p_limit: DUPLICATE_PAGE_SIZE,
      p_offset: (page - 1) * DUPLICATE_PAGE_SIZE,
    }),
    "possible duplicates",
  ) as { total: number; pairs: { a: string; b: string; reason: string }[] };
  const pairs: DuplicatePair[] = result.pairs.map((p) => ({ player_a_id: p.a, player_b_id: p.b, reason: p.reason }));
  const ids = [...new Set(pairs.flatMap((p) => [p.player_a_id, p.player_b_id]))];
  const rows = ids.length
    ? unwrap(await supabase.from("player_directory").select("*").eq("organization_id", orgId).in("id", ids), "players")
    : [];
  return { rows, total: result.total, page, pageSize: DUPLICATE_PAGE_SIZE, pairs };
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

type HouseholdListRow = {
  id: string;
  name: string;
  city: string | null;
  region: string | null;
  archived_at: string | null;
  has_contact: boolean;
  players: { id: string; first_name: string; last_name: string; preferred_name: string | null }[];
  guardians: { id: string; first_name: string; last_name: string; email: string | null; phone: string | null; is_primary_contact: boolean }[];
};

/** Filtering (including derived contact completeness), counting and paging all happen in SQL. */
export async function listHouseholds(orgId: string, filters: { q?: string; issue?: HouseholdIssue; page?: number; archived?: boolean }) {
  const supabase = await createClient();
  const page = Math.max(1, filters.page ?? 1);
  const result = unwrap(
    await supabase.rpc("list_households", {
      p_organization_id: orgId,
      p_q: filters.q ?? undefined,
      p_issue: filters.issue ?? undefined,
      p_archived: Boolean(filters.archived),
      p_limit: PAGE_SIZE,
      p_offset: (page - 1) * PAGE_SIZE,
    }),
    "households",
  ) as { total: number; rows: HouseholdListRow[] };
  return {
    rows: result.rows.map((h) => ({
      ...h,
      hasContact: h.has_contact,
      primary: h.guardians.find((g) => g.is_primary_contact) ?? h.guardians[0] ?? null,
    })),
    total: result.total,
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

/** Household search for pickers (replaces loading every household into a <select>). */
export async function searchHouseholds(orgId: string, q: string) {
  const supabase = await createClient();
  let query = supabase.from("households").select("id, name, city").eq("organization_id", orgId).is("archived_at", null).order("name").limit(15);
  if (q.trim()) query = query.ilike("name", likePattern(q.trim()));
  return unwrap(await query, "households");
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

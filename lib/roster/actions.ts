"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionResult, describeDbError, fail, ok, orgAction } from "@/lib/actions";
import { pluralize } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { id, idList, optionalId, optionalText } from "@/lib/validation";
import { RELATIONSHIPS } from "./constants";
import {
  createGuardianSchema,
  createPlayerSchema,
  householdInputSchema,
  teamInputSchema,
  updateGuardianSchema,
  updatePlayerSchema,
} from "./schemas";

function refresh(orgSlug: string) {
  revalidatePath(`/o/${orgSlug}`, "layout");
}

// ── Teams ────────────────────────────────────────────────────────────────────

export async function createTeam(orgSlug: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  return orgAction(orgSlug, "roster.write", teamInputSchema, input, async (ctx, data) => {
    const supabase = await createClient();
    const { data: row, error } = await supabase
      .from("teams")
      .insert({ ...data, organization_id: ctx.organization.id })
      .select("id")
      .single();
    if (error) {
      return error.code === "23505"
        ? fail("A team with that name (or code) already exists this season.", { name: "Name already in use." })
        : fail(describeDbError(error));
    }
    refresh(orgSlug);
    return ok({ id: row.id }, `Team “${data.name}” created`);
  });
}

export async function updateTeam(orgSlug: string, input: unknown): Promise<ActionResult> {
  return orgAction(orgSlug, "roster.write", teamInputSchema.extend({ id }), input, async (ctx, { id: teamId, ...data }) => {
    const supabase = await createClient();
    const { error } = await supabase
      .from("teams")
      .update(data)
      .eq("id", teamId)
      .eq("organization_id", ctx.organization.id)
      .is("archived_at", null);
    if (error) {
      return error.code === "23505"
        ? fail("A team with that name (or code) already exists this season.", { name: "Name already in use." })
        : fail(describeDbError(error));
    }
    refresh(orgSlug);
    return ok(undefined, "Team updated");
  });
}

export async function archiveTeam(orgSlug: string, teamId: unknown): Promise<ActionResult<{ released: number }>> {
  return orgAction(orgSlug, "roster.write", id, teamId, async (ctx, tid) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("archive_team", { p_organization_id: ctx.organization.id, p_team_id: tid });
    if (error) return fail(describeDbError(error));
    refresh(orgSlug);
    return ok({ released: data }, data ? `Team archived · ${pluralize(data, "player")} now need a team` : "Team archived");
  });
}

export async function restoreTeam(orgSlug: string, teamId: unknown): Promise<ActionResult> {
  return orgAction(orgSlug, "roster.write", id, teamId, async (ctx, tid) => {
    const supabase = await createClient();
    const { error } = await supabase
      .from("teams")
      .update({ status: "active", archived_at: null })
      .eq("id", tid)
      .eq("organization_id", ctx.organization.id);
    if (error) {
      return fail(error.code === "23505" ? "An active team already uses this name or code. Rename one first." : describeDbError(error));
    }
    refresh(orgSlug);
    return ok(undefined, "Team restored");
  });
}

// ── Players ──────────────────────────────────────────────────────────────────

export async function createPlayer(orgSlug: string, input: unknown): Promise<ActionResult<{ id: string; name: string }>> {
  return orgAction(orgSlug, "roster.write", createPlayerSchema, input, async (ctx, data) => {
    const { household, guardian, team_id, ...player } = data;
    const supabase = await createClient();
    const { data: playerId, error } = await supabase.rpc("create_player", {
      p_organization_id: ctx.organization.id,
      p_player: player,
      p_team_id: team_id,
      p_household: household.mode === "existing" ? { id: household.id } : household.mode === "new" ? { name: household.name } : undefined,
      p_guardian: guardian.mode === "new" ? (({ mode: _mode, ...g }) => g)(guardian) : undefined,
    });
    if (error) {
      if (error.code === "23505") {
        return fail("Another player already uses that external ID.", { external_player_id: "Already in use." });
      }
      return fail(describeDbError(error));
    }
    refresh(orgSlug);
    const name = `${player.first_name} ${player.last_name}`;
    return ok({ id: playerId, name }, `${name} added`);
  });
}

export async function updatePlayer(orgSlug: string, input: unknown): Promise<ActionResult> {
  return orgAction(orgSlug, "roster.write", updatePlayerSchema, input, async (ctx, { id: playerId, ...data }) => {
    const supabase = await createClient();
    const { error } = await supabase
      .from("players")
      .update(data)
      .eq("id", playerId)
      .eq("organization_id", ctx.organization.id)
      .is("archived_at", null);
    if (error) {
      return error.code === "23505"
        ? fail("Another player already uses that external ID.", { external_player_id: "Already in use." })
        : fail(describeDbError(error));
    }
    refresh(orgSlug);
    return ok(undefined, "Player updated");
  });
}

const teamAssignmentSchema = z.object({ player_ids: idList, team_id: optionalId });

export async function assignPlayersToTeam(orgSlug: string, input: unknown): Promise<ActionResult<{ changed: number }>> {
  return orgAction(orgSlug, "roster.write", teamAssignmentSchema, input, async (ctx, data) => {
    const supabase = await createClient();
    const { data: changed, error } = await supabase.rpc("bulk_set_player_team", {
      p_organization_id: ctx.organization.id,
      p_player_ids: data.player_ids,
      p_team_id: data.team_id as string, // null = unassign (function accepts null)
    });
    if (error) return fail(describeDbError(error));
    refresh(orgSlug);
    const verb = data.team_id ? "moved to the team" : "unassigned";
    return ok({ changed }, changed ? `${pluralize(changed, "player")} ${verb}` : "No changes — already on that team");
  });
}

export async function archivePlayers(orgSlug: string, playerIds: unknown): Promise<ActionResult<{ count: number }>> {
  return orgAction(orgSlug, "roster.write", idList, playerIds, async (ctx, ids) => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("players")
      .update({ status: "archived", archived_at: new Date().toISOString() })
      .eq("organization_id", ctx.organization.id)
      .in("id", ids)
      .is("archived_at", null)
      .select("id");
    if (error) return fail(describeDbError(error));
    refresh(orgSlug);
    return ok({ count: data.length }, `${pluralize(data.length, "player")} archived`);
  });
}

export async function restorePlayers(orgSlug: string, playerIds: unknown): Promise<ActionResult<{ count: number }>> {
  return orgAction(orgSlug, "roster.write", idList, playerIds, async (ctx, ids) => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("players")
      .update({ status: "active", archived_at: null })
      .eq("organization_id", ctx.organization.id)
      .in("id", ids)
      .not("archived_at", "is", null)
      .select("id");
    if (error) return fail(describeDbError(error));
    refresh(orgSlug);
    return ok({ count: data.length }, `${pluralize(data.length, "player")} restored · assign a team when ready`);
  });
}

export async function dismissDuplicate(orgSlug: string, input: unknown): Promise<ActionResult> {
  const schema = z.object({ a: id, b: id }).refine((v) => v.a !== v.b, "Choose two different players.");
  return orgAction(orgSlug, "roster.write", schema, input, async (ctx, { a, b }) => {
    const [first, second] = a < b ? [a, b] : [b, a];
    const supabase = await createClient();
    const { error } = await supabase
      .from("player_duplicate_dismissals")
      .upsert({ organization_id: ctx.organization.id, player_a_id: first, player_b_id: second }, { ignoreDuplicates: true });
    if (error) return fail(describeDbError(error));
    refresh(orgSlug);
    return ok(undefined, "Marked as not a duplicate");
  });
}

// ── Households ───────────────────────────────────────────────────────────────

export async function createHousehold(orgSlug: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  const schema = householdInputSchema.extend({ player_ids: z.array(id).max(50).default([]) });
  return orgAction(orgSlug, "roster.write", schema, input, async (ctx, { player_ids, ...data }) => {
    const supabase = await createClient();
    const { data: row, error } = await supabase
      .from("households")
      .insert({ ...data, organization_id: ctx.organization.id })
      .select("id")
      .single();
    if (error) return fail(describeDbError(error));
    if (player_ids.length) {
      const { error: linkError } = await supabase.rpc("add_players_to_household", {
        p_organization_id: ctx.organization.id,
        p_household_id: row.id,
        p_player_ids: player_ids,
      });
      if (linkError) return fail(`Household created, but players couldn’t be added: ${describeDbError(linkError)}`);
    }
    refresh(orgSlug);
    return ok({ id: row.id }, `Household “${data.name}” created`);
  });
}

export async function updateHousehold(orgSlug: string, input: unknown): Promise<ActionResult> {
  return orgAction(orgSlug, "roster.write", householdInputSchema.extend({ id }), input, async (ctx, { id: hid, ...data }) => {
    const supabase = await createClient();
    const { error } = await supabase.from("households").update(data).eq("id", hid).eq("organization_id", ctx.organization.id);
    if (error) return fail(describeDbError(error));
    refresh(orgSlug);
    return ok(undefined, "Household updated");
  });
}

export async function archiveHousehold(orgSlug: string, householdId: unknown): Promise<ActionResult> {
  return orgAction(orgSlug, "roster.write", id, householdId, async (ctx, hid) => {
    const supabase = await createClient();
    const { count, error: countError } = await supabase
      .from("players")
      .select("id", { count: "exact", head: true })
      .eq("household_id", hid)
      .is("archived_at", null);
    if (countError) return fail(describeDbError(countError));
    if (count) return fail(`Move or archive this household’s ${pluralize(count, "active player")} first.`);
    const { error } = await supabase
      .from("households")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", hid)
      .eq("organization_id", ctx.organization.id);
    if (error) return fail(describeDbError(error));
    refresh(orgSlug);
    return ok(undefined, "Household archived");
  });
}

export async function addPlayersToHousehold(orgSlug: string, input: unknown): Promise<ActionResult<{ moved: number }>> {
  const schema = z.object({ household_id: id, player_ids: idList });
  return orgAction(orgSlug, "roster.write", schema, input, async (ctx, data) => {
    const supabase = await createClient();
    const { data: moved, error } = await supabase.rpc("add_players_to_household", {
      p_organization_id: ctx.organization.id,
      p_household_id: data.household_id,
      p_player_ids: data.player_ids,
    });
    if (error) return fail(describeDbError(error));
    refresh(orgSlug);
    return ok({ moved }, `${pluralize(moved, "player")} added to household`);
  });
}

export async function removePlayerFromHousehold(orgSlug: string, playerId: unknown): Promise<ActionResult> {
  return orgAction(orgSlug, "roster.write", id, playerId, async (ctx, pid) => {
    const supabase = await createClient();
    const { error } = await supabase
      .from("players")
      .update({ household_id: null })
      .eq("id", pid)
      .eq("organization_id", ctx.organization.id);
    if (error) return fail(describeDbError(error));
    refresh(orgSlug);
    return ok(undefined, "Player removed from household");
  });
}

// ── Guardians ────────────────────────────────────────────────────────────────

export async function createGuardian(orgSlug: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  return orgAction(orgSlug, "roster.write", createGuardianSchema, input, async (ctx, data) => {
    const { household_id, player_ids, make_primary, ...guardian } = data;
    const supabase = await createClient();
    const { data: guardianId, error } = await supabase.rpc("create_guardian", {
      p_organization_id: ctx.organization.id,
      p_household_id: household_id as string,
      p_guardian: { ...guardian, is_primary_contact: true },
      p_player_ids: player_ids,
      p_make_primary: make_primary,
    });
    if (error) return fail(describeDbError(error));
    refresh(orgSlug);
    return ok({ id: guardianId }, `${guardian.first_name} ${guardian.last_name} added`);
  });
}

export async function updateGuardian(orgSlug: string, input: unknown): Promise<ActionResult> {
  return orgAction(orgSlug, "roster.write", updateGuardianSchema, input, async (ctx, data) => {
    const { id: gid, sms_opt_in, email_opt_in, ...fields } = data;
    const supabase = await createClient();
    const { error } = await supabase
      .from("guardians")
      .update({ ...fields, communication_preferences: { email: email_opt_in, sms: sms_opt_in } })
      .eq("id", gid)
      .eq("organization_id", ctx.organization.id);
    if (error) return fail(describeDbError(error));
    refresh(orgSlug);
    return ok(undefined, "Guardian updated");
  });
}

export async function archiveGuardian(orgSlug: string, guardianId: unknown): Promise<ActionResult> {
  return orgAction(orgSlug, "roster.write", id, guardianId, async (ctx, gid) => {
    const supabase = await createClient();
    const { error } = await supabase
      .from("guardians")
      .update({ archived_at: new Date().toISOString(), is_primary_contact: false })
      .eq("id", gid)
      .eq("organization_id", ctx.organization.id);
    if (error) return fail(describeDbError(error));
    refresh(orgSlug);
    return ok(undefined, "Guardian removed");
  });
}

const linkSchema = z.object({
  player_id: id,
  guardian_id: id,
  relationship: z.enum(RELATIONSHIPS).default("parent"),
});

export async function linkGuardian(orgSlug: string, input: unknown): Promise<ActionResult> {
  return orgAction(orgSlug, "roster.write", linkSchema, input, async (ctx, data) => {
    const supabase = await createClient();
    const { count } = await supabase
      .from("player_guardians")
      .select("player_id", { count: "exact", head: true })
      .eq("player_id", data.player_id)
      .eq("is_primary", true);
    const { error } = await supabase.from("player_guardians").insert({
      organization_id: ctx.organization.id,
      ...data,
      is_primary: !count,
    });
    if (error) return fail(error.code === "23505" ? "That guardian is already linked." : describeDbError(error));
    refresh(orgSlug);
    return ok(undefined, "Guardian linked");
  });
}

export async function unlinkGuardian(orgSlug: string, input: unknown): Promise<ActionResult> {
  return orgAction(orgSlug, "roster.write", z.object({ player_id: id, guardian_id: id }), input, async (ctx, data) => {
    const supabase = await createClient();
    const { error } = await supabase
      .from("player_guardians")
      .delete()
      .eq("organization_id", ctx.organization.id)
      .eq("player_id", data.player_id)
      .eq("guardian_id", data.guardian_id);
    if (error) return fail(describeDbError(error));
    refresh(orgSlug);
    return ok(undefined, "Guardian unlinked");
  });
}

export async function setPrimaryGuardian(orgSlug: string, input: unknown): Promise<ActionResult> {
  return orgAction(orgSlug, "roster.write", z.object({ player_id: id, guardian_id: id }), input, async (ctx, data) => {
    const supabase = await createClient();
    const { error } = await supabase.rpc("set_primary_guardian", {
      p_organization_id: ctx.organization.id,
      p_player_id: data.player_id,
      p_guardian_id: data.guardian_id,
    });
    if (error) return fail(describeDbError(error));
    refresh(orgSlug);
    return ok(undefined, "Primary guardian updated");
  });
}

export async function setHouseholdPrimaryContact(orgSlug: string, guardianId: unknown): Promise<ActionResult> {
  return orgAction(orgSlug, "roster.write", id, guardianId, async (ctx, gid) => {
    const supabase = await createClient();
    const { error } = await supabase.rpc("set_household_primary_contact", {
      p_organization_id: ctx.organization.id,
      p_guardian_id: gid,
    });
    if (error) return fail(describeDbError(error));
    refresh(orgSlug);
    return ok(undefined, "Primary contact updated");
  });
}

// ── Lookups used by client pickers (read-only) ───────────────────────────────

export async function lookupGuardians(orgSlug: string, q: unknown) {
  return orgAction(orgSlug, "roster.read", optionalText(80), q, async (ctx, query) => {
    if (!query || query.length < 2) return ok([]);
    const { searchGuardians } = await import("./queries");
    return ok(await searchGuardians(ctx.organization.id, query));
  });
}

export async function lookupPlayers(orgSlug: string, input: unknown) {
  const schema = z.object({
    q: optionalText(80),
    withoutHousehold: z.boolean().optional(),
    withoutTeam: z.boolean().optional(),
  });
  return orgAction(orgSlug, "roster.read", schema, input, async (ctx, data) => {
    const { searchPlayers } = await import("./queries");
    return ok(await searchPlayers(ctx.organization.id, data.q ?? "", data));
  });
}

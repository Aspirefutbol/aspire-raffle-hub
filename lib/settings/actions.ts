"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, describeDbError, fail, ok, orgAction } from "@/lib/actions";
import { ROLE_LABELS } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { id } from "@/lib/validation";
import { memberRoleSchema, memberStatusSchema, organizationSchema, seasonSchema } from "./schemas";

function refresh(orgSlug: string) {
  revalidatePath(`/o/${orgSlug}`, "layout");
}

export async function updateOrganization(orgSlug: string, input: unknown): Promise<ActionResult> {
  return orgAction(orgSlug, "organization.manage", organizationSchema, input, async (ctx, data) => {
    const supabase = await createClient();
    const { error } = await supabase.from("organizations").update(data).eq("id", ctx.organization.id);
    if (error) return fail(describeDbError(error));
    refresh(orgSlug);
    return ok(undefined, "Organization updated");
  });
}

export async function createSeason(orgSlug: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  return orgAction(orgSlug, "organization.manage", seasonSchema, input, async (ctx, { make_current, ...data }) => {
    const supabase = await createClient();
    const { data: row, error } = await supabase
      .from("seasons")
      .insert({ ...data, organization_id: ctx.organization.id })
      .select("id")
      .single();
    if (error) return fail(error.code === "23505" ? "A season with that name already exists." : describeDbError(error), error.code === "23505" ? { name: "Already exists." } : undefined);
    if (make_current) {
      const { error: currentError } = await supabase.rpc("set_current_season", { p_organization_id: ctx.organization.id, p_season_id: row.id });
      if (currentError) return fail(describeDbError(currentError));
    }
    refresh(orgSlug);
    return ok({ id: row.id }, `Season “${data.name}” created`);
  });
}

export async function setCurrentSeason(orgSlug: string, seasonId: unknown): Promise<ActionResult> {
  return orgAction(orgSlug, "organization.manage", id, seasonId, async (ctx, sid) => {
    const supabase = await createClient();
    const { error } = await supabase.rpc("set_current_season", { p_organization_id: ctx.organization.id, p_season_id: sid });
    if (error) return fail(describeDbError(error));
    refresh(orgSlug);
    return ok(undefined, "Current season updated");
  });
}

export async function changeMemberRole(orgSlug: string, input: unknown): Promise<ActionResult> {
  return orgAction(orgSlug, "members.manage", memberRoleSchema, input, async (ctx, data) => {
    const supabase = await createClient();
    const { error } = await supabase
      .from("organization_members")
      .update({ role_key: data.role_key })
      .eq("id", data.member_id)
      .eq("organization_id", ctx.organization.id);
    if (error) return fail(describeDbError(error));
    refresh(orgSlug);
    return ok(undefined, `Role changed to ${ROLE_LABELS[data.role_key]}`);
  });
}

export async function setMemberStatus(orgSlug: string, input: unknown): Promise<ActionResult> {
  return orgAction(orgSlug, "members.manage", memberStatusSchema, input, async (ctx, data) => {
    const supabase = await createClient();
    const { error } = await supabase
      .from("organization_members")
      .update({ status: data.status })
      .eq("id", data.member_id)
      .eq("organization_id", ctx.organization.id);
    if (error) return fail(describeDbError(error));
    refresh(orgSlug);
    return ok(undefined, data.status === "active" ? "Member reactivated" : "Member suspended");
  });
}

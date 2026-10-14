"use server";

import { revalidatePath } from "next/cache";
import { describeDbError, fail, ok, orgAction, type ActionResult } from "@/lib/actions";
import { createClient } from "@/lib/supabase/server";
import { custodyResultSchema, moneyPermission, moneyRequestSchema } from "./schemas";

export async function recordMoneyCustody(orgSlug: string, input: unknown): Promise<ActionResult<{ event_id: string; replayed: boolean }> & { canEdit?: boolean }> {
  const parsed = moneyRequestSchema.safeParse(input);
  if (!parsed.success) return { ...fail(parsed.error.issues.map((issue) => issue.message).join(" ")), canEdit: true };
  let canEdit = false;
  const result = await orgAction(orgSlug, moneyPermission(parsed.data.kind), moneyRequestSchema, parsed.data, async (ctx, data) => {
    const db = await createClient();
    const { campaign_id, ...request } = data;
    const { data: receipt, error } = await db.rpc("record_money_custody", {
      p_organization_id: ctx.organization.id, p_campaign_id: campaign_id, p_request: request,
    });
    if (error) {
      canEdit = ["23514", "23503", "23505", "23502", "42501", "22023", "22P02", "22003", "P0002", "40001", "40P01"].includes(error.code);
      return fail(describeDbError(error));
    }
    const confirmed = custodyResultSchema.safeParse(receipt);
    if (!confirmed.success) return fail("The result is uncertain. Retry the exact same submission.");
    for (const route of ["campaigns", "fundraising", "team-fundraising"]) revalidatePath(`/o/${orgSlug}/${route}`, "layout");
    return ok(confirmed.data, confirmed.data.replayed ? "Existing money event confirmed" : "Money event recorded");
  });
  return { ...result, canEdit };
}

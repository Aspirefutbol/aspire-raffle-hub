"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { orgAction, ok, fail, describeDbError } from "@/lib/actions";
import { createClient } from "@/lib/supabase/server";
import { parseSellerLinkRpcResult } from "@/lib/sharing/schemas";
export async function manageSellerLink(orgSlug: string, input: unknown) {
  return orgAction(orgSlug, "roster.read_own_family", z.object({ participant: z.uuid(), revoke: z.boolean() }), input, async (ctx, data) => {
    if (!ctx.permissions.has("tickets.issue")) return fail("Sale permission is required.");
    const db = await createClient();
    const result = await db.rpc("manage_seller_link", { p_organization_id: ctx.organization.id, p_participant_id: data.participant, p_revoke: data.revoke });
    if (result.error) return fail(describeDbError(result.error));
    const parsed = parseSellerLinkRpcResult(result.data, data.revoke);
    if (!parsed.success) return fail("We could not confirm whether the sharing-link action completed. Contact your club administrator before creating or revoking another link.");
    return ok(parsed.data);
  });
}
export async function updateRequestStatus(orgSlug: string, input: unknown) {
  return orgAction(orgSlug, "roster.read_own_family", z.object({ request: z.uuid(), campaign: z.uuid(), status: z.enum(["contacted", "completed", "declined", "expired"]), sale: z.uuid().optional() }), input, async (ctx, data) => {
    if (!ctx.permissions.has("tickets.issue")) return fail("Sale permission is required.");
    const db = await createClient();
    const result = await db.rpc("update_seller_request_status", { p_organization_id: ctx.organization.id, p_request_id: data.request, p_status: data.status, p_sale_id: data.sale });
    if (result.error) return fail(describeDbError(result.error));
    revalidatePath(`/o/${orgSlug}/fundraising/${data.campaign}/requests`);
    return ok(undefined);
  });
}

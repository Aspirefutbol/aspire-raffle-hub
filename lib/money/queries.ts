import "server-only";
import { AuthorizationError, requirePermission, type OrgContext } from "@/lib/auth/org-context";
import { createClient } from "@/lib/supabase/server";
import { id } from "@/lib/validation";
import { moneyProjectionSchema } from "./schemas";

export function canReadMoney(ctx: Pick<OrgContext, "permissions">) {
  return (["reconciliation.manage", "adjustments.approve", "audit.read"] as const).some((p) => ctx.permissions.has(p));
}
export async function getCampaignMoney(ctx: OrgContext, campaignId: string, view: "admin" | "family" | "team" = "admin") {
  if (view === "admin") {
    if (!canReadMoney(ctx)) throw new AuthorizationError("reconciliation.manage");
  } else requirePermission(ctx, view === "family" ? "roster.read_own_family" : "roster.read_assigned_teams");
  if (!id.safeParse(campaignId).success) return null;
  const db = await createClient();
  const { data, error } = await db.rpc("campaign_money", { p_organization_id: ctx.organization.id, p_campaign_id: campaignId, p_view: view });
  if (error?.code === "42501" || error?.code === "P0002") return null;
  if (error) throw new Error("Could not load money balances.");
  return moneyProjectionSchema.parse(data);
}

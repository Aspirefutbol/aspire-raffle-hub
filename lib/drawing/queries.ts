import "server-only";
import { requirePermission, type OrgContext } from "@/lib/auth/org-context";
import { createClient } from "@/lib/supabase/server";
import { id } from "@/lib/validation";
import { drawingIntegritySchema, drawingOverviewSchema, drawingReadinessSchema } from "./schemas";

export async function getDrawingOverview(ctx: OrgContext, campaignId: string) {
  requirePermission(ctx, "campaigns.read");
  const checked = id.safeParse(campaignId);
  if (!checked.success) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("drawing_overview", {
    p_organization_id: ctx.organization.id, p_campaign_id: checked.data,
  });
  if (error?.code === "42501" || error?.code === "P0002") return null;
  if (error) throw new Error("Could not load drawing history.");
  return drawingOverviewSchema.parse(data);
}

export async function getDrawingReadiness(ctx: OrgContext, campaignId: string) {
  requirePermission(ctx, "campaigns.read");
  const checked = id.safeParse(campaignId);
  if (!checked.success) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("drawing_readiness", {
    p_organization_id: ctx.organization.id, p_campaign_id: checked.data,
  });
  if (error?.code === "42501" || error?.code === "P0002") return null;
  if (error) throw new Error("Could not load drawing readiness.");
  return drawingReadinessSchema.parse(data);
}

export async function getDrawingIntegrity(ctx: OrgContext, snapshotId: string) {
  requirePermission(ctx, "campaigns.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("verify_drawing_snapshot", {
    p_organization_id: ctx.organization.id, p_snapshot_id: id.parse(snapshotId),
  });
  if (error) throw new Error("Could not verify drawing snapshot.");
  return drawingIntegritySchema.parse(data);
}

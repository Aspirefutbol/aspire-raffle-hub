import "server-only";
import type { OrgContext } from "@/lib/auth/org-context";
import { requirePermission } from "@/lib/auth/org-context";
import { createClient } from "@/lib/supabase/server";
import { id } from "@/lib/validation";
import { VIEW_PERMISSIONS, type FundraisingView } from "./capabilities";
import { fundraisingViewSchema, progressFiltersSchema } from "./schemas";
import { campaignProgressSchema, fundraisingCampaignListSchema, type CampaignProgress, type FundraisingCampaign } from "./types";

export async function listFundraisingCampaigns(ctx: OrgContext, view: FundraisingView = "admin"): Promise<FundraisingCampaign[]> {
  const checkedView = fundraisingViewSchema.parse(view);
  requirePermission(ctx, VIEW_PERMISSIONS[checkedView]);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fundraising_campaigns", { p_organization_id: ctx.organization.id, p_view: checkedView });
  if (error) throw new Error("Could not load fundraising campaigns.");
  return fundraisingCampaignListSchema.parse(data);
}

/** The selected view stays explicit even when a member has several roles. */
export async function getCampaignProgress(
  ctx: OrgContext,
  campaignId: string,
  view: FundraisingView = "admin",
  filters: { teamId?: string; playerId?: string } = {},
): Promise<CampaignProgress | null> {
  const checkedView = fundraisingViewSchema.parse(view);
  requirePermission(ctx, VIEW_PERMISSIONS[checkedView]);
  const checkedId = id.safeParse(campaignId);
  const checkedFilters = progressFiltersSchema.safeParse(filters);
  if (!checkedId.success || !checkedFilters.success) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("campaign_progress", {
    p_organization_id: ctx.organization.id,
    p_campaign_id: checkedId.data,
    p_view: checkedView,
    p_team_id: checkedFilters.data.teamId,
    p_player_id: checkedFilters.data.playerId,
  });
  // Hidden, foreign and nonexistent campaigns produce the same page result.
  if (error?.code === "42501" || error?.code === "P0002") return null;
  if (error) throw new Error("Could not load campaign progress.");
  return data === null ? null : campaignProgressSchema.parse(data);
}

/** Admin setup uses the ordinary user client and a bounded tenant/campaign read. */
export async function getCampaignSetup(ctx: OrgContext, campaignId: string) {
  requirePermission(ctx, "campaigns.read");
  const checkedId = id.safeParse(campaignId);
  if (!checkedId.success) return null;
  const supabase = await createClient();
  const { data: campaign, error } = await supabase.from("campaigns").select("*")
    .eq("organization_id", ctx.organization.id).eq("id", checkedId.data).maybeSingle();
  if (error) throw new Error("Could not load campaign setup.");
  if (!campaign) return null;
  const { data: readiness, error: readinessError } = await supabase.rpc("campaign_readiness", { p_campaign_id: campaign.id });
  if (readinessError) throw new Error("Could not load campaign readiness.");
  return { campaign, readiness: readiness ?? [] };
}

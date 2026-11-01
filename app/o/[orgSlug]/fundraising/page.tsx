import { HeartHandshake } from "lucide-react";
import type { Metadata } from "next";
import { FamilyCampaignView } from "@/components/fundraising/family-campaign";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireOrgContext, requirePagePermission } from "@/lib/auth/org-context";
import { getCampaignProgress, listFundraisingCampaigns } from "@/lib/fundraising/queries";
import { singleActiveFamilyCampaign } from "@/lib/fundraising/family-entry";

export const metadata: Metadata = { title: "My fundraising" };

export default async function FamilyFundraisingPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  requirePagePermission(ctx, "roster.read_own_family");
  const campaigns = await listFundraisingCampaigns(ctx, "family");
  const progress = await Promise.all(campaigns.map(({ campaign }) => getCampaignProgress(ctx, campaign.id, "family")));
  const visible = progress.filter((campaign) => campaign !== null);
  // The server has already applied family scope to each projection. Only one
  // eligible active campaign may bypass the extra fundraiser-selection step.
  const solo = singleActiveFamilyCampaign(visible);
  // Retain safe access to previously authorized campaigns without interrupting the live fundraiser.
  const otherCampaigns = solo ? visible.filter(({ campaign }) => campaign.id !== solo.campaign.id) : [];

  return (
    <>
      <PageHeader title="My fundraising" description={solo ? "Share your raffle or sell tickets in person." : "Choose a fundraiser to start selling."} />
      {solo ? (
        <div className="space-y-5">
          <FamilyCampaignView orgSlug={orgSlug} progress={solo} detail timeZone={ctx.organization.timezone} />
          {otherCampaigns.length > 0 && (
            <details data-testid="other-family-campaigns" className="rounded-card border border-line bg-surface shadow-card">
              <summary className="min-h-12 cursor-pointer px-4 py-3 text-sm font-semibold text-ink">
                Other fundraisers ({otherCampaigns.length})
              </summary>
              <div className="space-y-5 border-t border-line p-4">
                {otherCampaigns.map((campaign) => (
                  <FamilyCampaignView key={campaign.campaign.id} orgSlug={orgSlug}
                    progress={campaign} timeZone={ctx.organization.timezone} />
                ))}
              </div>
            </details>
          )}
        </div>
      ) : visible.length ? (
        <div className="space-y-5">
          {visible.map((campaign) => <FamilyCampaignView key={campaign.campaign.id} orgSlug={orgSlug} progress={campaign} timeZone={ctx.organization.timezone} />)}
        </div>
      ) : (
        <Card><EmptyState icon={<HeartHandshake aria-hidden className="size-5" />} title="No family raffle participation yet"
          description="Ask your campaign administrator to check your guardian link and enroll your player in an active raffle." /></Card>
      )}
    </>
  );
}

import { HeartHandshake } from "lucide-react";
import type { Metadata } from "next";
import { FamilyCampaignView } from "@/components/fundraising/family-campaign";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireOrgContext, requirePagePermission } from "@/lib/auth/org-context";
import { getCampaignProgress, listFundraisingCampaigns } from "@/lib/fundraising/queries";

export const metadata: Metadata = { title: "My fundraising" };

export default async function FamilyFundraisingPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  requirePagePermission(ctx, "roster.read_own_family");
  const campaigns = await listFundraisingCampaigns(ctx, "family");
  const progress = await Promise.all(campaigns.map(({ campaign }) => getCampaignProgress(ctx, campaign.id, "family")));
  const visible = progress.filter((campaign) => campaign !== null);

  return (
    <>
      <PageHeader title="My fundraising" description="Choose a fundraiser to start selling." />
      {visible.length ? (
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

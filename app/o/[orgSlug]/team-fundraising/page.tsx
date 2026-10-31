import { Users } from "lucide-react";
import type { Metadata } from "next";
import { TeamCampaignView } from "@/components/fundraising/team-campaign";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireOrgContext, requirePagePermission } from "@/lib/auth/org-context";
import { getCampaignProgress, listFundraisingCampaigns } from "@/lib/fundraising/queries";

export const metadata: Metadata = { title: "Team fundraising" };

export default async function TeamFundraisingPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  requirePagePermission(ctx, "roster.read_assigned_teams");
  const campaigns = await listFundraisingCampaigns(ctx, "team");
  const progress = await Promise.all(campaigns.map(({ campaign }) => getCampaignProgress(ctx, campaign.id, "team")));
  const visible = progress.filter((campaign) => campaign !== null);
  return (
    <>
      <PageHeader title="Team fundraising" description="Raffle participation and follow-up for your assigned teams." />
      {visible.length ? (
        <div className="space-y-5">{visible.map((campaign) => <TeamCampaignView key={campaign.campaign.id} orgSlug={orgSlug} progress={campaign} />)}</div>
      ) : (
        <Card><EmptyState icon={<Users aria-hidden className="size-5" />} title="No team raffle participation yet"
          description="Ask your campaign administrator to check your team assignment and enroll players in an active raffle." /></Card>
      )}
    </>
  );
}

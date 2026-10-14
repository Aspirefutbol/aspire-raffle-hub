import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TeamCampaignView } from "@/components/fundraising/team-campaign";
import { ScopedMoney } from "@/components/money/balances";
import { getCampaignMoney } from "@/lib/money/queries";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { FilterSelect } from "@/components/ui/url-filters";
import { requireOrgContext, requirePagePermission } from "@/lib/auth/org-context";
import { getCampaignProgress } from "@/lib/fundraising/queries";

export const metadata: Metadata = { title: "Team fundraising" };

export default async function TeamCampaignPage({ params, searchParams }: {
  params: Promise<{ orgSlug: string; campaignId: string }>;
  searchParams: Promise<{ team?: string }>;
}) {
  const { orgSlug, campaignId } = await params;
  const { team } = await searchParams;
  const ctx = await requireOrgContext(orgSlug);
  requirePagePermission(ctx, "roster.read_assigned_teams");
  const unfiltered = await getCampaignProgress(ctx, campaignId, "team");
  if (!unfiltered) notFound();
  const progress = team ? await getCampaignProgress(ctx, campaignId, "team", { teamId: team }) : unfiltered;
  if (!progress) notFound();
  const money = await getCampaignMoney(ctx, campaignId, "team");
  const base = `/o/${orgSlug}/team-fundraising/${campaignId}`;
  return (
    <>
      <PageHeader title="Team fundraising" description="Participating players and progress for your assigned teams."
        breadcrumb={<Link href={`/o/${orgSlug}/team-fundraising`} className="hover:text-ink">All team raffles</Link>} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <FilterSelect param="team" label="Team" options={unfiltered.teams.map((assigned) => ({ value: assigned.id, label: assigned.name }))} />
        {team && <ButtonLink href={base} variant="ghost">Clear team filter</ButtonLink>}
      </div>
      <TeamCampaignView orgSlug={orgSlug} progress={progress} detail />
      {money && <ScopedMoney money={money} />}
    </>
  );
}

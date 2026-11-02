import { Megaphone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CampaignSheetButton } from "@/components/campaigns/campaign-sheet";
import { HelpLink } from "@/components/learning/help-link";
import { CampaignStatusBadge, GoalProgress } from "@/components/campaigns/progress";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { can, requireOrgContext, requirePagePermission } from "@/lib/auth/org-context";
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/fundraising/money";
import { listFundraisingCampaigns } from "@/lib/fundraising/queries";
import { listSeasons } from "@/lib/roster/queries";

export const metadata: Metadata = { title: "Campaigns" };

export default async function CampaignsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  requirePagePermission(ctx, "campaigns.read");
  const canManage = can(ctx, "campaigns.manage");
  const [campaigns, seasons] = await Promise.all([listFundraisingCampaigns(ctx, "admin"), canManage ? listSeasons(ctx.organization.id) : Promise.resolve([])]);
  return <>
    <PageHeader title="Campaigns" description="Raffle fundraising, participants, and offline collections." actions={canManage && <><HelpLink orgSlug={orgSlug} article="prepare-campaign" label="Campaign guide" /><CampaignSheetButton orgSlug={orgSlug} seasons={seasons.filter((season) => !season.archived_at)} /></>} />
    {campaigns.length === 0 ? <Card><EmptyState icon={<Megaphone className="size-5" />} title="No campaigns yet" description={canManage ? "Create a draft raffle, then enroll players from your master roster." : "Campaigns will appear here when your organization creates them."} /></Card> : <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">{campaigns.map(({ campaign, totals }) => <Card key={campaign.id}><CardBody><div className="mb-3 flex items-start justify-between gap-2"><Link href={`/o/${orgSlug}/campaigns/${campaign.id}`} className="min-w-0 text-base font-semibold text-ink hover:text-brand-700 hover:underline">{campaign.name}</Link><CampaignStatusBadge status={campaign.status} /></div><p className="mb-4 text-sm text-muted">{totals.player_count} players · {totals.team_count} teams{campaign.draw_at ? ` · Draw ${formatDate(campaign.draw_at, ctx.organization.timezone)}` : ""}</p><div className="mb-3 flex justify-between gap-4"><span className="text-sm text-ink-soft"><strong className="tabular block text-xl text-ink">{formatMoney(totals.raised_cents)}</strong>Offline collections</span><span className="text-right text-sm text-muted"><strong className="tabular block text-xl text-ink">{totals.tickets_sold}</strong>Tickets sold</span></div><GoalProgress raisedCents={totals.raised_cents} goalCents={campaign.goal_amount_cents} /><Link href={`/o/${orgSlug}/campaigns/${campaign.id}`} className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-brand-700 hover:underline">Open campaign →</Link></CardBody></Card>)}</div>}
  </>;
}

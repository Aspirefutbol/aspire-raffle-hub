import { SellerToolkit } from "@/components/sharing/toolkit";
import { formatDate } from "@/lib/format";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FamilyCampaignView } from "@/components/fundraising/family-campaign";
import { ScopedMoney } from "@/components/money/balances";
import { getCampaignMoney } from "@/lib/money/queries";
import { PageHeader } from "@/components/ui/page-header";
import { requireOrgContext, requirePagePermission } from "@/lib/auth/org-context";
import { getCampaignProgress } from "@/lib/fundraising/queries";

export const metadata: Metadata = { title: "My fundraising" };

export default async function FamilyCampaignPage({ params }: { params: Promise<{ orgSlug: string; campaignId: string }> }) {
  const { orgSlug, campaignId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  requirePagePermission(ctx, "roster.read_own_family");
  const progress = await getCampaignProgress(ctx, campaignId, "family");
  if (!progress) notFound();
  const money = await getCampaignMoney(ctx, campaignId, "family");
  return (
    <>
      <PageHeader title="My fundraising"
        breadcrumb={<Link href={`/o/${orgSlug}/fundraising`} className="hover:text-ink">All family raffles</Link>} />
      <FamilyCampaignView orgSlug={orgSlug} progress={progress} detail timeZone={ctx.organization.timezone} />
      {money && <details className="mt-4 rounded-card border border-line bg-surface px-4 py-2">
        <summary className="min-h-12 cursor-pointer py-3 text-sm font-semibold text-ink">Money & reconciliation</summary>
        <div className="pb-3"><ScopedMoney money={money} /></div>
      </details>}
      <details className="mt-4 rounded-card border border-line bg-surface px-4 py-2">
        <summary className="min-h-12 cursor-pointer py-3 text-sm font-semibold text-ink">Sharing help</summary>
        <div className="pb-3"><SellerToolkit price={progress.campaign.ticket_price_cents} ticketPackages={progress.campaign.ticket_packages} closeDate={formatDate(progress.campaign.sales_close_at,ctx.organization.timezone)}/></div>
      </details>
    </>
  );
}

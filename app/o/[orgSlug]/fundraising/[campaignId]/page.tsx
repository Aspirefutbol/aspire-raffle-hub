import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FamilyCampaignView } from "@/components/fundraising/family-campaign";
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
  return (
    <>
      <PageHeader title="My fundraising" description="Progress and ticket sales for your linked players."
        breadcrumb={<Link href={`/o/${orgSlug}/fundraising`} className="hover:text-ink">All family raffles</Link>} />
      <FamilyCampaignView orgSlug={orgSlug} progress={progress} detail timeZone={ctx.organization.timezone} />
    </>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrgContext, requirePagePermission } from "@/lib/auth/org-context";
import { createClient } from "@/lib/supabase/server";
import { getCampaignProgress } from "@/lib/fundraising/queries";
import { requestRowSchema } from "@/lib/sharing/schemas";
import { RequestInbox } from "@/components/sharing/request-inbox";
import { PageHeader } from "@/components/ui/page-header";
export default async function RequestsPage({ params }: { params: Promise<{ orgSlug: string; campaignId: string }> }) {
  const { orgSlug, campaignId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  requirePagePermission(ctx,"roster.read_own_family");
  requirePagePermission(ctx,"tickets.issue");
  const progress = await getCampaignProgress(ctx,campaignId,"family");
  if (!progress) notFound();
  const db = await createClient();
  const { data, error } = await db.rpc("seller_request_inbox",{ p_organization_id: ctx.organization.id, p_campaign_id: campaignId });
  if (error) throw new Error("Could not load request inbox.");
  const requests = requestRowSchema.array().parse(data);
  // Family page always intersects with the explicit family projection, even for combined admins.
  return <><PageHeader title="Private supporter requests" description="Follow up privately with interested supporters." breadcrumb={<Link href={`/o/${orgSlug}/fundraising/${campaignId}`}>Back to my fundraiser</Link>}/><RequestInbox orgSlug={orgSlug} campaignId={campaignId} requests={requests.filter(r => progress.participants.some(p => p.id===r.participant_id))} progress={progress}/></>;
}

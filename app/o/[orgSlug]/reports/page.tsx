import { BarChart3 } from "lucide-react";
import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { can, requireOrgContext } from "@/lib/auth/org-context";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  return (
    <>
      <PageHeader title="Reports" description="Exports and campaign reporting." />
      <Card>
        <EmptyState
          icon={<BarChart3 className="size-5" />}
          title="Reports arrive with campaigns"
          description="Ticket ledger, seller balances, reconciliation batches, team progress and audit exports will live here."
          action={can(ctx, "audit.read") ? <ButtonLink href={`/o/${orgSlug}/settings/activity`} variant="secondary">View activity log</ButtonLink> : undefined}
        />
      </Card>
    </>
  );
}

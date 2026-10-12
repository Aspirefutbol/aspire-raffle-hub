import { CheckCircle2, Megaphone } from "lucide-react";
import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireOrgContext } from "@/lib/auth/org-context";

export const metadata: Metadata = { title: "Campaigns" };

const NEXT = [
  "Create a raffle, Sponsor-a-Day or other fundraiser",
  "Select teams → select players → add participants from your master roster",
  "Configure dates, ticket price, goals, prizes and compliance checklist",
  "Direct cash/check sales with instant digital tickets — no online checkout in Texas CREA mode",
];

export default async function CampaignsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  await requireOrgContext(orgSlug);
  return (
    <>
      <PageHeader title="Campaigns" description="Fundraisers that use your master roster." />
      <Card>
        <EmptyState
          icon={<Megaphone className="size-5" />}
          title="Campaigns are coming in the next phase"
          description="Your roster is the foundation: every campaign will enroll players from it instead of re-entering them."
        />
        <ul className="mx-auto max-w-lg space-y-2 px-6 pb-8">
          {NEXT.map((n) => (
            <li key={n} className="flex items-start gap-2 text-sm text-ink-soft">
              <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-brand-500" /> {n}
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

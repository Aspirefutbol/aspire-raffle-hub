import { Building2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CreateOrganizationButton } from "@/components/platform/create-org";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { formatDate } from "@/lib/format";
import { requireSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Platform" };

export default async function PlatformPage() {
  // Layout renders in parallel with the page, so the page gates itself too.
  if (!(await requireSessionUser()).isPlatformAdmin) notFound();
  const supabase = await createClient();
  const { data: orgs, error } = await supabase.rpc("platform_organization_summaries");
  if (error) throw new Error(error.message);

  return (
    <>
      <PageHeader title="Organizations" description="Every tenant on this Raffle Hub platform." actions={<CreateOrganizationButton />} />
      <Card>
        <ul className="divide-y divide-line">
          {(orgs ?? []).map((o) => (
            <li key={o.id}>
              <Link href={`/platform/organizations/${o.id}`} className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-canvas/70">
                <Building2 aria-hidden className="size-4 shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{o.name}</p>
                  <p className="truncate text-xs text-muted">
                    /o/{o.slug} · {o.member_count} members · {o.player_count} players
                    {o.pending_invitations ? ` · ${o.pending_invitations} pending invites` : ""} · since {formatDate(o.created_at)}
                  </p>
                </div>
                {o.jurisdiction_profile && <Badge tone="info" icon={false} className="hidden sm:inline-flex">{o.jurisdiction_profile.replace(/_/g, " ")}</Badge>}
                <Badge tone={o.status === "active" ? "success" : o.status === "suspended" ? "warning" : "muted"}>{o.status}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

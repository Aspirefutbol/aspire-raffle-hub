import { Building2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CreateOrganizationButton } from "@/components/platform/create-org";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Platform" };

export default async function PlatformPage() {
  const supabase = await createClient();
  const [{ data: orgs, error }, { data: members }] = await Promise.all([
    supabase.from("organizations").select("id, name, slug, organization_type, status, jurisdiction_profile, created_at").order("name"),
    supabase.from("organization_members").select("organization_id").eq("status", "active"),
  ]);
  if (error) throw new Error(error.message);
  const memberCount = new Map<string, number>();
  for (const m of members ?? []) memberCount.set(m.organization_id, (memberCount.get(m.organization_id) ?? 0) + 1);

  return (
    <>
      <PageHeader title="Organizations" description="Every tenant on this Raffle Hub platform." actions={<CreateOrganizationButton />} />
      <Card>
        <ul className="divide-y divide-line">
          {(orgs ?? []).map((o) => (
            <li key={o.id}>
              <Link href={`/o/${o.slug}/dashboard`} className="flex items-center gap-3 px-4 py-3 hover:bg-canvas/70">
                <Building2 aria-hidden className="size-4 text-muted" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{o.name}</p>
                  <p className="truncate text-xs text-muted">
                    /o/{o.slug} · {o.organization_type.replace(/_/g, " ")} · {memberCount.get(o.id) ?? 0} members · since {formatDate(o.created_at)}
                  </p>
                </div>
                {o.jurisdiction_profile && <Badge tone="info" icon={false}>{o.jurisdiction_profile.replace(/_/g, " ")}</Badge>}
                <Badge tone={o.status === "active" ? "success" : "warning"}>{o.status}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

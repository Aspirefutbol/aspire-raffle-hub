import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InviteAdminForm, ProtectedSettingsForm } from "@/components/platform/protected-settings";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { formatDateTime } from "@/lib/format";
import { requireSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Organization" };

export default async function PlatformOrganizationPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(organizationId)) notFound();
  // Layout renders in parallel with the page, so the page gates itself too.
  if (!(await requireSessionUser()).isPlatformAdmin) notFound();
  const supabase = await createClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, legal_name, slug, status, jurisdiction_profile, created_at")
    .eq("id", organizationId)
    .maybeSingle();
  if (!org) notFound();

  const { data: changes } = await supabase
    .from("audit_events")
    .select("id, occurred_at, changed_fields, before_data, after_data, metadata, actor_id")
    .eq("organization_id", org.id)
    .eq("action", "ORGANIZATION_PROTECTED_CHANGED")
    .order("occurred_at", { ascending: false })
    .limit(20);

  return (
    <>
      <PageHeader
        breadcrumb={<Link href="/platform" className="hover:text-ink">Organizations</Link>}
        title={<span className="flex items-center gap-2">{org.name} <Badge tone={org.status === "active" ? "success" : "warning"}>{org.status}</Badge></span>}
        description={org.legal_name ?? undefined}
        actions={
          org.status === "active" ? (
            <ButtonLink href={`/o/${org.slug}/dashboard`} variant="secondary" icon={<ExternalLink className="size-4" />}>Open workspace</ButtonLink>
          ) : null
        }
      />
      <div className="space-y-4">
        <ProtectedSettingsForm organization={org} />
        <InviteAdminForm organizationId={org.id} />
        <Card>
          <CardHeader title="Protected change history" />
          {!changes?.length ? (
            <p className="px-4 py-4 text-sm text-muted">No protected changes yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {changes.map((c) => {
                const before = (c.before_data ?? {}) as Record<string, unknown>;
                const after = (c.after_data ?? {}) as Record<string, unknown>;
                const reason = (c.metadata as Record<string, unknown> | null)?.reason;
                return (
                  <li key={c.id} className="px-4 py-3 text-sm">
                    <p className="text-ink">
                      {c.changed_fields.map((f) => `${f.replace(/_/g, " ")}: ${String(before[f] ?? "—")} → ${String(after[f] ?? "—")}`).join(" · ")}
                    </p>
                    <p className="text-xs text-muted">
                      {formatDateTime(c.occurred_at)}{typeof reason === "string" ? ` · “${reason}”` : ""}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

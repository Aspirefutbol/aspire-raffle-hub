import { ChevronRight, History, Scale, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { MappingsCard } from "@/components/settings/mappings-card";
import { OrganizationForm } from "@/components/settings/organization-form";
import { SeasonsCard } from "@/components/settings/seasons-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { can, requireOrgContext, requirePagePermission } from "@/lib/auth/org-context";
import { listSeasons } from "@/lib/roster/queries";
import { TIMEZONES } from "@/lib/settings/schemas";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  requirePagePermission(ctx, "roster.read");
  const supabase = await createClient();
  const orgId = ctx.organization.id;

  const [{ data: org }, seasons, mappings, memberCount] = await Promise.all([
    supabase.from("organizations").select("*").eq("id", orgId).single(),
    listSeasons(orgId),
    can(ctx, "roster.import")
      ? supabase.from("import_mappings").select("id, name, mapping, last_used_at, created_at").eq("organization_id", orgId).order("name")
      : Promise.resolve({ data: [], error: null }),
    can(ctx, "members.read")
      ? supabase.from("organization_members").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("status", "active")
      : Promise.resolve({ count: null }),
  ]);
  if (!org) throw new Error("Organization not found");

  const tz = (TIMEZONES as readonly string[]).includes(org.timezone) ? (org.timezone as (typeof TIMEZONES)[number]) : "America/Chicago";

  return (
    <>
      <PageHeader title="Settings" description={org.name} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="Organization profile" description="Used on campaign pages, tickets and receipts in later phases." />
            <CardBody>
              <OrganizationForm
                orgSlug={orgSlug}
                canEdit={can(ctx, "organization.manage")}
                initial={{
                  name: org.name,
                  legal_name: org.legal_name ?? "",
                  timezone: tz,
                  address_line1: org.address_line1 ?? "",
                  address_line2: org.address_line2 ?? "",
                  city: org.city ?? "",
                  region: org.region ?? "",
                  postal_code: org.postal_code ?? "",
                  support_email: org.support_email ?? "",
                  support_phone: org.support_phone ?? "",
                }}
              />
            </CardBody>
          </Card>
          {can(ctx, "members.read") && (
            <Link href={`/o/${orgSlug}/settings/members`} className="flex min-h-14 items-center gap-3 rounded-card border border-line bg-surface px-4 py-3 shadow-card hover:border-brand-300">
              <Users aria-hidden className="size-4 text-muted" />
              <span className="flex-1">
                <span className="block text-sm font-medium text-ink">Members & roles · {memberCount.count ?? 0}</span>
                <span className="block text-xs text-muted">
                  {can(ctx, "members.manage") ? "Add or invite people, assign multiple roles, suspend access" : "See who has access and their roles"}
                </span>
              </span>
              <ChevronRight aria-hidden className="size-4 text-muted" />
            </Link>
          )}
        </div>
        <div className="space-y-4">
          <SeasonsCard
            orgSlug={orgSlug}
            canEdit={can(ctx, "organization.manage")}
            seasons={seasons.filter((s) => !s.archived_at)}
          />
          <Card>
            <CardHeader title="Fundraising compliance" />
            <CardBody className="space-y-2 text-sm">
              <p className="flex items-center gap-2 text-ink">
                <Scale aria-hidden className="size-4 text-muted" />
                Jurisdiction profile: {org.jurisdiction_profile ? <Badge tone="info" icon={false}>{org.jurisdiction_profile.replace(/_/g, " ")}</Badge> : <span className="text-muted">Not set</span>}
              </p>
              <p className="text-xs text-muted">
                Applied to raffle campaigns when they launch (e.g. Texas CREA mode: direct cash/check payment, no online ticket checkout). Set by your platform administrator.
              </p>
            </CardBody>
          </Card>
          {can(ctx, "roster.import") && (
            <MappingsCard
              orgSlug={orgSlug}
              mappings={(mappings.data ?? []).map((m) => ({
                id: m.id,
                name: m.name,
                columns: Object.values((m.mapping ?? {}) as Record<string, unknown>).filter(Boolean).length,
                last_used_at: m.last_used_at,
                created_at: m.created_at,
              }))}
            />
          )}
          {can(ctx, "audit.read") && (
            <Link href={`/o/${orgSlug}/settings/activity`} className="flex items-center gap-3 rounded-card border border-line bg-surface px-4 py-3 shadow-card hover:border-brand-300">
              <History aria-hidden className="size-4 text-muted" />
              <span className="flex-1">
                <span className="block text-sm font-medium text-ink">Activity log</span>
                <span className="block text-xs text-muted">Every roster, import and role change, with who and when</span>
              </span>
            </Link>
          )}
        </div>
      </div>
    </>
  );
}

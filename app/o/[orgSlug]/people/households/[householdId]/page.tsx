import { MapPin } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HouseholdGuardiansCard, HouseholdHeaderActions, HouseholdPlayersCard } from "@/components/roster/households";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { can, requireOrgContext, requirePagePermission } from "@/lib/auth/org-context";
import { getHousehold } from "@/lib/roster/queries";

export const metadata: Metadata = { title: "Household" };

export default async function HouseholdPage({ params }: { params: Promise<{ orgSlug: string; householdId: string }> }) {
  const { orgSlug, householdId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  requirePagePermission(ctx, "roster.read");
  if (!/^[0-9a-f-]{36}$/i.test(householdId)) notFound();

  const result = await getHousehold(ctx.organization.id, householdId);
  if (!result) notFound();
  const { household, players, guardians } = result;
  const archived = Boolean(household.archived_at);
  const canWrite = can(ctx, "roster.write") && !archived;
  const activePlayers = players.filter((p) => !p.archived_at);
  const hasContact = guardians.some((g) => g.email || g.phone);
  const address = [household.address_line1, household.address_line2, [household.city, household.region, household.postal_code].filter(Boolean).join(", ")]
    .filter(Boolean);

  return (
    <>
      <PageHeader
        breadcrumb={<Link href={`/o/${orgSlug}/people/households`} className="hover:text-ink">Households</Link>}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {household.name}
            {archived && <Badge tone="muted">Archived</Badge>}
            {!archived && !hasContact && <Badge tone="warning">Missing contact</Badge>}
          </span>
        }
        description={`${activePlayers.length} player${activePlayers.length === 1 ? "" : "s"} · ${guardians.length} guardian${guardians.length === 1 ? "" : "s"}`}
        actions={
          canWrite && (
            <HouseholdHeaderActions
              orgSlug={orgSlug}
              activePlayers={activePlayers.length}
              household={{
                id: household.id,
                name: household.name,
                address_line1: household.address_line1,
                address_line2: household.address_line2,
                city: household.city,
                region: household.region,
                postal_code: household.postal_code,
                notes: household.notes,
              }}
            />
          )
        }
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <HouseholdGuardiansCard
            orgSlug={orgSlug}
            householdId={household.id}
            canWrite={canWrite}
            playerIds={activePlayers.flatMap((p) => (p.id ? [p.id] : []))}
            guardians={guardians.map((g) => ({
              id: g.id,
              first_name: g.first_name,
              last_name: g.last_name,
              email: g.email,
              phone: g.phone,
              is_primary_contact: g.is_primary_contact,
              communication_preferences: g.communication_preferences as { email?: boolean; sms?: boolean } | null,
              linkedPlayers: g.player_guardians.length,
            }))}
          />
          <HouseholdPlayersCard
            orgSlug={orgSlug}
            householdId={household.id}
            householdName={household.name}
            canWrite={canWrite}
            players={players.flatMap((p) =>
              p.id && p.first_name && p.last_name
                ? [{ id: p.id, first_name: p.first_name, last_name: p.last_name, preferred_name: p.preferred_name, team_name: p.team_name, archived: Boolean(p.archived_at) }]
                : [],
            )}
          />
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Address" />
            <CardBody>
              {address.length ? (
                <p className="flex gap-2 text-sm text-ink"><MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" /><span>{address.map((l) => <span key={l} className="block">{l}</span>)}</span></p>
              ) : (
                <p className="text-sm text-muted">No address on file.</p>
              )}
              {household.notes && <p className="mt-3 border-t border-line pt-3 text-sm whitespace-pre-wrap text-ink-soft">{household.notes}</p>}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}

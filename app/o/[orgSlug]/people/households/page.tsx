import { Home, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { NewHouseholdButton } from "@/components/roster/households";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { FilterSelect, SearchInput } from "@/components/ui/url-filters";
import { can, requireOrgContext, requirePagePermission } from "@/lib/auth/org-context";
import { formatPhone, fullName } from "@/lib/format";
import { listHouseholds } from "@/lib/roster/queries";

export const metadata: Metadata = { title: "Households" };

export default async function HouseholdsPage({ params, searchParams }: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ q?: string; issue?: string; view?: string; page?: string }>;
}) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const ctx = await requireOrgContext(orgSlug);
  requirePagePermission(ctx, "roster.read");

  const issue = sp.issue === "no-contact" ? "no-contact" : undefined;
  const archived = sp.view === "archived";
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const result = await listHouseholds(ctx.organization.id, { q: sp.q, issue, page, archived });
  const base = `/o/${orgSlug}/people/households`;
  const filtered = Boolean(sp.q || issue || archived);
  const hrefFor = (n: number) => {
    const next = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string" && v) as [string, string][]);
    next.set("page", String(n));
    return `${base}?${next.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="Households"
        description={`${result.total} ${archived ? "archived " : ""}household${result.total === 1 ? "" : "s"}${filtered ? " match" : ""}`}
        actions={can(ctx, "roster.write") && <NewHouseholdButton orgSlug={orgSlug} />}
      />

      {issue && (
        <div className="mb-3 flex items-center gap-2 rounded-control border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span className="font-medium">Households missing contact information</span>
          <span className="text-amber-800">· {result.total}</span>
          <Link href={base} className="ml-auto inline-flex items-center gap-1 hover:underline">
            <X aria-hidden className="size-3.5" /> Clear
          </Link>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchInput placeholder="Search households" className="w-full sm:w-64" />
        <FilterSelect param="issue" label="Contact" allLabel="Any" options={[{ value: "no-contact", label: "Missing contact info" }]} />
        <FilterSelect param="view" label="Show" allLabel="Active" options={[{ value: "archived", label: "Archived" }]} />
      </div>

      <Card className="overflow-hidden">
        {result.rows.length === 0 ? (
          <EmptyState
            icon={<Home className="size-5" />}
            title={issue ? "Every household has contact information" : filtered ? "No households match" : "No households yet"}
            description={filtered ? undefined : "Households are created automatically by imports, or add one here to group siblings and guardians."}
            action={filtered ? <ButtonLink href={base} variant="secondary">Clear filters</ButtonLink> : undefined}
          />
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <THead>
                  <tr>
                    <TH>Household</TH>
                    <TH>Players</TH>
                    <TH>Primary contact</TH>
                    <TH>Contact</TH>
                  </tr>
                </THead>
                <TBody>
                  {result.rows.map((h) => (
                    <TR key={h.id}>
                      <TD>
                        <Link href={`${base}/${h.id}`} className="font-medium text-ink hover:text-brand-700">{h.name}</Link>
                        {h.city && <span className="block text-xs text-muted">{[h.city, h.region].filter(Boolean).join(", ")}</span>}
                      </TD>
                      <TD className="max-w-72 truncate text-ink-soft">
                        {h.players.length ? h.players.map((p) => fullName(p)).join(", ") : <span className="text-muted">—</span>}
                      </TD>
                      <TD className="text-ink-soft">
                        {h.primary ? `${h.primary.first_name} ${h.primary.last_name}` : <span className="text-muted">No guardian</span>}
                      </TD>
                      <TD>
                        {h.hasContact ? (
                          <span className="text-ink-soft">
                            {h.primary?.email ||
                              formatPhone(h.primary?.phone) ||
                              (() => {
                                const g = h.guardians.find((x) => x.email || x.phone);
                                return g?.email || formatPhone(g?.phone);
                              })()}
                          </span>
                        ) : (
                          <Badge tone="warning">Missing contact</Badge>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
            <ul className="divide-y divide-line md:hidden">
              {result.rows.map((h) => (
                <li key={h.id}>
                  <Link href={`${base}/${h.id}`} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-ink">{h.name}</p>
                      <p className="truncate text-xs text-muted">
                        {h.players.length} player{h.players.length === 1 ? "" : "s"} · {h.primary ? `${h.primary.first_name} ${h.primary.last_name}` : "No guardian"}
                      </p>
                    </div>
                    {!h.hasContact && <Badge tone="warning">No contact</Badge>}
                  </Link>
                </li>
              ))}
            </ul>
            {result.total > result.pageSize && <Pagination page={result.page} pageSize={result.pageSize} total={result.total} hrefFor={hrefFor} />}
          </>
        )}
      </Card>
    </>
  );
}

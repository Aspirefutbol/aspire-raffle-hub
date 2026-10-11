import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { FilterSelect } from "@/components/ui/url-filters";
import { describeAction, describeChangedFields } from "@/lib/audit/describe";
import { requireOrgContext, requirePagePermission } from "@/lib/auth/org-context";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Activity log" };

const PAGE_SIZE = 50;
const CATEGORIES: Record<string, string> = {
  PLAYER: "Players",
  TEAM: "Teams",
  HOUSEHOLD: "Households",
  GUARDIAN: "Guardians",
  IMPORT: "Imports",
  MEMBER: "Members & roles",
  INVITATION: "Invitations",
  ORGANIZATION: "Organization",
  CAMPAIGN: "Campaigns",
};

function entityHref(orgSlug: string, type: string, id: string | null): string | null {
  if (!id) return null;
  if (type === "players") return `/o/${orgSlug}/people/players/${id}`;
  if (type === "teams") return `/o/${orgSlug}/teams/${id}`;
  if (type === "households") return `/o/${orgSlug}/people/households/${id}`;
  if (type === "imports") return `/o/${orgSlug}/people/players/import/${id}`;
  return null;
}

export default async function ActivityPage({ params, searchParams }: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ category?: string; page?: string }>;
}) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const ctx = await requireOrgContext(orgSlug);
  requirePagePermission(ctx, "audit.read");
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const supabase = await createClient();
  let query = supabase
    .from("audit_events")
    .select("id, action, entity_type, entity_id, actor_id, occurred_at, changed_fields, before_data, after_data, metadata", { count: "exact" })
    .eq("organization_id", ctx.organization.id)
    .order("occurred_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (sp.category && sp.category in CATEGORIES) {
    query = sp.category === "MEMBER" ? query.in("action", ["MEMBER_ADDED", "ROLE_CHANGED", "ROLE_GRANTED", "ROLE_REVOKED", "MEMBER_STATUS_CHANGED"]) : query.like("action", `${sp.category}\\_%`);
  }
  const { data: events, count, error } = await query;
  if (error) throw new Error(error.message);

  const actorIds = [...new Set((events ?? []).map((e) => e.actor_id).filter((v): v is string => Boolean(v)))];
  const { data: actors } = actorIds.length ? await supabase.from("profiles").select("id, full_name, email").in("id", actorIds) : { data: [] };
  const actorName = new Map((actors ?? []).map((a) => [a.id, a.full_name || a.email]));

  // Events like PLAYER_TEAM_CHANGED carry only an id; resolve player names for display.
  const playerIds = [...new Set((events ?? []).filter((e) => e.entity_type === "players" && e.entity_id && !(e.after_data as Record<string, unknown> | null)?.first_name).map((e) => e.entity_id as string))];
  const { data: players } = playerIds.length ? await supabase.from("players").select("id, first_name, last_name").in("id", playerIds) : { data: [] };
  const playerName = new Map((players ?? []).map((p) => [p.id, `${p.first_name} ${p.last_name}`]));

  const subject = (e: NonNullable<typeof events>[number]): string => {
    const after = (e.after_data ?? {}) as Record<string, unknown>;
    const meta = (e.metadata ?? {}) as Record<string, unknown>;
    if (typeof after.first_name === "string") return `${after.first_name} ${String(after.last_name ?? "")}`.trim();
    if (typeof after.name === "string") return after.name;
    if (typeof after.email === "string") return after.email;
    if (typeof meta.file_name === "string") return meta.file_name;
    if (e.entity_type === "players" && e.entity_id) return playerName.get(e.entity_id) ?? "";
    return "";
  };

  return (
    <>
      <PageHeader
        breadcrumb={<Link href={`/o/${orgSlug}/settings`} className="hover:text-ink">Settings</Link>}
        title="Activity log"
        description="Append-only record of administrative changes. Entries can’t be edited or deleted."
      />
      <div className="mb-3">
        <FilterSelect param="category" label="Show" allLabel="All activity" options={Object.entries(CATEGORIES).map(([value, label]) => ({ value, label }))} />
      </div>
      <Card className="overflow-hidden">
        {!events?.length ? (
          <EmptyState title="No activity yet" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>When</TH>
                <TH>Action</TH>
                <TH>Record</TH>
                <TH className="hidden md:table-cell">Details</TH>
                <TH>By</TH>
              </tr>
            </THead>
            <TBody>
              {events.map((e) => {
                const href = entityHref(orgSlug, e.entity_type, e.entity_id);
                const name = subject(e);
                const meta = (e.metadata ?? {}) as Record<string, unknown>;
                const detail =
                  e.action.endsWith("_UPDATED") ? describeChangedFields(e.changed_fields)
                  : e.action === "ROLE_CHANGED" || e.action === "ROLE_GRANTED" || e.action === "ROLE_REVOKED"
                    ? String((((e.action === "ROLE_REVOKED" ? e.before_data : e.after_data) ?? {}) as Record<string, unknown>).role_key ?? "").replace(/_/g, " ").toLowerCase()
                  : e.action.endsWith("_STATUS_CHANGED") ? `${String(((e.before_data ?? {}) as Record<string, unknown>).status ?? "?")} → ${String(((e.after_data ?? {}) as Record<string, unknown>).status ?? "?")}`
                  : e.action === "ORGANIZATION_PROTECTED_CHANGED" ? describeChangedFields(e.changed_fields)
                  : meta.import_id ? "via import" : null;
                const reason = typeof meta.reason === "string" ? meta.reason : null;
                return (
                  <TR key={e.id}>
                    <TD className="whitespace-nowrap text-xs text-muted">{formatDateTime(e.occurred_at, ctx.organization.timezone)}</TD>
                    <TD className="whitespace-nowrap text-ink">{describeAction(e.action)}</TD>
                    <TD className="max-w-48 truncate">
                      {href ? <Link href={href} className="text-ink-soft hover:text-brand-700">{name || "View"}</Link> : <span className="text-ink-soft">{name || "—"}</span>}
                    </TD>
                    <TD className="hidden max-w-64 truncate text-xs text-muted md:table-cell">{[detail, reason && `“${reason}”`].filter(Boolean).join(" · ")}</TD>
                    <TD className="whitespace-nowrap text-xs text-ink-soft">{e.actor_id ? (actorName.get(e.actor_id) ?? "Team member") : "System"}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
        {(count ?? 0) > PAGE_SIZE && (
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={count ?? 0}
            hrefFor={(n) => `/o/${orgSlug}/settings/activity?${new URLSearchParams({ ...(sp.category ? { category: sp.category } : {}), page: String(n) })}`}
          />
        )}
      </Card>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { MembersPanel } from "@/components/settings/members-panel";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { SearchInput } from "@/components/ui/url-filters";
import { can, requireOrgContext, requirePagePermission } from "@/lib/auth/org-context";
import { listMembers, listPendingInvitations } from "@/lib/members/queries";
import { canAssignRole, ORGANIZATION_ROLES } from "@/lib/permissions";
import { listTeamOptions } from "@/lib/roster/queries";

export const metadata: Metadata = { title: "Members" };

export default async function MembersPage({ params, searchParams }: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const ctx = await requireOrgContext(orgSlug);
  requirePagePermission(ctx, "members.read");
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const canManage = can(ctx, "members.manage");
  const [members, invitations, teams] = await Promise.all([
    listMembers(ctx.organization.id, { q: sp.q, page }),
    listPendingInvitations(ctx.organization.id),
    canManage && can(ctx, "roster.read") ? listTeamOptions(ctx.organization.id) : Promise.resolve([]),
  ]);
  const base = `/o/${orgSlug}/settings/members`;

  return (
    <>
      <PageHeader
        breadcrumb={<Link href={`/o/${orgSlug}/settings`} className="hover:text-ink">Settings</Link>}
        title="Members"
        description={`${members.total} member${members.total === 1 ? "" : "s"}${invitations.length ? ` · ${invitations.length} pending invitation${invitations.length === 1 ? "" : "s"}` : ""}`}
      />
      <MembersPanel
        orgSlug={orgSlug}
        canManage={canManage}
        teamOptions={teams.map((t) => ({ value: t.value, label: t.label }))}
        assignableRoles={ORGANIZATION_ROLES.filter((r) => canAssignRole(ctx.permissions, r, ctx.user.isPlatformAdmin))}
        toolbar={<SearchInput placeholder="Search name or email" className="w-full sm:w-72" />}
        members={members.rows.map((m) => ({ ...m, isSelf: m.userId === ctx.user.id }))}
        invitations={invitations.map((i) => ({ id: i.id, email: i.email, roles: i.roles, created_at: i.created_at, last_sent_at: i.last_sent_at, expired: i.expired }))}
        pagination={
          members.total > members.pageSize ? (
            <Pagination
              page={members.page}
              pageSize={members.pageSize}
              total={members.total}
              hrefFor={(n) => `${base}?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), page: String(n) })}`}
            />
          ) : null
        }
      />
    </>
  );
}

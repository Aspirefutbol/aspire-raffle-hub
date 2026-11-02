import { ShieldOff } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { NAV_ITEMS } from "@/components/layout/nav-config";
import { OrgSwitcher } from "@/components/layout/org-switcher";
import { UserMenu } from "@/components/layout/user-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { can, requireOrgContext } from "@/lib/auth/org-context";
import { getMyOrganizations } from "@/lib/auth/session";
import { ROLE_LABELS } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

export default async function OrgLayout({ children, params }: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const organizations = await getMyOrganizations();

  // Remember the organization so "/" returns here next time.
  if (ctx.user.lastOrganizationId !== ctx.organization.id) {
    const supabase = await createClient();
    await supabase.from("profiles").update({ last_organization_id: ctx.organization.id }).eq("id", ctx.user.id);
  }

  const navItems = NAV_ITEMS.filter((item) => !item.permission || can(ctx, item.permission));
  const hasWorkspaceAccess = can(ctx, "roster.read")
    || can(ctx, "roster.read_own_family")
    || can(ctx, "roster.read_assigned_teams");

  return (
    <AppShell
      base={`/o/${orgSlug}`}
      navItems={hasWorkspaceAccess ? navItems : []}
      showPlatform={ctx.user.isPlatformAdmin}
      footer={
        <>
          <OrgSwitcher current={ctx.organization} organizations={organizations} />
          <UserMenu name={ctx.user.fullName} email={ctx.user.email} roleLabel={ctx.roles.length ? ctx.roles.map((r) => ROLE_LABELS[r]).join(" · ") : null} />
        </>
      }
    >
      {hasWorkspaceAccess ? (
        children
      ) : (
        <EmptyState
          icon={<ShieldOff className="size-5" />}
          title="Your workspace isn’t ready yet"
          description={`Ask an administrator of ${ctx.organization.name} to review your account’s role and family or team access.`}
        />
      )}
    </AppShell>
  );
}

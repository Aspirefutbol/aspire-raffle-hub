import { redirect } from "next/navigation";
import { can, requireOrgContext } from "@/lib/auth/org-context";

export default async function OrgIndex({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const base = `/o/${orgSlug}`;
  if (can(ctx, "roster.read")) redirect(`${base}/dashboard`);
  if (can(ctx, "roster.read_own_family")) redirect(`${base}/fundraising`);
  if (can(ctx, "roster.read_assigned_teams")) redirect(`${base}/team-fundraising`);
  // The organization layout retains its account-not-ready state for members
  // without any workspace capability; do not route them into an admin page.
  return null;
}

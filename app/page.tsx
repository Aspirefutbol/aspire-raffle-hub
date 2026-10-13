import { redirect } from "next/navigation";
import { acceptPendingInvitations, getMyOrganizations, requireSessionUser } from "@/lib/auth/session";

// Entry point: send the user to the organization they used last (or their first).
export default async function Home() {
  const user = await requireSessionUser();
  // Password sign-ins land here: pick up any invitations sent to this email.
  await acceptPendingInvitations();
  const orgs = await getMyOrganizations();
  const target = orgs.find((o) => o.id === user.lastOrganizationId) ?? orgs[0];
  // The organization entry point selects a home using this member's permissions.
  if (target) redirect(`/o/${target.slug}`);
  if (user.isPlatformAdmin) redirect("/platform");
  redirect("/no-access");
}

import { redirect } from "next/navigation";
import { getMyOrganizations, requireSessionUser } from "@/lib/auth/session";

// Entry point: send the user to the organization they used last (or their first).
export default async function Home() {
  const user = await requireSessionUser();
  const orgs = await getMyOrganizations();
  const target = orgs.find((o) => o.id === user.lastOrganizationId) ?? orgs[0];
  if (target) redirect(`/o/${target.slug}/dashboard`);
  if (user.isPlatformAdmin) redirect("/platform");
  redirect("/no-access");
}

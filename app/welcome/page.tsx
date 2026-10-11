import type { Metadata } from "next";
import { BrandMark } from "@/components/brand";
import { acceptPendingInvitations, getMyOrganizations, requireSessionUser } from "@/lib/auth/session";
import { WelcomeForm } from "./welcome-form";

export const metadata: Metadata = { title: "Welcome" };

export default async function WelcomePage() {
  const user = await requireSessionUser();
  await acceptPendingInvitations();
  const orgs = await getMyOrganizations();
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center"><BrandMark /></div>
        <div className="rounded-card border border-line bg-surface p-6 shadow-card">
          <h1 className="text-lg font-semibold text-ink">Welcome to Raffle Hub</h1>
          <p className="mt-1 mb-5 text-sm text-muted">
            {orgs.length
              ? `You now have access to ${orgs.map((o) => o.name).join(", ")}.`
              : "Your account is ready. An administrator still needs to give you access to an organization."}
          </p>
          <WelcomeForm defaultName={user.fullName ?? ""} />
        </div>
      </div>
    </main>
  );
}

import { ShieldOff } from "lucide-react";
import { BrandMark } from "@/components/brand";
import { requireSessionUser } from "@/lib/auth/session";

export default async function NoAccessPage() {
  const user = await requireSessionUser();
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-md text-center">
        <div className="mb-6 flex justify-center"><BrandMark /></div>
        <div className="rounded-card border border-line bg-surface p-6 shadow-card">
          <ShieldOff aria-hidden className="mx-auto mb-3 size-6 text-muted" />
          <h1 className="font-semibold text-ink">No organization yet</h1>
          <p className="mt-1 text-sm text-muted">
            {user.email} isn’t a member of any organization. Ask your organization’s administrator to add you.
          </p>
          <form action="/auth/signout" method="post" className="mt-5">
            <button className="text-sm font-medium text-brand-700 hover:underline">Sign out</button>
          </form>
        </div>
      </div>
    </main>
  );
}

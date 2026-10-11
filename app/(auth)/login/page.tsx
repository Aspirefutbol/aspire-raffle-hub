import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BrandMark } from "@/components/brand";
import { getSessionUser } from "@/lib/auth/session";
import { safeNextPath } from "@/lib/auth/redirect";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const nextPath = safeNextPath(next);
  if (await getSessionUser()) redirect(nextPath);

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <BrandMark />
        </div>
        <div className="rounded-card border border-line bg-surface p-6 shadow-card">
          <h1 className="text-lg font-semibold text-ink">Sign in</h1>
          <p className="mt-1 mb-5 text-sm text-muted">Use the account your organization set up for you.</p>
          {error && (
            <p role="alert" className="mb-4 rounded-control bg-red-50 px-3 py-2 text-sm text-red-700">
              That sign-in link is invalid or expired. Request a new one.
            </p>
          )}
          <LoginForm next={nextPath} />
        </div>
      </div>
    </main>
  );
}

import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { UserMenu } from "@/components/layout/user-menu";
import { requireSessionUser } from "@/lib/auth/session";

export default async function PlatformLayout({ children }: { children: ReactNode }) {
  const user = await requireSessionUser();
  if (!user.isPlatformAdmin) notFound();
  return (
    <AppShell base="" navItems={[]} showPlatform footer={<UserMenu name={user.fullName} email={user.email} roleLabel="Platform Admin" />}>
      {children}
    </AppShell>
  );
}

"use client";

import { BarChart3, BookOpenCheck, LayoutDashboard, Megaphone, Settings, Shield, Users, UsersRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { NavIcon, NavItem } from "./nav-config";

const ICONS: Record<NavIcon, ReactNode> = {
  dashboard: <LayoutDashboard aria-hidden className="size-4" />,
  people: <Users aria-hidden className="size-4" />,
  teams: <UsersRound aria-hidden className="size-4" />,
  campaigns: <Megaphone aria-hidden className="size-4" />,
  learn: <BookOpenCheck aria-hidden className="size-4" />,
  reports: <BarChart3 aria-hidden className="size-4" />,
  settings: <Settings aria-hidden className="size-4" />,
};

export function SidebarNav({ base, items, showPlatform, onNavigate }: {
  base: string;
  items: NavItem[];
  showPlatform: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === base + href || pathname.startsWith(`${base}${href}/`);

  return (
    <nav aria-label="Main" className="space-y-0.5">
      {items.map((item) => {
        const active = isActive(item.href);
        if (item.children) {
          return (
            <div key={item.href} className="pt-1">
              <div
                className={cn(
                  "flex items-center gap-2.5 px-2.5 py-1.5 text-sm font-medium",
                  active ? "text-ink" : "text-ink-soft",
                )}
              >
                {item.icon && ICONS[item.icon]}
                {item.label}
              </div>
              <div className="ml-[1.1rem] space-y-0.5 border-l border-line pl-3">
                {item.children.map((child) => (
                  <NavLink key={child.href} href={base + child.href} active={isActive(child.href)} onNavigate={onNavigate}>
                    {child.label}
                  </NavLink>
                ))}
              </div>
            </div>
          );
        }
        return (
          <NavLink key={item.href} href={base + item.href} active={active} onNavigate={onNavigate}>
            {item.icon && ICONS[item.icon]}
            {item.label}
          </NavLink>
        );
      })}
      {showPlatform && (
        <div className="mt-3 border-t border-line pt-3">
          <NavLink href="/platform" active={pathname.startsWith("/platform")} onNavigate={onNavigate}>
            <Shield aria-hidden className="size-4" />
            Platform
          </NavLink>
        </div>
      )}
    </nav>
  );
}

function NavLink({ href, active, children, onNavigate }: {
  href: string;
  active: boolean;
  children: ReactNode;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-control px-2.5 py-1.5 pointer-coarse:py-3 text-sm transition-colors",
        active ? "bg-brand-50 font-medium text-brand-700" : "text-ink-soft hover:bg-canvas hover:text-ink",
      )}
    >
      {children}
    </Link>
  );
}

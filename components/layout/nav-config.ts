import type { Permission } from "@/lib/permissions";

export type NavIcon = "dashboard" | "people" | "teams" | "campaigns" | "reports" | "settings";

export interface NavItem {
  label: string;
  href: string; // relative to /o/[orgSlug]
  icon?: NavIcon;
  permission?: Permission;
  children?: NavItem[];
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: "dashboard" },
  {
    label: "People",
    href: "/people",
    icon: "people",
    permission: "roster.read",
    children: [
      { label: "Players", href: "/people/players" },
      { label: "Households", href: "/people/households" },
    ],
  },
  { label: "Teams", href: "/teams", icon: "teams", permission: "roster.read" },
  { label: "Campaigns", href: "/campaigns", icon: "campaigns" },
  { label: "Reports", href: "/reports", icon: "reports" },
  { label: "Settings", href: "/settings", icon: "settings" },
];

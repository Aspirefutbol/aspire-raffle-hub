import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function StatCard({ label, value, hint, href, icon, tone = "default" }: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  href?: string;
  icon?: ReactNode;
  tone?: "default" | "attention";
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted">{label}</span>
        {icon && <span className={tone === "attention" ? "text-amber-600" : "text-muted"}>{icon}</span>}
      </div>
      <div className="tabular mt-1 text-2xl font-semibold tracking-tight text-ink">{value}</div>
      {hint && <div className="mt-0.5 truncate text-xs text-muted">{hint}</div>}
    </>
  );
  const cls = cn(
    "block rounded-card border bg-surface px-4 py-3 shadow-card",
    tone === "attention" ? "border-amber-200" : "border-line",
    href && "transition-colors hover:border-brand-300",
  );
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

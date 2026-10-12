import { AlertTriangle, Archive, CheckCircle2, CircleDashed, Info, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "muted";

const tones: Record<Tone, string> = {
  neutral: "bg-canvas text-ink-soft ring-line",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  warning: "bg-amber-50 text-amber-800 ring-amber-200",
  danger: "bg-red-50 text-red-700 ring-red-200",
  info: "bg-brand-50 text-brand-700 ring-brand-200",
  muted: "bg-canvas text-muted ring-line",
};

const icons: Record<Tone, ReactNode> = {
  neutral: <CircleDashed aria-hidden className="size-3" />,
  success: <CheckCircle2 aria-hidden className="size-3" />,
  warning: <AlertTriangle aria-hidden className="size-3" />,
  danger: <XCircle aria-hidden className="size-3" />,
  info: <Info aria-hidden className="size-3" />,
  muted: <Archive aria-hidden className="size-3" />,
};

/** Status = icon + word, never color alone. */
export function Badge({ tone = "neutral", icon = true, children, className }: {
  tone?: Tone;
  icon?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        tones[tone],
        className,
      )}
    >
      {icon && icons[tone]}
      {children}
    </span>
  );
}

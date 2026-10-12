import Link from "next/link";
import { Loader2 } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "subtle";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-1.5 rounded-control font-medium whitespace-nowrap transition-colors " +
  "disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2";

const variants: Record<Variant, string> = {
  primary: "bg-brand-600 text-white shadow-card hover:bg-brand-700",
  secondary: "border border-line-strong bg-surface text-ink-soft shadow-card hover:bg-canvas",
  ghost: "text-ink-soft hover:bg-canvas",
  subtle: "bg-brand-50 text-brand-700 hover:bg-brand-100",
  danger: "border border-red-200 bg-surface text-red-700 hover:bg-red-50",
};

// Touch devices (pointer: coarse) always get at least 44px targets (blueprint §41).
// lg (48px) is the default for phone-first seller and buyer flows.
const sizes: Record<Size, string> = {
  sm: "h-8 px-2.5 text-sm pointer-coarse:h-11 pointer-coarse:px-3.5",
  md: "h-9 px-3.5 text-sm pointer-coarse:h-11 pointer-coarse:px-4",
  lg: "h-12 px-5 text-base",
};

export function buttonClasses(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

type ButtonProps = ComponentProps<"button"> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
};

export function Button({ variant, size, loading, icon, className, children, disabled, type = "button", ...props }: ButtonProps) {
  return (
    <button type={type} className={buttonClasses(variant, size, className)} disabled={disabled || loading} {...props}>
      {loading ? <Loader2 aria-hidden className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

type ButtonLinkProps = ComponentProps<typeof Link> & { variant?: Variant; size?: Size; icon?: ReactNode };

export function ButtonLink({ variant, size, icon, className, children, ...props }: ButtonLinkProps) {
  return (
    <Link className={buttonClasses(variant, size, className)} {...props}>
      {icon}
      {children}
    </Link>
  );
}

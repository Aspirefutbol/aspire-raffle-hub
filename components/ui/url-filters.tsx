"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { cn } from "@/lib/cn";

/** Updates URL search params (resetting pagination) so filters are shareable and server-rendered. */
function useSetParam() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    const qs = next.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }
  return { setParam, params, pending };
}

export function SearchInput({ param = "q", placeholder = "Search…", className }: {
  param?: string;
  placeholder?: string;
  className?: string;
}) {
  const { setParam, params, pending } = useSetParam();
  const current = params.get(param) ?? "";
  const [value, setValue] = useState(current);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastSent = useRef(current);

  useEffect(() => {
    // Keep in sync with external navigation (e.g. clearing filters).
    if (current !== lastSent.current) {
      lastSent.current = current;
      setValue(current);
    }
  }, [current]);

  function onChange(next: string) {
    setValue(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      lastSent.current = next.trim();
      setParam(param, next.trim() || null);
    }, 250);
  }

  return (
    <div className={cn("relative", className)}>
      <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-9 pointer-coarse:h-11 pointer-coarse:text-base w-full rounded-control border border-line-strong bg-surface pr-8 pl-8 text-sm shadow-card placeholder:text-muted/70 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 pointer-coarse:p-2.5 text-muted hover:text-ink"
          aria-label="Clear search"
        >
          <X className="size-3.5" />
        </button>
      )}
      {pending && <span className="sr-only" role="status">Updating results</span>}
    </div>
  );
}

export function FilterSelect({ param, label, options, allLabel = "All", className }: {
  param: string;
  label: string;
  options: Array<{ value: string; label: string }>;
  allLabel?: string;
  className?: string;
}) {
  const { setParam, params } = useSetParam();
  return (
    <select
      aria-label={label}
      value={params.get(param) ?? ""}
      onChange={(e) => setParam(param, e.target.value || null)}
      className={cn(
        "h-9 pointer-coarse:h-11 pointer-coarse:text-base rounded-control border border-line-strong bg-surface px-2.5 pr-8 text-sm text-ink-soft shadow-card focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none",
        className,
      )}
    >
      <option value="">{`${label}: ${allLabel}`}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

"use client";

import { Building2, Check, ChevronsUpDown } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { OrganizationSummary } from "@/lib/auth/session";

export function OrgSwitcher({ current, organizations }: { current: OrganizationSummary; organizations: OrganizationSummary[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const multiple = organizations.length > 1;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => multiple && setOpen((v) => !v)}
        aria-haspopup={multiple ? "listbox" : undefined}
        aria-expanded={multiple ? open : undefined}
        className="flex w-full items-center gap-2 rounded-control border border-line bg-surface px-2.5 py-2 text-left text-sm hover:bg-canvas"
      >
        <span className="grid size-6 shrink-0 place-items-center rounded-md bg-ink text-[11px] font-semibold text-white">
          {current.name.slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-ink">{current.name}</span>
          <span className="block text-[11px] text-muted">Organization</span>
        </span>
        {multiple && <ChevronsUpDown aria-hidden className="size-4 text-muted" />}
      </button>
      {open && (
        <div
          role="listbox"
          aria-label="Switch organization"
          className="absolute bottom-full left-0 z-30 mb-1 max-h-72 w-full overflow-y-auto rounded-control border border-line bg-surface p-1 shadow-pop"
        >
          {organizations.map((org) => (
            <Link
              key={org.id}
              href={`/o/${org.slug}/dashboard`}
              role="option"
              aria-selected={org.id === current.id}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-ink-soft hover:bg-canvas"
            >
              <Building2 aria-hidden className="size-4 text-muted" />
              <span className="flex-1 truncate">{org.name}</span>
              {org.id === current.id && <Check aria-hidden className="size-4 text-brand-600" />}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { Check, Home, Search } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { Input } from "@/components/ui/form-controls";
import { cn } from "@/lib/cn";
import { lookupHouseholds } from "@/lib/roster/actions";

type Found = { id: string; name: string; city: string | null };

/** Server-side household search; works for any roster size. */
export function HouseholdPicker({ orgSlug, value, onChange, id }: {
  orgSlug: string;
  value: string;
  onChange: (id: string) => void;
  id?: string;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Found[]>([]);
  const [selected, setSelected] = useState<Found | null>(null);
  const [searching, startSearch] = useTransition();

  useEffect(() => {
    const t = setTimeout(() => {
      startSearch(async () => {
        const r = await lookupHouseholds(orgSlug, q);
        setResults(r.ok ? r.data : []);
      });
    }, 200);
    return () => clearTimeout(t);
  }, [q, orgSlug]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted" />
        <Input id={id} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search households" aria-label="Search households" className="pl-8" />
      </div>
      {selected && value === selected.id && (
        <p className="flex items-center gap-2 text-sm text-ink"><Check aria-hidden className="size-4 text-brand-600" /> {selected.name}</p>
      )}
      <ul className="max-h-60 divide-y divide-line overflow-y-auto rounded-control border border-line" aria-busy={searching}>
        {results.length === 0 ? (
          <li className="px-3 py-3 text-sm text-muted">{searching ? "Searching…" : "No households match"}</li>
        ) : (
          results.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                onClick={() => { setSelected(h); onChange(h.id); }}
                className={cn("flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-canvas", value === h.id && "bg-brand-50")}
                aria-pressed={value === h.id}
              >
                <Home aria-hidden className="size-4 shrink-0 text-muted" />
                <span className="min-w-0 flex-1 truncate">{h.name}{h.city && <span className="text-muted"> · {h.city}</span>}</span>
                {value === h.id && <Check aria-hidden className="size-4 text-brand-600" />}
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

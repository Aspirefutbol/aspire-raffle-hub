"use client";

import { Check, Search } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/form-controls";
import { Sheet } from "@/components/ui/sheet";
import { fullName } from "@/lib/format";
import { lookupPlayers } from "@/lib/roster/actions";

type Found = { id: string | null; first_name: string | null; last_name: string | null; preferred_name: string | null; team_name: string | null; household_name: string | null };

type PickerProps = {
  orgSlug: string;
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  confirmLabel: (count: number) => string;
  filter?: { withoutHousehold?: boolean; withoutTeam?: boolean };
  onConfirm: (ids: string[]) => void;
  pending?: boolean;
};

/** Search-and-select players, e.g. "Add players to team" or "Add players to household". */
export function PlayerPickerSheet(props: PickerProps) {
  // Mounting on open gives every session a fresh search and selection.
  return props.open ? <PickerContent {...props} /> : null;
}

function PickerContent({ orgSlug, open, onClose, title, description, confirmLabel, filter, onConfirm, pending }: {
  orgSlug: string;
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  confirmLabel: (count: number) => string;
  filter?: { withoutHousehold?: boolean; withoutTeam?: boolean };
  onConfirm: (ids: string[]) => void;
  pending?: boolean;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Found[]>([]);
  const [selected, setSelected] = useState<Map<string, string>>(new Map());
  const [searching, startSearch] = useTransition();
  const [onlyUnassigned, setOnlyUnassigned] = useState(true);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      startSearch(async () => {
        const r = await lookupPlayers(orgSlug, {
          q,
          withoutHousehold: filter?.withoutHousehold && onlyUnassigned,
          withoutTeam: filter?.withoutTeam && onlyUnassigned,
        });
        setResults(r.ok ? r.data : []);
      });
    }, 200);
    return () => clearTimeout(t);
  }, [q, open, orgSlug, filter?.withoutHousehold, filter?.withoutTeam, onlyUnassigned]);

  const toggle = (p: Found) => {
    if (!p.id) return;
    const next = new Map(selected);
    if (next.has(p.id)) next.delete(p.id);
    else next.set(p.id, `${p.first_name} ${p.last_name}`);
    setSelected(next);
  };

  const constrained = filter?.withoutHousehold || filter?.withoutTeam;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted">{selected.size} selected</span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button disabled={!selected.size} loading={pending} onClick={() => onConfirm([...selected.keys()])}>
              {confirmLabel(selected.size)}
            </Button>
          </div>
        </div>
      }
    >
      <div className="relative mb-3">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search players by name"
          aria-label="Search players"
          className="h-9 w-full rounded-control border border-line-strong pl-8 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
        />
      </div>
      {constrained && (
        <label className="mb-3 flex items-center gap-2 text-sm text-ink-soft">
          <Checkbox checked={onlyUnassigned} onChange={(e) => setOnlyUnassigned(e.target.checked)} />
          {filter?.withoutTeam ? "Only players without a team" : "Only players without a household"}
        </label>
      )}
      <ul className="divide-y divide-line rounded-control border border-line" aria-busy={searching}>
        {results.length === 0 && (
          <li className="px-3 py-6 text-center text-sm text-muted">{searching ? "Searching…" : "No players found"}</li>
        )}
        {results.map((p) =>
          p.id ? (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => toggle(p)}
                aria-pressed={selected.has(p.id)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-canvas"
              >
                <span className={`grid size-5 shrink-0 place-items-center rounded border ${selected.has(p.id) ? "border-brand-600 bg-brand-600 text-white" : "border-line-strong"}`}>
                  {selected.has(p.id) && <Check className="size-3.5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">
                    {fullName({ first_name: p.first_name ?? "", last_name: p.last_name ?? "", preferred_name: p.preferred_name })}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {[p.team_name ?? "No team", p.household_name].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </button>
            </li>
          ) : null,
        )}
      </ul>
    </Sheet>
  );
}

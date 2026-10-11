"use client";

import { Archive, ArrowRightLeft, Megaphone, RotateCcw, X } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Checkbox, Select } from "@/components/ui/form-controls";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { formatPhone, fullName, pluralize } from "@/lib/format";
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import { archivePlayers, assignPlayersToTeam, restorePlayers } from "@/lib/roster/actions";
import { PlayerStatusBadge } from "./status-badges";

export interface DirectoryPlayer {
  id: string;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  team_id: string | null;
  team_name: string | null;
  household_id: string | null;
  household_name: string | null;
  primary_guardian_name: string | null;
  primary_guardian_email: string | null;
  primary_guardian_phone: string | null;
  status: string | null;
  archived: boolean;
  note?: string;
}

export function PlayersDirectory({ orgSlug, players, teams, canWrite, emptyState }: {
  orgSlug: string;
  players: DirectoryPlayer[];
  teams: Array<{ value: string; label: string }>;
  canWrite: boolean;
  emptyState: ReactNode;
}) {
  const [rawSelected, setSelected] = useState<Set<string>>(new Set());
  const [targetTeam, setTargetTeam] = useState("");
  const { run, pending } = useActionRunner();
  const ids = useMemo(() => players.map((p) => p.id), [players]);

  // Only rows on screen can be selected (filters/paging may remove some).
  const selected = useMemo(() => new Set([...rawSelected].filter((id) => ids.includes(id))), [rawSelected, ids]);

  const allSelected = selected.size > 0 && selected.size === players.length;
  const selectedRows = players.filter((p) => selected.has(p.id));
  const anyArchived = selectedRows.some((p) => p.archived);
  const anyActive = selectedRows.some((p) => !p.archived);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };
  const clear = () => setSelected(new Set());

  if (players.length === 0) return <>{emptyState}</>;

  return (
    <>
      {canWrite && selected.size > 0 && (
        <div
          role="region"
          aria-label="Bulk actions"
          className="sticky top-14 z-10 flex flex-wrap items-center gap-2 border-b border-brand-200 bg-brand-50 px-4 py-2 lg:top-0"
        >
          <span className="text-sm font-medium text-brand-800">{pluralize(selected.size, "player")} selected</span>
          <button type="button" onClick={clear} className="rounded p-1 text-brand-700 hover:bg-brand-100" aria-label="Clear selection">
            <X className="size-4" />
          </button>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {anyActive && (
              <div className="flex items-center gap-1.5">
                <Select aria-label="Team to assign" value={targetTeam} onChange={(e) => setTargetTeam(e.target.value)} className="h-8 w-44! py-0">
                  <option value="">Assign team…</option>
                  {teams.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  <option value="__none">Remove from team</option>
                </Select>
                <Button
                  size="sm"
                  icon={<ArrowRightLeft className="size-3.5" />}
                  disabled={!targetTeam}
                  loading={pending}
                  onClick={() =>
                    run(
                      () => assignPlayersToTeam(orgSlug, {
                        player_ids: selectedRows.filter((p) => !p.archived).map((p) => p.id),
                        team_id: targetTeam === "__none" ? null : targetTeam,
                      }),
                      { onSuccess: () => { clear(); setTargetTeam(""); } },
                    )
                  }
                >
                  Apply
                </Button>
              </div>
            )}
            <Button size="sm" variant="secondary" disabled title="Available when campaigns launch" icon={<Megaphone className="size-3.5" />}>
              Add to campaign
            </Button>
            {anyArchived && (
              <Button size="sm" variant="secondary" icon={<RotateCcw className="size-3.5" />} loading={pending}
                onClick={() => run(() => restorePlayers(orgSlug, selectedRows.filter((p) => p.archived).map((p) => p.id)), { onSuccess: clear })}>
                Restore
              </Button>
            )}
            {anyActive && (
              <ConfirmButton
                variant="secondary"
                icon={<Archive className="size-3.5" />}
                confirmLabel={`Archive ${selectedRows.filter((p) => !p.archived).length}?`}
                disabled={pending}
                onConfirm={() => run(() => archivePlayers(orgSlug, selectedRows.filter((p) => !p.archived).map((p) => p.id)), { onSuccess: clear })}
              >
                Archive
              </ConfirmButton>
            )}
          </div>
        </div>
      )}

      {/* Desktop table */}
      <div className="hidden md:block">
        <Table>
          <THead>
            <tr>
              {canWrite && (
                <TH className="w-px">
                  <Checkbox
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = selected.size > 0 && !allSelected;
                    }}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(ids))}
                    aria-label="Select all players on this page"
                  />
                </TH>
              )}
              <TH>Player</TH>
              <TH>Team</TH>
              <TH>Household</TH>
              <TH>Primary guardian</TH>
              <TH className="hidden xl:table-cell">Contact</TH>
              <TH>Status</TH>
            </tr>
          </THead>
          <TBody>
            {players.map((p) => (
              <TR key={p.id} className={cn(selected.has(p.id) && "bg-brand-50/60")}>
                {canWrite && (
                  <TD>
                    <Checkbox checked={selected.has(p.id)} onChange={() => toggle(p.id)} aria-label={`Select ${p.first_name} ${p.last_name}`} />
                  </TD>
                )}
                <TD>
                  <Link href={`/o/${orgSlug}/people/players/${p.id}`} className="font-medium text-ink hover:text-brand-700">
                    {fullName(p)}
                  </Link>
                  {p.note && <span className="block text-xs text-amber-700">{p.note}</span>}
                </TD>
                <TD>
                  {p.team_name ? (
                    <Link href={`/o/${orgSlug}/teams/${p.team_id}`} className="text-ink-soft hover:text-brand-700">{p.team_name}</Link>
                  ) : p.archived ? (
                    <span className="text-muted">—</span>
                  ) : (
                    <Badge tone="warning">No team</Badge>
                  )}
                </TD>
                <TD className="text-ink-soft">
                  {p.household_name ? (
                    <Link href={`/o/${orgSlug}/people/households/${p.household_id}`} className="hover:text-brand-700">{p.household_name}</Link>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </TD>
                <TD className="text-ink-soft">{p.primary_guardian_name ?? <span className="text-muted">—</span>}</TD>
                <TD className="hidden max-w-56 truncate text-ink-soft xl:table-cell">
                  {p.primary_guardian_email ?? (formatPhone(p.primary_guardian_phone) || <span className="text-muted">—</span>)}
                </TD>
                <TD><PlayerStatusBadge status={p.archived ? "archived" : p.status} /></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <ul className="divide-y divide-line md:hidden">
        {players.map((p) => (
          <li key={p.id} className={cn("flex items-center gap-3 px-4 py-3", selected.has(p.id) && "bg-brand-50/60")}>
            {canWrite && (
              <Checkbox checked={selected.has(p.id)} onChange={() => toggle(p.id)} aria-label={`Select ${p.first_name} ${p.last_name}`} className="size-5" />
            )}
            <Link href={`/o/${orgSlug}/people/players/${p.id}`} className="min-w-0 flex-1">
              <p className="truncate font-medium text-ink">{fullName(p)}</p>
              <p className="truncate text-xs text-muted">
                {[p.team_name ?? "No team", p.primary_guardian_name].filter(Boolean).join(" · ")}
              </p>
              {p.note && <p className="truncate text-xs text-amber-700">{p.note}</p>}
            </Link>
            {!p.team_name && !p.archived ? <Badge tone="warning">No team</Badge> : <PlayerStatusBadge status={p.archived ? "archived" : p.status} />}
          </li>
        ))}
      </ul>
    </>
  );
}

"use client";

import { Archive, Pencil, Plus, RotateCcw, UsersRound } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import { archiveTeam, restoreTeam } from "@/lib/roster/actions";
import { label } from "@/lib/roster/constants";
import { TeamStatusBadge } from "./status-badges";
import { TeamSheet, type TeamSheetValue } from "./team-sheet";

export interface TeamListItem extends TeamSheetValue {
  id: string;
  season_name: string | null;
  player_count: number;
  archived: boolean;
}

export function TeamsView({ orgSlug, teams, seasons, defaultSeasonId, canWrite, showingArchived, filtered, toolbar }: {
  orgSlug: string;
  teams: TeamListItem[];
  seasons: Array<{ id: string; name: string }>;
  defaultSeasonId: string | null;
  canWrite: boolean;
  showingArchived: boolean;
  filtered: boolean;
  toolbar: ReactNode;
}) {
  const [editing, setEditing] = useState<TeamSheetValue | null>(null);
  const [open, setOpen] = useState(false);
  const { run, pending } = useActionRunner();

  const openNew = () => {
    setEditing(null);
    setOpen(true);
  };
  const openEdit = (t: TeamListItem) => {
    setEditing(t);
    setOpen(true);
  };

  return (
    <>
      {canWrite && (
        <div className="fixed right-4 bottom-4 z-10 sm:hidden">
          <Button onClick={openNew} icon={<Plus className="size-4" />} className="h-11 rounded-full px-4 shadow-pop">New team</Button>
        </div>
      )}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {toolbar}
        {canWrite && (
          <Button onClick={openNew} icon={<Plus className="size-4" />} className="ml-auto hidden sm:inline-flex">New team</Button>
        )}
      </div>

      <Card>
        {teams.length === 0 ? (
          <EmptyState
            icon={<UsersRound className="size-5" />}
            title={showingArchived ? "No archived teams" : filtered ? "No teams match these filters" : "Create your first team"}
            description={showingArchived || filtered ? undefined : "Teams group players by season, age group and division."}
            action={!showingArchived && !filtered && canWrite ? <Button onClick={openNew} icon={<Plus className="size-4" />}>New team</Button> : undefined}
          />
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <THead>
                  <tr>
                    <TH>Team</TH>
                    <TH>Season</TH>
                    <TH>Division</TH>
                    <TH>Coach</TH>
                    <TH className="text-right">Players</TH>
                    <TH>Status</TH>
                    {canWrite && <TH className="w-px"><span className="sr-only">Actions</span></TH>}
                  </tr>
                </THead>
                <TBody>
                  {teams.map((t) => (
                    <TR key={t.id}>
                      <TD>
                        <Link href={`/o/${orgSlug}/teams/${t.id}`} className="font-medium text-ink hover:text-brand-700">{t.name}</Link>
                        {t.team_code && <span className="ml-2 text-xs text-muted">{t.team_code}</span>}
                      </TD>
                      <TD className="text-ink-soft">{t.season_name ?? "—"}</TD>
                      <TD className="text-ink-soft">{[t.age_group, t.gender_division && label(t.gender_division)].filter(Boolean).join(" · ") || "—"}</TD>
                      <TD className="text-ink-soft">{t.coach_name ?? "—"}</TD>
                      <TD className="tabular text-right">{t.player_count}</TD>
                      <TD><TeamStatusBadge status={t.archived ? "archived" : t.status} /></TD>
                      {canWrite && (
                        <TD>
                          <div className="flex justify-end gap-1">
                            {t.archived ? (
                              <Button size="sm" variant="ghost" icon={<RotateCcw className="size-3.5" />} disabled={pending}
                                onClick={() => run(() => restoreTeam(orgSlug, t.id))}>Restore</Button>
                            ) : (
                              <>
                                <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => openEdit(t)}>Edit</Button>
                                <ConfirmButton
                                  variant="ghost"
                                  icon={<Archive className="size-3.5" />}
                                  confirmLabel={t.player_count ? `Archive & unassign ${t.player_count}?` : "Confirm archive"}
                                  disabled={pending}
                                  onConfirm={() => run(() => archiveTeam(orgSlug, t.id))}
                                >
                                  Archive
                                </ConfirmButton>
                              </>
                            )}
                          </div>
                        </TD>
                      )}
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
            <ul className="divide-y divide-line md:hidden">
              {teams.map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                  <Link href={`/o/${orgSlug}/teams/${t.id}`} className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink">{t.name}</p>
                    <p className="truncate text-xs text-muted">
                      {[t.season_name, t.coach_name].filter(Boolean).join(" · ") || "No season"} · {t.player_count} players
                    </p>
                  </Link>
                  <TeamStatusBadge status={t.archived ? "archived" : t.status} />
                  {canWrite && !t.archived && (
                    <Button size="sm" variant="ghost" aria-label={`Edit ${t.name}`} onClick={() => openEdit(t)}>
                      <Pencil className="size-4" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <TeamSheet
        orgSlug={orgSlug}
        open={open}
        onClose={() => setOpen(false)}
        team={editing}
        seasons={seasons}
        defaultSeasonId={defaultSeasonId}
      />
    </>
  );
}

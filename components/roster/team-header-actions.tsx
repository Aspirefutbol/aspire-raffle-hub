"use client";

import { Archive, Pencil, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import { archiveTeam, restoreTeam } from "@/lib/roster/actions";
import { TeamSheet, type TeamSheetValue } from "./team-sheet";

export function TeamHeaderActions({ orgSlug, team, playerCount, archived, seasons }: {
  orgSlug: string;
  team: TeamSheetValue & { id: string };
  playerCount: number;
  archived: boolean;
  seasons: Array<{ id: string; name: string }>;
}) {
  const [open, setOpen] = useState(false);
  const { run, pending } = useActionRunner();
  if (archived) {
    return (
      <Button variant="secondary" icon={<RotateCcw className="size-4" />} loading={pending} onClick={() => run(() => restoreTeam(orgSlug, team.id))}>
        Restore team
      </Button>
    );
  }
  return (
    <>
      <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={() => setOpen(true)}>Edit</Button>
      <ConfirmButton
        size="md"
        variant="secondary"
        icon={<Archive className="size-4" />}
        confirmLabel={playerCount ? `Archive & unassign ${playerCount}?` : "Confirm archive"}
        disabled={pending}
        onConfirm={() => run(() => archiveTeam(orgSlug, team.id))}
      >
        Archive
      </ConfirmButton>
      <TeamSheet orgSlug={orgSlug} open={open} onClose={() => setOpen(false)} team={team} seasons={seasons} defaultSeasonId={team.season_id} />
    </>
  );
}

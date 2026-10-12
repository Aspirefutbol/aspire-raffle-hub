"use client";

import { UserMinus, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Checkbox } from "@/components/ui/form-controls";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate, formatPhone, fullName } from "@/lib/format";
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import { assignPlayersToTeam } from "@/lib/roster/actions";
import { PlayerPickerSheet } from "./player-picker-sheet";

export interface TeamRosterPlayer {
  id: string;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  date_of_birth: string | null;
  household_name: string | null;
  primary_guardian_name: string | null;
  primary_guardian_email: string | null;
  primary_guardian_phone: string | null;
}

export function TeamRoster({ orgSlug, teamId, teamName, players, canWrite, archived }: {
  orgSlug: string;
  teamId: string;
  teamName: string;
  players: TeamRosterPlayer[];
  canWrite: boolean;
  archived: boolean;
}) {
  const [picking, setPicking] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { run, pending } = useActionRunner();
  const editable = canWrite && !archived;

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  return (
    <Card>
      <CardHeader
        title={`Roster · ${players.length}`}
        action={
          editable && (
            <>
              {selected.size > 0 && (
                <Button size="sm" variant="secondary" icon={<UserMinus className="size-3.5" />} loading={pending}
                  onClick={() => run(() => assignPlayersToTeam(orgSlug, { player_ids: [...selected], team_id: null }), { onSuccess: () => setSelected(new Set()) })}>
                  Remove {selected.size}
                </Button>
              )}
              <Button size="sm" icon={<UserPlus className="size-3.5" />} onClick={() => setPicking(true)}>Add players</Button>
            </>
          )
        }
      />
      {players.length === 0 ? (
        <EmptyState
          icon={<Users className="size-5" />}
          title="No players on this team yet"
          description={editable ? "Add players from the master roster. Players without a team are listed first." : undefined}
          action={editable ? <Button onClick={() => setPicking(true)} icon={<UserPlus className="size-4" />}>Add players</Button> : undefined}
        />
      ) : (
        <Table>
          <THead>
            <tr>
              {editable && <TH className="w-px"><span className="sr-only">Select</span></TH>}
              <TH>Player</TH>
              <TH className="hidden sm:table-cell">Born</TH>
              <TH className="hidden md:table-cell">Household</TH>
              <TH className="hidden lg:table-cell">Primary guardian</TH>
            </tr>
          </THead>
          <TBody>
            {players.map((p) => (
              <TR key={p.id}>
                {editable && (
                  <TD>
                    <Checkbox checked={selected.has(p.id)} onChange={() => toggle(p.id)} aria-label={`Select ${p.first_name} ${p.last_name}`} />
                  </TD>
                )}
                <TD>
                  <Link href={`/o/${orgSlug}/people/players/${p.id}`} className="font-medium text-ink hover:text-brand-700">{fullName(p)}</Link>
                </TD>
                <TD className="hidden text-ink-soft sm:table-cell">{formatDate(p.date_of_birth)}</TD>
                <TD className="hidden text-ink-soft md:table-cell">{p.household_name ?? "—"}</TD>
                <TD className="hidden text-ink-soft lg:table-cell">
                  {p.primary_guardian_name ?? "—"}
                  {(p.primary_guardian_email || p.primary_guardian_phone) && (
                    <span className="block text-xs text-muted">{p.primary_guardian_email ?? formatPhone(p.primary_guardian_phone)}</span>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      <PlayerPickerSheet
        orgSlug={orgSlug}
        open={picking}
        onClose={() => setPicking(false)}
        title={`Add players to ${teamName}`}
        description="Players already on another team will be moved; their history is kept."
        filter={{ withoutTeam: true }}
        confirmLabel={(n) => (n ? `Add ${n} to team` : "Add to team")}
        pending={pending}
        onConfirm={(ids) => run(() => assignPlayersToTeam(orgSlug, { player_ids: ids, team_id: teamId }), { onSuccess: () => setPicking(false) })}
      />
    </Card>
  );
}

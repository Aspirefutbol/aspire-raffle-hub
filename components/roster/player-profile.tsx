"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Archive, Home, Link2, Mail, MoreHorizontal, Pencil, Phone, Plus, RotateCcw, Star, Unlink } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { Sheet } from "@/components/ui/sheet";
import { HouseholdPicker } from "./household-picker";
import { formatPhone } from "@/lib/format";
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import {
  addPlayersToHousehold,
  archivePlayers,
  assignPlayersToTeam,
  createHousehold,
  removePlayerFromHousehold,
  restorePlayers,
  setPrimaryGuardian,
  unlinkGuardian,
  updatePlayer,
} from "@/lib/roster/actions";
import { PLAYER_GENDERS, label } from "@/lib/roster/constants";
import { updatePlayerSchema } from "@/lib/roster/schemas";
import { EditGuardianSheet, type EditableGuardian, LinkGuardianSheet, NewGuardianSheet } from "./guardian-sheets";

type Option = { value: string; label: string };

// ── Header actions: edit / archive / restore ─────────────────────────────────

export interface EditablePlayer {
  id: string;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  date_of_birth: string | null;
  gender: string | null;
  external_player_id: string | null;
  notes: string | null;
  status: "active" | "inactive";
}

type EditIn = z.input<typeof updatePlayerSchema>;
type EditOut = z.output<typeof updatePlayerSchema>;

export function PlayerHeaderActions({ orgSlug, player, archived }: { orgSlug: string; player: EditablePlayer; archived: boolean }) {
  const [open, setOpen] = useState(false);
  const { run, pending } = useActionRunner();
  const { register, handleSubmit, reset, setError, formState: { errors } } = useForm<EditIn, unknown, EditOut>({
    resolver: zodResolver(updatePlayerSchema),
  });

  useEffect(() => {
    if (open) {
      reset({
        ...player,
        preferred_name: player.preferred_name ?? "",
        date_of_birth: player.date_of_birth ?? "",
        gender: (player.gender as EditIn["gender"]) ?? "",
        external_player_id: player.external_player_id ?? "",
        notes: player.notes ?? "",
      });
    }
  }, [open, player, reset]);

  if (archived) {
    return (
      <Button variant="secondary" icon={<RotateCcw className="size-4" />} loading={pending} onClick={() => run(() => restorePlayers(orgSlug, [player.id]))}>
        Restore player
      </Button>
    );
  }

  const onSubmit = handleSubmit((values) =>
    run(() => updatePlayer(orgSlug, values), {
      onSuccess: () => setOpen(false),
      onError: (fe) => fe && Object.entries(fe).forEach(([k, m]) => setError(k as keyof EditIn, { message: m })),
    }),
  );

  return (
    <>
      <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={() => setOpen(true)}>Edit</Button>
      <ConfirmButton size="md" variant="secondary" icon={<Archive className="size-4" />} confirmLabel="Confirm archive" disabled={pending}
        onConfirm={() => run(() => archivePlayers(orgSlug, [player.id]))}>
        Archive
      </ConfirmButton>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Edit player"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" form="edit-player-form" loading={pending}>Save changes</Button>
          </div>
        }
      >
        <form id="edit-player-form" onSubmit={onSubmit} className="grid grid-cols-2 gap-3" noValidate>
          <Field label="First name" htmlFor="ep_first" required error={errors.first_name?.message}>
            <Input id="ep_first" {...register("first_name")} />
          </Field>
          <Field label="Last name" htmlFor="ep_last" required error={errors.last_name?.message}>
            <Input id="ep_last" {...register("last_name")} />
          </Field>
          <Field label="Preferred name" htmlFor="ep_pref" error={errors.preferred_name?.message}>
            <Input id="ep_pref" {...register("preferred_name")} />
          </Field>
          <Field label="Date of birth" htmlFor="ep_dob" error={errors.date_of_birth?.message}>
            <Input id="ep_dob" type="date" {...register("date_of_birth")} />
          </Field>
          <Field label="Gender" htmlFor="ep_gender">
            <Select id="ep_gender" {...register("gender")}>
              <option value="">—</option>
              {PLAYER_GENDERS.map((g) => <option key={g} value={g}>{label(g)}</option>)}
            </Select>
          </Field>
          <Field label="External ID" htmlFor="ep_ext" error={errors.external_player_id?.message}>
            <Input id="ep_ext" {...register("external_player_id")} />
          </Field>
          <Field label="Status" htmlFor="ep_status" hint="Inactive players stay on the roster but are hidden by default.">
            <Select id="ep_status" {...register("status")}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </Field>
          <Field label="Notes" htmlFor="ep_notes" className="col-span-2" error={errors.notes?.message}>
            <Textarea id="ep_notes" rows={4} {...register("notes")} />
          </Field>
        </form>
      </Sheet>
    </>
  );
}

// ── Current team ─────────────────────────────────────────────────────────────

export function PlayerTeamControl({ orgSlug, playerId, teamId, teams, disabled }: {
  orgSlug: string;
  playerId: string;
  teamId: string | null;
  teams: Option[];
  disabled?: boolean;
}) {
  // Parent passes key={teamId}, so this resets when the saved team changes.
  const [value, setValue] = useState(teamId ?? "");
  const { run, pending } = useActionRunner();
  const dirty = value !== (teamId ?? "");
  return (
    <div className="flex gap-2">
      <Select aria-label="Team" value={value} onChange={(e) => setValue(e.target.value)} disabled={disabled}>
        <option value="">No team</option>
        {teams.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
      </Select>
      {dirty && (
        <Button loading={pending} onClick={() => run(() => assignPlayersToTeam(orgSlug, { player_ids: [playerId], team_id: value || null }))}>
          Save
        </Button>
      )}
    </div>
  );
}

// ── Household ────────────────────────────────────────────────────────────────

export function PlayerHouseholdCard({ orgSlug, playerId, playerLastName, household, canWrite }: {
  orgSlug: string;
  playerId: string;
  playerLastName: string;
  household: { id: string; name: string } | null;
  canWrite: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [existing, setExisting] = useState("");
  const [name, setName] = useState("");
  const { run, pending } = useActionRunner();

  const openSheet = () => {
    setMode("existing");
    setExisting("");
    setName(`${playerLastName} Household`);
    setOpen(true);
  };

  const save = () => {
    if (mode === "existing" && existing) {
      run(() => addPlayersToHousehold(orgSlug, { household_id: existing, player_ids: [playerId] }), { onSuccess: () => setOpen(false) });
    } else if (mode === "new" && name.trim()) {
      run(() => createHousehold(orgSlug, { name, player_ids: [playerId] }), { onSuccess: () => setOpen(false) });
    }
  };

  return (
    <Card>
      <CardHeader
        title="Household"
        action={
          canWrite && household && (
            <ConfirmButton variant="ghost" confirmLabel="Remove?" disabled={pending} onConfirm={() => run(() => removePlayerFromHousehold(orgSlug, playerId))}>
              Remove
            </ConfirmButton>
          )
        }
      />
      <div className="px-4 py-3">
        {household ? (
          <Link href={`/o/${orgSlug}/people/households/${household.id}`} className="flex items-center gap-2 text-sm font-medium text-ink hover:text-brand-700">
            <Home aria-hidden className="size-4 text-muted" /> {household.name}
          </Link>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-muted">Not in a household yet</span>
            {canWrite && <Button size="sm" variant="subtle" icon={<Plus className="size-3.5" />} onClick={openSheet}>Set household</Button>}
          </div>
        )}
      </div>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Set household"
        description="Siblings share one household. The household’s guardians are linked automatically."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button loading={pending} disabled={mode === "existing" ? !existing : !name.trim()} onClick={save}>Save</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex gap-4 text-sm">
            <label className="flex min-h-11 items-center gap-2"><input type="radio" className="size-5" checked={mode === "existing"} onChange={() => setMode("existing")} /> Existing household</label>
            <label className="flex min-h-11 items-center gap-2"><input type="radio" className="size-5" checked={mode === "new"} onChange={() => setMode("new")} /> New household</label>
          </div>
          {mode === "existing" ? (
            <Field label="Household" htmlFor="set_hh">
              <HouseholdPicker id="set_hh" orgSlug={orgSlug} value={existing} onChange={setExisting} />
            </Field>
          ) : (
            <Field label="Household name" htmlFor="new_hh">
              <Input id="new_hh" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
          )}
        </div>
      </Sheet>
    </Card>
  );
}

// ── Guardians ────────────────────────────────────────────────────────────────

export interface ProfileGuardian extends EditableGuardian {
  relationship: string;
  is_primary: boolean;
  household_id: string | null;
}

export function PlayerGuardiansCard({ orgSlug, playerId, householdId, guardians, canWrite }: {
  orgSlug: string;
  playerId: string;
  householdId: string | null;
  guardians: ProfileGuardian[];
  canWrite: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [linking, setLinking] = useState(false);
  const [editing, setEditing] = useState<EditableGuardian | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const { run, pending } = useActionRunner();

  return (
    <Card>
      <CardHeader
        title={`Parents / guardians · ${guardians.length}`}
        action={
          canWrite && (
            <>
              <Button size="sm" variant="ghost" icon={<Link2 className="size-3.5" />} onClick={() => setLinking(true)}>Link existing</Button>
              <Button size="sm" variant="subtle" icon={<Plus className="size-3.5" />} onClick={() => setAdding(true)}>Add</Button>
            </>
          )
        }
      />
      {guardians.length === 0 ? (
        <EmptyState
          title="No guardian yet"
          description="Add a parent or guardian so families can be invited and notified in later phases."
          action={canWrite ? <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setAdding(true)}>Add guardian</Button> : undefined}
        />
      ) : (
        <ul className="divide-y divide-line">
          {guardians.map((g) => (
            <li key={g.id} className="flex items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                  {g.first_name} {g.last_name}
                  <span className="text-xs font-normal text-muted">{label(g.relationship)}</span>
                  {g.is_primary && <Badge tone="info" icon={false}><Star aria-hidden className="size-3" /> Primary</Badge>}
                </p>
                <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-ink-soft">
                  {g.email && <a href={`mailto:${g.email}`} className="inline-flex items-center gap-1 hover:text-brand-700"><Mail aria-hidden className="size-3" />{g.email}</a>}
                  {g.phone && <a href={`tel:${g.phone}`} className="inline-flex items-center gap-1 hover:text-brand-700"><Phone aria-hidden className="size-3" />{formatPhone(g.phone)}</a>}
                  {!g.email && !g.phone && <Badge tone="warning">No contact info</Badge>}
                </div>
              </div>
              {canWrite && (
                <div className="relative">
                  <Button size="sm" variant="ghost" aria-label={`Actions for ${g.first_name}`} aria-expanded={menu === g.id} onClick={() => setMenu(menu === g.id ? null : g.id)}>
                    <MoreHorizontal className="size-4" />
                  </Button>
                  {menu === g.id && (
                    <div className="absolute right-0 z-20 mt-1 w-44 rounded-control border border-line bg-surface p-1 shadow-pop" onMouseLeave={() => setMenu(null)}>
                      <MenuItem icon={<Pencil className="size-3.5" />} onClick={() => { setEditing(g); setMenu(null); }}>Edit contact</MenuItem>
                      {!g.is_primary && (
                        <MenuItem icon={<Star className="size-3.5" />} disabled={pending}
                          onClick={() => { setMenu(null); run(() => setPrimaryGuardian(orgSlug, { player_id: playerId, guardian_id: g.id })); }}>
                          Make primary
                        </MenuItem>
                      )}
                      <MenuItem icon={<Unlink className="size-3.5" />} danger disabled={pending}
                        onClick={() => { setMenu(null); run(() => unlinkGuardian(orgSlug, { player_id: playerId, guardian_id: g.id })); }}>
                        Unlink from player
                      </MenuItem>
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <NewGuardianSheet
        orgSlug={orgSlug}
        open={adding}
        onClose={() => setAdding(false)}
        householdId={householdId}
        playerIds={[playerId]}
        makePrimary={guardians.length === 0}
        description={householdId ? "They’ll be added to this player’s household." : "Tip: set a household first so siblings share guardians."}
      />
      <LinkGuardianSheet orgSlug={orgSlug} open={linking} onClose={() => setLinking(false)} playerId={playerId} excludeIds={guardians.map((g) => g.id)} />
      <EditGuardianSheet orgSlug={orgSlug} guardian={editing} onClose={() => setEditing(null)} />
    </Card>
  );
}

function MenuItem({ children, icon, onClick, danger, disabled }: {
  children: ReactNode;
  icon: ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 pointer-coarse:py-3 text-left text-sm hover:bg-canvas disabled:opacity-50 ${danger ? "text-red-700" : "text-ink-soft"}`}
    >
      {icon}
      {children}
    </button>
  );
}

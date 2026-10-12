"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Archive, Home, Mail, Pencil, Phone, Plus, Star, UserMinus, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Textarea } from "@/components/ui/form-controls";
import { Sheet } from "@/components/ui/sheet";
import { formatPhone, fullName } from "@/lib/format";
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import {
  addPlayersToHousehold,
  archiveGuardian,
  archiveHousehold,
  createHousehold,
  removePlayerFromHousehold,
  setHouseholdPrimaryContact,
  updateHousehold,
} from "@/lib/roster/actions";
import { householdInputSchema } from "@/lib/roster/schemas";
import { EditGuardianSheet, type EditableGuardian, NewGuardianSheet } from "./guardian-sheets";
import { PlayerPickerSheet } from "./player-picker-sheet";

type FormIn = z.input<typeof householdInputSchema>;
type FormOut = z.output<typeof householdInputSchema>;

export interface HouseholdValue {
  id?: string;
  name: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  notes: string | null;
}

export function HouseholdSheet({ orgSlug, open, onClose, household }: {
  orgSlug: string;
  open: boolean;
  onClose: () => void;
  household?: HouseholdValue | null;
}) {
  const router = useRouter();
  const { run, pending } = useActionRunner();
  const { register, handleSubmit, reset, setError, formState: { errors } } = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(householdInputSchema),
  });

  useEffect(() => {
    if (!open) return;
    reset({
      name: household?.name ?? "",
      address_line1: household?.address_line1 ?? "",
      address_line2: household?.address_line2 ?? "",
      city: household?.city ?? "",
      region: household?.region ?? "",
      postal_code: household?.postal_code ?? "",
      notes: household?.notes ?? "",
    });
  }, [open, household, reset]);

  const onSubmit = handleSubmit((values) =>
    run(
      () => (household?.id ? updateHousehold(orgSlug, { ...values, id: household.id }) : createHousehold(orgSlug, values)),
      {
        onSuccess: (data) => {
          onClose();
          if (!household?.id && data && typeof data === "object" && "id" in data) {
            router.push(`/o/${orgSlug}/people/households/${data.id}`);
          }
        },
        onError: (fe) => fe && Object.entries(fe).forEach(([k, m]) => setError(k as keyof FormIn, { message: m })),
      },
    ),
  );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={household?.id ? "Edit household" : "New household"}
      description={household?.id ? undefined : "Add players and guardians on the next screen."}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="household-form" loading={pending}>{household?.id ? "Save changes" : "Create household"}</Button>
        </div>
      }
    >
      <form id="household-form" onSubmit={onSubmit} className="grid grid-cols-6 gap-3" noValidate>
        <Field label="Household name" htmlFor="hh_name" required error={errors.name?.message} className="col-span-6" hint="e.g. Garcia Household">
          <Input id="hh_name" autoFocus aria-invalid={!!errors.name} {...register("name")} />
        </Field>
        <Field label="Address" htmlFor="hh_a1" className="col-span-6">
          <Input id="hh_a1" autoComplete="address-line1" {...register("address_line1")} />
        </Field>
        <Field label="Address line 2" htmlFor="hh_a2" className="col-span-6">
          <Input id="hh_a2" autoComplete="address-line2" {...register("address_line2")} />
        </Field>
        <Field label="City" htmlFor="hh_city" className="col-span-6 sm:col-span-3">
          <Input id="hh_city" autoComplete="address-level2" {...register("city")} />
        </Field>
        <Field label="State" htmlFor="hh_region" className="col-span-3 sm:col-span-1">
          <Input id="hh_region" autoComplete="address-level1" {...register("region")} />
        </Field>
        <Field label="ZIP" htmlFor="hh_zip" className="col-span-3 sm:col-span-2">
          <Input id="hh_zip" autoComplete="postal-code" {...register("postal_code")} />
        </Field>
        <Field label="Notes" htmlFor="hh_notes" className="col-span-6">
          <Textarea id="hh_notes" rows={3} {...register("notes")} />
        </Field>
      </form>
    </Sheet>
  );
}

export function NewHouseholdButton({ orgSlug }: { orgSlug: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>New household</Button>
      <HouseholdSheet orgSlug={orgSlug} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

// ── Household detail ─────────────────────────────────────────────────────────

export function HouseholdHeaderActions({ orgSlug, household, activePlayers }: { orgSlug: string; household: HouseholdValue & { id: string }; activePlayers: number }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { run, pending } = useActionRunner();
  return (
    <>
      <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={() => setOpen(true)}>Edit</Button>
      <ConfirmButton
        size="md"
        variant="secondary"
        icon={<Archive className="size-4" />}
        confirmLabel="Confirm archive"
        disabled={pending || activePlayers > 0}
        onConfirm={() => run(() => archiveHousehold(orgSlug, household.id), { onSuccess: () => router.push(`/o/${orgSlug}/people/households`) })}
      >
        Archive
      </ConfirmButton>
      <HouseholdSheet orgSlug={orgSlug} open={open} onClose={() => setOpen(false)} household={household} />
    </>
  );
}

export interface HouseholdPlayer {
  id: string;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  team_name: string | null;
  archived: boolean;
}

export function HouseholdPlayersCard({ orgSlug, householdId, householdName, players, canWrite }: {
  orgSlug: string;
  householdId: string;
  householdName: string;
  players: HouseholdPlayer[];
  canWrite: boolean;
}) {
  const [picking, setPicking] = useState(false);
  const { run, pending } = useActionRunner();
  return (
    <Card>
      <CardHeader
        title={`Players · ${players.filter((p) => !p.archived).length}`}
        action={canWrite && <Button size="sm" variant="subtle" icon={<UserPlus className="size-3.5" />} onClick={() => setPicking(true)}>Add players</Button>}
      />
      {players.length === 0 ? (
        <EmptyState icon={<Users className="size-5" />} title="No players in this household" description="Add siblings from the roster — they’ll share this household’s guardians." />
      ) : (
        <ul className="divide-y divide-line">
          {players.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
              <Link href={`/o/${orgSlug}/people/players/${p.id}`} className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink hover:text-brand-700">{fullName(p)}</span>
                <span className="block text-xs text-muted">{p.archived ? "Archived" : (p.team_name ?? "No team")}</span>
              </Link>
              {canWrite && (
                <ConfirmButton variant="ghost" icon={<UserMinus className="size-3.5" />} confirmLabel="Remove?" disabled={pending}
                  onConfirm={() => run(() => removePlayerFromHousehold(orgSlug, p.id))}>
                  <span className="sr-only sm:not-sr-only">Remove</span>
                </ConfirmButton>
              )}
            </li>
          ))}
        </ul>
      )}
      <PlayerPickerSheet
        orgSlug={orgSlug}
        open={picking}
        onClose={() => setPicking(false)}
        title={`Add players to ${householdName}`}
        description="Players are linked to this household’s guardians automatically."
        filter={{ withoutHousehold: true }}
        confirmLabel={(n) => (n ? `Add ${n}` : "Add")}
        pending={pending}
        onConfirm={(ids) => run(() => addPlayersToHousehold(orgSlug, { household_id: householdId, player_ids: ids }), { onSuccess: () => setPicking(false) })}
      />
    </Card>
  );
}

export interface HouseholdGuardian extends EditableGuardian {
  is_primary_contact: boolean;
  linkedPlayers: number;
}

export function HouseholdGuardiansCard({ orgSlug, householdId, guardians, playerIds, canWrite }: {
  orgSlug: string;
  householdId: string;
  guardians: HouseholdGuardian[];
  playerIds: string[];
  canWrite: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<EditableGuardian | null>(null);
  const { run, pending } = useActionRunner();
  return (
    <Card>
      <CardHeader
        title={`Guardians · ${guardians.length}`}
        action={canWrite && <Button size="sm" variant="subtle" icon={<Plus className="size-3.5" />} onClick={() => setAdding(true)}>Add guardian</Button>}
      />
      {guardians.length === 0 ? (
        <EmptyState
          icon={<Home className="size-5" />}
          title="No guardians yet"
          description="Add at least one parent or guardian with an email or phone number."
          action={canWrite ? <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setAdding(true)}>Add guardian</Button> : undefined}
        />
      ) : (
        <ul className="divide-y divide-line">
          {guardians.map((g) => (
            <li key={g.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                  {g.first_name} {g.last_name}
                  {g.is_primary_contact && <Badge tone="info" icon={false}><Star aria-hidden className="size-3" /> Primary contact</Badge>}
                </p>
                <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-ink-soft">
                  {g.email && <span className="inline-flex items-center gap-1"><Mail aria-hidden className="size-3" />{g.email}</span>}
                  {g.phone && <span className="inline-flex items-center gap-1"><Phone aria-hidden className="size-3" />{formatPhone(g.phone)}</span>}
                  {!g.email && !g.phone && <Badge tone="warning">No contact info</Badge>}
                  <span className="text-muted">Linked to {g.linkedPlayers} player{g.linkedPlayers === 1 ? "" : "s"}</span>
                </div>
              </div>
              {canWrite && (
                <div className="flex gap-1">
                  {!g.is_primary_contact && (
                    <Button size="sm" variant="ghost" icon={<Star className="size-3.5" />} disabled={pending}
                      onClick={() => run(() => setHouseholdPrimaryContact(orgSlug, g.id))}>
                      Make primary
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => setEditing(g)}>Edit</Button>
                  <ConfirmButton variant="ghost" confirmLabel="Remove?" disabled={pending} onConfirm={() => run(() => archiveGuardian(orgSlug, g.id))}>
                    Remove
                  </ConfirmButton>
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
        playerIds={playerIds}
        description={playerIds.length ? `They’ll be linked to all ${playerIds.length} player${playerIds.length === 1 ? "" : "s"} in this household.` : undefined}
      />
      <EditGuardianSheet orgSlug={orgSlug} guardian={editing} onClose={() => setEditing(null)} />
    </Card>
  );
}

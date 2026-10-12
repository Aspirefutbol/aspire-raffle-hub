"use client";

import { Clock, Home, Mail, Pencil, RotateCcw, Send, ShieldCheck, Shirt, UserPlus, Users, X } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/form-controls";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { formatRelative } from "@/lib/format";
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import { addMember, resendInvitation, revokeInvitation, setMemberRoles, setMemberStatus } from "@/lib/members/actions";
import { ORGANIZATION_ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS, type OrganizationRole } from "@/lib/permissions";
import { type FamilyLink, MemberFamilySheet, MemberTeamsSheet, type TeamOption } from "./member-scope-sheets";

export interface MemberView {
  memberId: string;
  name: string;
  email: string;
  status: string;
  roles: OrganizationRole[];
  isSelf: boolean;
  teams: { id: string; name: string }[];
  familyLinks: FamilyLink[];
}

export interface InvitationView {
  id: string;
  email: string;
  roles: OrganizationRole[];
  created_at: string;
  last_sent_at: string | null;
  expired: boolean;
}

/** Checkbox list of roles; roles the viewer can't grant are disabled with a hint. */
function RolePicker({ value, onChange, assignable, idPrefix }: {
  value: OrganizationRole[];
  onChange: (roles: OrganizationRole[]) => void;
  assignable: ReadonlySet<OrganizationRole>;
  idPrefix: string;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-sm font-medium text-ink-soft">Roles</legend>
      {ORGANIZATION_ROLES.map((role) => {
        const checked = value.includes(role);
        const allowed = assignable.has(role);
        return (
          <label
            key={role}
            htmlFor={`${idPrefix}-${role}`}
            className={cn(
              "flex min-h-11 cursor-pointer items-start gap-3 rounded-control border px-3 py-2.5",
              checked ? "border-brand-400 bg-brand-50" : "border-line",
              !allowed && "cursor-not-allowed opacity-60",
            )}
          >
            <input
              id={`${idPrefix}-${role}`}
              type="checkbox"
              className="mt-0.5 size-5 shrink-0 accent-brand-600"
              checked={checked}
              disabled={!allowed}
              onChange={(e) => onChange(e.target.checked ? [...value, role] : value.filter((r) => r !== role))}
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-ink">{ROLE_LABELS[role]}</span>
              <span className="block text-xs text-muted">
                {ROLE_DESCRIPTIONS[role]}
                {!allowed && " · You can’t grant this role (it includes permissions you don’t have)."}
              </span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

export function MembersPanel({ orgSlug, members, invitations, canManage, assignableRoles, teamOptions, toolbar, pagination }: {
  orgSlug: string;
  teamOptions: TeamOption[];
  members: MemberView[];
  invitations: InvitationView[];
  canManage: boolean;
  assignableRoles: OrganizationRole[];
  toolbar: ReactNode;
  pagination: ReactNode;
}) {
  const assignable = new Set(assignableRoles);
  const { run, pending } = useActionRunner();

  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState("");
  const [newRoles, setNewRoles] = useState<OrganizationRole[]>([]);
  const [addError, setAddError] = useState<string | undefined>();

  const [editing, setEditing] = useState<MemberView | null>(null);
  const [editRoles, setEditRoles] = useState<OrganizationRole[]>([]);
  const [reason, setReason] = useState("");
  const [scope, setScope] = useState<{ kind: "teams" | "family"; member: MemberView } | null>(null);

  const openAdd = () => {
    setEmail("");
    setNewRoles([]);
    setAddError(undefined);
    setAdding(true);
  };
  const openEdit = (m: MemberView) => {
    setEditing(m);
    setEditRoles(m.roles);
    setReason("");
  };

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {toolbar}
        {canManage && (
          <Button className="ml-auto" icon={<UserPlus className="size-4" />} onClick={openAdd}>
            Add member
          </Button>
        )}
      </div>

      {invitations.length > 0 && (
        <Card className="mb-4">
          <CardHeader title={`Pending invitations · ${invitations.length}`} description="Accepted automatically when the person signs in with this email." />
          <ul className="divide-y divide-line">
            {invitations.map((inv) => (
              <li key={inv.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate text-sm font-medium text-ink">
                    <Mail aria-hidden className="size-4 shrink-0 text-muted" /> {inv.email}
                    {inv.expired && <Badge tone="warning">Expired</Badge>}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {inv.roles.map((r) => ROLE_LABELS[r]).join(" + ")} · invited {formatRelative(inv.created_at)}
                    {inv.last_sent_at ? ` · last sent ${formatRelative(inv.last_sent_at)}` : " · email not sent yet"}
                  </p>
                </div>
                {canManage && (
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" icon={<Send className="size-3.5" />} disabled={pending}
                      onClick={() => run(() => resendInvitation(orgSlug, { invitation_id: inv.id }))}>
                      Resend
                    </Button>
                    <ConfirmButton variant="ghost" icon={<X className="size-3.5" />} confirmLabel="Revoke?" disabled={pending}
                      onConfirm={() => run(() => revokeInvitation(orgSlug, { invitation_id: inv.id }))}>
                      Revoke
                    </ConfirmButton>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="overflow-hidden">
        {members.length === 0 ? (
          <EmptyState icon={<Users className="size-5" />} title="No members match" />
        ) : (
          <ul className="divide-y divide-line">
            {members.map((m) => (
              <li key={m.memberId} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                    {m.name}
                    {m.isSelf && <Badge tone="info" icon={false}>You</Badge>}
                    {m.status !== "active" && <Badge tone="warning">{m.status}</Badge>}
                  </p>
                  <p className="truncate text-xs text-muted">{m.email}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {m.roles.map((r) => (
                      <Badge key={r} tone={r === "DIRECTOR" || r === "ORGANIZATION_ADMIN" ? "info" : "neutral"} icon={false}>
                        {r === "DIRECTOR" && <ShieldCheck aria-hidden className="size-3" />}
                        {ROLE_LABELS[r]}
                      </Badge>
                    ))}
                  </div>
                  {(m.roles.includes("TEAM_CAPTAIN") || m.teams.length > 0) && (
                    <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
                      <Shirt aria-hidden className="size-3.5 shrink-0" />
                      {m.teams.length ? `Teams: ${m.teams.map((t) => t.name).join(", ")}` : "No teams assigned — sees no roster data"}
                    </p>
                  )}
                  {(m.roles.includes("PARTICIPANT_FAMILY") || m.familyLinks.length > 0) && (
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                      <Home aria-hidden className="size-3.5 shrink-0" />
                      {m.familyLinks.length
                        ? `Family: ${m.familyLinks.map((l) => (l.householdName ? `${l.guardianName} (${l.householdName})` : l.guardianName)).join(", ")}`
                        : "Not linked to a family — sees no roster data"}
                    </p>
                  )}
                </div>
                {canManage && (
                  <div className="flex flex-wrap gap-1">
                    <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => openEdit(m)}>
                      Roles
                    </Button>
                    {(m.roles.includes("TEAM_CAPTAIN") || m.teams.length > 0) && (
                      <Button size="sm" variant="ghost" icon={<Shirt className="size-3.5" />} onClick={() => setScope({ kind: "teams", member: m })}>
                        Teams
                      </Button>
                    )}
                    {(m.roles.includes("PARTICIPANT_FAMILY") || m.familyLinks.length > 0) && (
                      <Button size="sm" variant="ghost" icon={<Home className="size-3.5" />} onClick={() => setScope({ kind: "family", member: m })}>
                        Family access
                      </Button>
                    )}
                    {!m.isSelf && (
                      <ConfirmButton
                        variant="ghost"
                        icon={m.status === "active" ? <Clock className="size-3.5" /> : <RotateCcw className="size-3.5" />}
                        confirmLabel={m.status === "active" ? "Suspend?" : "Reactivate?"}
                        disabled={pending}
                        onConfirm={() => run(() => setMemberStatus(orgSlug, { member_id: m.memberId, status: m.status === "active" ? "suspended" : "active" }))}
                      >
                        {m.status === "active" ? "Suspend" : "Reactivate"}
                      </ConfirmButton>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {pagination}
      </Card>

      {/* Add member / invite */}
      <Sheet
        open={adding}
        onClose={() => setAdding(false)}
        title="Add member"
        description="If the email already has an account, they’re added right away. Otherwise they get an invitation email."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAdding(false)}>Cancel</Button>
            <Button
              loading={pending}
              disabled={!email.trim() || newRoles.length === 0}
              onClick={() =>
                run(() => addMember(orgSlug, { email, roles: newRoles }), {
                  onSuccess: () => setAdding(false),
                  onError: (fe) => setAddError(fe?.email ?? fe?.roles),
                })
              }
            >
              Add or invite
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field label="Email" htmlFor="member-email" required error={addError} hint="Matched exactly (case-insensitive). Nothing is guessed.">
            <Input id="member-email" type="email" inputMode="email" autoComplete="off" autoFocus value={email}
              onChange={(e) => { setEmail(e.target.value); setAddError(undefined); }} aria-invalid={Boolean(addError) || undefined} />
          </Field>
          <RolePicker value={newRoles} onChange={setNewRoles} assignable={assignable} idPrefix="add" />
        </div>
      </Sheet>

      {scope?.kind === "teams" && (
        <MemberTeamsSheet orgSlug={orgSlug} memberId={scope.member.memberId} memberName={scope.member.name}
          current={scope.member.teams.map((t) => t.id)} teams={teamOptions} onClose={() => setScope(null)} />
      )}
      {scope?.kind === "family" && (
        <MemberFamilySheet orgSlug={orgSlug} memberId={scope.member.memberId} memberName={scope.member.name}
          links={members.find((x) => x.memberId === scope.member.memberId)?.familyLinks ?? scope.member.familyLinks} onClose={() => setScope(null)} />
      )}

      {/* Edit roles */}
      <Sheet
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing ? `Roles · ${editing.name}` : "Roles"}
        description="A person can hold several roles. Their permissions are the combination of all of them."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            <Button
              loading={pending}
              disabled={!editing || editRoles.length === 0}
              onClick={() =>
                editing && run(() => setMemberRoles(orgSlug, { member_id: editing.memberId, roles: editRoles, reason }), { onSuccess: () => setEditing(null) })
              }
            >
              Save roles
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <RolePicker value={editRoles} onChange={setEditRoles} assignable={assignable} idPrefix="edit" />
          <Field label="Reason (recorded in the activity log)" htmlFor="role-reason" hint="Optional, but recommended for permission changes.">
            <Input id="role-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        </div>
      </Sheet>
    </>
  );
}

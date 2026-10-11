"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Select } from "@/components/ui/form-controls";
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import { ORGANIZATION_ROLES, ROLE_LABELS, type OrganizationRole } from "@/lib/permissions";
import { changeMemberRole, setMemberStatus } from "@/lib/settings/actions";

export interface MemberRow {
  id: string;
  name: string;
  email: string;
  role_key: OrganizationRole;
  status: string;
  isSelf: boolean;
}

export function MembersCard({ orgSlug, members, canManage }: { orgSlug: string; members: MemberRow[]; canManage: boolean }) {
  const { run, pending } = useActionRunner();
  return (
    <Card>
      <CardHeader
        title={`Members · ${members.length}`}
        description="People who can sign in to this organization. Invitations arrive with family self-registration; until then accounts are created by your platform administrator."
      />
      <ul className="divide-y divide-line">
        {members.map((m) => (
          <li key={m.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 truncate text-sm font-medium text-ink">
                {m.name}
                {m.isSelf && <Badge tone="info" icon={false}>You</Badge>}
                {m.status !== "active" && <Badge tone="warning">{m.status}</Badge>}
              </p>
              <p className="truncate text-xs text-muted">{m.email}</p>
            </div>
            {canManage && !m.isSelf ? (
              <div className="flex items-center gap-2">
                <Select
                  aria-label={`Role for ${m.name}`}
                  value={m.role_key}
                  disabled={pending}
                  onChange={(e) => run(() => changeMemberRole(orgSlug, { member_id: m.id, role_key: e.target.value }))}
                  className="h-8 w-52! py-0"
                >
                  {ORGANIZATION_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </Select>
                <ConfirmButton
                  variant="ghost"
                  confirmLabel={m.status === "active" ? "Suspend?" : "Reactivate?"}
                  disabled={pending}
                  onConfirm={() => run(() => setMemberStatus(orgSlug, { member_id: m.id, status: m.status === "active" ? "suspended" : "active" }))}
                >
                  {m.status === "active" ? "Suspend" : "Reactivate"}
                </ConfirmButton>
              </div>
            ) : (
              <span className="text-sm text-ink-soft">{ROLE_LABELS[m.role_key]}</span>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

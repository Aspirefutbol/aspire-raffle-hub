"use client";

import { Check, Link2, Search, Unlink } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Field, Input } from "@/components/ui/form-controls";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import { linkFamilyGuardian, setMemberTeams, unlinkFamilyGuardian } from "@/lib/members/actions";
import { lookupGuardians } from "@/lib/roster/actions";

export type TeamOption = { value: string; label: string };
export type FamilyLink = { linkId: string; guardianId: string; guardianName: string; householdName: string | null };

/** Team Manager/Captain → the teams they may read. Mounted only while open. */
export function MemberTeamsSheet({ orgSlug, memberId, memberName, current, teams, onClose }: {
  orgSlug: string;
  memberId: string;
  memberName: string;
  current: string[];
  teams: TeamOption[];
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<string[]>(current);
  const [reason, setReason] = useState("");
  const { run, pending } = useActionRunner();

  return (
    <Sheet
      open
      onClose={onClose}
      title={`Teams · ${memberName}`}
      description="A Team Manager/Captain can read only these teams, their current players and those players’ guardians."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={pending} onClick={() => run(() => setMemberTeams(orgSlug, { member_id: memberId, team_ids: selected, reason }), { onSuccess: onClose })}>
            Save teams
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {teams.length === 0 ? (
          <p className="text-sm text-muted">No active teams yet.</p>
        ) : (
          <fieldset className="space-y-1.5">
            <legend className="mb-1 text-sm font-medium text-ink-soft">Assigned teams</legend>
            {teams.map((t) => {
              const checked = selected.includes(t.value);
              return (
                <label key={t.value} className={cn("flex min-h-11 cursor-pointer items-center gap-3 rounded-control border px-3 py-2", checked ? "border-brand-400 bg-brand-50" : "border-line")}>
                  <input type="checkbox" className="size-5 shrink-0 accent-brand-600" checked={checked}
                    onChange={(e) => setSelected(e.target.checked ? [...selected, t.value] : selected.filter((x) => x !== t.value))} />
                  <span className="text-sm text-ink">{t.label}</span>
                </label>
              );
            })}
          </fieldset>
        )}
        <Field label="Reason (recorded in the activity log)" htmlFor="teams-reason">
          <Input id="teams-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
    </Sheet>
  );
}

type FoundGuardian = { id: string; first_name: string; last_name: string; email: string | null; households: { name: string } | null };

/** Seller/Family account → the guardian record(s) it is. Defines which household/players it can read. */
export function MemberFamilySheet({ orgSlug, memberId, memberName, links, onClose }: {
  orgSlug: string;
  memberId: string;
  memberName: string;
  links: FamilyLink[];
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<FoundGuardian[]>([]);
  const [reason, setReason] = useState("");
  const [searching, startSearch] = useTransition();
  const { run, pending } = useActionRunner();
  const searchable = q.trim().length >= 2;
  const linked = new Set(links.map((l) => l.guardianId));

  useEffect(() => {
    if (!searchable) return;
    const t = setTimeout(() => {
      startSearch(async () => {
        const r = await lookupGuardians(orgSlug, q);
        setResults(r.ok ? r.data : []);
      });
    }, 200);
    return () => clearTimeout(t);
  }, [q, searchable, orgSlug]);

  return (
    <Sheet
      open
      onClose={onClose}
      title={`Family access · ${memberName}`}
      description="Link this account to the guardian record it belongs to. The account can then read only that household and its players."
      footer={<div className="flex justify-end"><Button variant="secondary" onClick={onClose}>Done</Button></div>}
    >
      <div className="space-y-8">
        <section aria-labelledby="family-linked-heading" className="space-y-3">
          <h3 id="family-linked-heading" className="text-sm font-semibold text-ink">Linked guardian records</h3>
          {links.length === 0 ? (
            <p className="text-sm text-muted">Not linked yet — this account can’t see any family data.</p>
          ) : (
            <ul className="divide-y divide-line rounded-control border border-line">
              {links.map((l) => (
                <li key={l.linkId} className="flex min-h-11 items-center gap-3 px-3 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-sm font-medium text-ink">{l.guardianName}</span>
                    <span className="mt-0.5 block break-words text-xs text-muted">{l.householdName || "No household"}</span>
                  </span>
                  <ConfirmButton variant="ghost" icon={<Unlink className="size-3.5" />} confirmLabel="Unlink?" disabled={pending}
                    onConfirm={() => run(() => unlinkFamilyGuardian(orgSlug, { link_id: l.linkId, reason }))}>
                    Unlink
                  </ConfirmButton>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-labelledby="family-search-heading" className="space-y-4 rounded-control border border-line-strong bg-canvas/50 p-4">
          <div>
            <h3 id="family-search-heading" className="text-sm font-semibold text-ink">Link another guardian</h3>
            <p id="family-search-hint" className="mt-1 text-sm text-muted">Search by guardian name or email.</p>
          </div>
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search guardians..." aria-label="Search guardians" aria-describedby="family-search-hint" className="h-11 border-brand-300 pl-10 text-base" />
          </div>
          {searchable && (
            <ul className="max-h-64 divide-y divide-line overflow-y-auto rounded-control border border-line bg-surface" aria-label="Guardian search results" aria-busy={searching}>
              {results.length === 0 ? (
                <li className="px-3 py-3 text-sm text-muted">{searching ? "Searching…" : "No guardians match"}</li>
              ) : (
                results.map((g) => (
                  <li key={g.id} className="flex min-h-11 items-center gap-2 px-3 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink">{g.first_name} {g.last_name}</span>
                      <span className="block truncate text-xs text-muted">{[g.households?.name, g.email].filter(Boolean).join(" · ") || "No household"}</span>
                    </span>
                    <Button size="sm" variant={linked.has(g.id) ? "secondary" : "subtle"} className="shrink-0"
                      icon={linked.has(g.id) ? <Check aria-hidden className="size-3.5" /> : <Link2 aria-hidden className="size-3.5" />} disabled={pending || linked.has(g.id)}
                      onClick={() => run(() => linkFamilyGuardian(orgSlug, { member_id: memberId, guardian_id: g.id, reason }))}>
                      {linked.has(g.id) ? "Linked" : "Link"}
                    </Button>
                  </li>
                ))
              )}
            </ul>
          )}
          <Field label="Reason / note" htmlFor="family-reason" hint="Optional. Recorded in the activity log." className="border-t border-line pt-4">
            <Input id="family-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Verified parent at registration" />
          </Field>
        </section>
      </div>
    </Sheet>
  );
}

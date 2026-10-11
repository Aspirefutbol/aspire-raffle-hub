"use client";

import { Archive, Check } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { formatDate, fullName } from "@/lib/format";
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import { archivePlayers, dismissDuplicate } from "@/lib/roster/actions";

export interface DuplicateSide {
  id: string;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  date_of_birth: string | null;
  team_name: string | null;
  household_name: string | null;
  primary_guardian_name: string | null;
  external_player_id: string | null;
  created_at: string | null;
}

/** Side-by-side review of possible duplicates. Nothing is merged automatically. */
export function DuplicatePairs({ orgSlug, pairs, canWrite }: {
  orgSlug: string;
  pairs: Array<{ a: DuplicateSide; b: DuplicateSide; reason: string }>;
  canWrite: boolean;
}) {
  const { run, pending } = useActionRunner();
  if (!pairs.length) return null;
  return (
    <Card className="mb-4">
      <CardHeader
        title={`Review ${pairs.length} possible duplicate ${pairs.length === 1 ? "pair" : "pairs"}`}
        description="Keep both if they are different players, or archive the extra record. Archived players can be restored."
      />
      <ul className="divide-y divide-line">
        {pairs.map(({ a, b, reason }) => (
          <li key={`${a.id}-${b.id}`} className="px-4 py-3">
            <p className="mb-2 text-xs font-medium text-amber-700">{reason}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {[a, b].map((p) => (
                <div key={p.id} className="flex items-start justify-between gap-2 rounded-control border border-line bg-canvas/50 p-3">
                  <div className="min-w-0 text-sm">
                    <Link href={`/o/${orgSlug}/people/players/${p.id}`} className="font-medium text-ink hover:text-brand-700">{fullName(p)}</Link>
                    <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 text-xs text-muted">
                      <dt>Born</dt><dd className="text-ink-soft">{formatDate(p.date_of_birth)}</dd>
                      <dt>Team</dt><dd className="text-ink-soft">{p.team_name ?? "—"}</dd>
                      <dt>Household</dt><dd className="truncate text-ink-soft">{p.household_name ?? "—"}</dd>
                      <dt>Guardian</dt><dd className="truncate text-ink-soft">{p.primary_guardian_name ?? "—"}</dd>
                      {p.external_player_id && (<><dt>Ext. ID</dt><dd className="text-ink-soft">{p.external_player_id}</dd></>)}
                      <dt>Added</dt><dd className="text-ink-soft">{formatDate(p.created_at)}</dd>
                    </dl>
                  </div>
                  {canWrite && (
                    <ConfirmButton variant="ghost" icon={<Archive className="size-3.5" />} confirmLabel="Archive this one?" disabled={pending}
                      onConfirm={() => run(() => archivePlayers(orgSlug, [p.id]))}>
                      Archive
                    </ConfirmButton>
                  )}
                </div>
              ))}
            </div>
            {canWrite && (
              <div className="mt-2 flex justify-end">
                <Button size="sm" variant="secondary" icon={<Check className="size-3.5" />} loading={pending}
                  onClick={() => run(() => dismissDuplicate(orgSlug, { a: a.id, b: b.id }))}>
                  Not duplicates — keep both
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

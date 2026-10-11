"use client";

import { FileSpreadsheet } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { formatRelative } from "@/lib/format";
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import { deleteSavedMapping } from "@/lib/roster/import/actions";

export function MappingsCard({ orgSlug, mappings }: {
  orgSlug: string;
  mappings: Array<{ id: string; name: string; columns: number; last_used_at: string | null; created_at: string }>;
}) {
  const { run, pending } = useActionRunner();
  return (
    <Card>
      <CardHeader title="Saved import mappings" description="Applied automatically when a file with the same columns is uploaded." />
      {mappings.length === 0 ? (
        <p className="px-4 py-4 text-sm text-muted">None yet. Save a mapping during your next import.</p>
      ) : (
        <ul className="divide-y divide-line">
          {mappings.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-4 py-2.5">
              <FileSpreadsheet aria-hidden className="size-4 text-muted" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{m.name}</p>
                <p className="text-xs text-muted">
                  {m.columns} columns mapped · {m.last_used_at ? `last used ${formatRelative(m.last_used_at)}` : `saved ${formatRelative(m.created_at)}`}
                </p>
              </div>
              <ConfirmButton variant="ghost" confirmLabel="Delete?" disabled={pending} onConfirm={() => run(() => deleteSavedMapping(orgSlug, m.id))}>
                Delete
              </ConfirmButton>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

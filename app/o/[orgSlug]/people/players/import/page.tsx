import { FileSpreadsheet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ImportStepper } from "@/components/import/stepper";
import { UploadCard } from "@/components/import/upload-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireOrgContext, requirePagePermission } from "@/lib/auth/org-context";
import { formatRelative } from "@/lib/format";
import { IMPORT_STATUS } from "@/lib/roster/import/status";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Import players" };


export default async function ImportIndexPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  requirePagePermission(ctx, "roster.import");

  const supabase = await createClient();
  const { data: imports, error } = await supabase
    .from("imports")
    .select("id, file_name, source_name, status, row_count, summary, created_at")
    .eq("organization_id", ctx.organization.id)
    .order("created_at", { ascending: false })
    .limit(25);
  if (error) throw new Error(error.message);

  return (
    <>
      <PageHeader
        breadcrumb={<Link href={`/o/${orgSlug}/people/players`} className="hover:text-ink">Players</Link>}
        title="Import players"
        description="Bring in a roster spreadsheet. You’ll map columns, review issues and duplicates, then confirm."
      />
      <ImportStepper current={0} />
      <UploadCard orgSlug={orgSlug} />

      <Card className="mt-4">
        <CardHeader title="Import history" />
        {imports.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted">No imports yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {imports.map((imp) => {
              const status = IMPORT_STATUS[imp.status] ?? { tone: "neutral" as const, label: imp.status };
              const s = (imp.summary ?? {}) as Record<string, unknown>;
              const detail =
                imp.status === "completed"
                  ? `${Number(s.players_created ?? 0)} added · ${Number(s.players_linked ?? 0) + Number(s.players_matched_existing ?? 0)} matched · ${Number(s.rows_skipped ?? 0)} skipped`
                  : `${imp.row_count} rows`;
              return (
                <li key={imp.id}>
                  <Link href={`/o/${orgSlug}/people/players/import/${imp.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-canvas/70">
                    <FileSpreadsheet aria-hidden className="size-4 shrink-0 text-muted" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{imp.file_name}</p>
                      <p className="truncate text-xs text-muted">
                        {detail}
                        {imp.source_name ? ` · ${imp.source_name}` : ""} · {formatRelative(imp.created_at)}
                      </p>
                    </div>
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}

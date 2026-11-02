"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { verifyDrawingSnapshot } from "@/lib/drawing/actions";
import type { DrawingIntegrity } from "@/lib/drawing/schemas";
import { useActionRunner } from "@/lib/hooks/use-action-runner";

const checks: Array<[keyof DrawingIntegrity, string]> = [
  ["count_ok", "Ticket count and face value"], ["entries_ok", "Entry hashes"],
  ["manifest_ok", "Canonical manifest"], ["source_anchors_ok", "Captured ledger positions"],
  ["ledger_chains_ok", "Ledger hash chains"], ["audit_anchor_ok", "Original audit receipts"],
];

export function SnapshotIntegrity({ orgSlug, campaignId, verification: initial }: {
  orgSlug: string; campaignId: string; verification: DrawingIntegrity;
}) {
  const [verification, setVerification] = useState(initial);
  const { run, pending } = useActionRunner();
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-3"><Badge tone={verification.ok ? "success" : "danger"}>{verification.ok ? "Integrity verified" : "Integrity verification failed"}</Badge><Button variant="secondary" size="sm" loading={pending} onClick={() => run(() => verifyDrawingSnapshot(orgSlug, { campaign_id: campaignId, snapshot_id: verification.snapshot_id }), { onSuccess: setVerification })}>Verify snapshot</Button></div>
    <ul className="grid gap-x-5 gap-y-1 text-xs text-ink-soft sm:grid-cols-2" aria-label="Snapshot verification checks">{checks.map(([key, label]) => <li key={key}>{verification[key] ? "Passed" : "Failed"}: {label}</li>)}</ul>
    {!verification.ok && <p role="alert" className="text-sm text-red-700">Resolve the integrity failure before exporting or continuing the drawing.</p>}
  </div>;
}

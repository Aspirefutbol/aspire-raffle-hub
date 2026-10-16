import { randomUUID } from "node:crypto";
import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CampaignStatusBadge } from "@/components/campaigns/progress";
import { SnapshotIntegrity } from "@/components/drawing/integrity";
import { HelpLink } from "@/components/learning/help-link";
import { DrawingOperationButton, ExternalResultButton } from "@/components/drawing/operation-sheets";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { WorkflowPanel } from "@/components/ui/workflow-panel";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { can, requireOrgContext, requirePagePermission } from "@/lib/auth/org-context";
import { isCampaignStatus } from "@/lib/campaigns/lifecycle";
import { getDrawingIntegrity, getDrawingOverview, getDrawingReadiness } from "@/lib/drawing/queries";
import { formatDateTime } from "@/lib/format";
import { formatMoney } from "@/lib/fundraising/money";
import { getCampaignSetup } from "@/lib/fundraising/queries";

export const metadata: Metadata = { title: "Drawing" };

const eventLabels = { FROZEN: "Entries frozen", REOPENED: "Drawing reopened", EXPORTED: "Export recorded", CERTIFIED: "Drawing certified" };

export default async function DrawingPage({ params }: { params: Promise<{ orgSlug: string; campaignId: string }> }) {
  const { orgSlug, campaignId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  requirePagePermission(ctx, "campaigns.read");
  const [setup, readiness, overview] = await Promise.all([
    getCampaignSetup(ctx, campaignId), getDrawingReadiness(ctx, campaignId), getDrawingOverview(ctx, campaignId),
  ]);
  if (!setup || !readiness || !overview || !isCampaignStatus(setup.campaign.status)) notFound();
  const { campaign } = setup;
  const status = setup.campaign.status;
  const verifications = await Promise.all(overview.snapshots.map((snapshot) => getDrawingIntegrity(ctx, snapshot.id)));
  const verificationById = new Map(verifications.map((verification) => [verification.snapshot_id, verification]));
  const current = overview.snapshots.find((snapshot) => snapshot.id === overview.current_snapshot_id);
  const certification = current && overview.events.find((event) => event.snapshot_id === current.id && event.event_type === "CERTIFIED");
  const canManage = can(ctx, "drawing.manage");
  const canCertify = can(ctx, "drawing.certify");
  const canExport = overview.can_export && can(ctx, "exports.run") &&
    (can(ctx, "organization.manage") || can(ctx, "reconciliation.manage") || can(ctx, "adjustments.approve") || can(ctx, "audit.read"));
  const campaignRoute = `/o/${orgSlug}/campaigns/${campaignId}`;
  const timezone = ctx.organization.timezone;

  return <>
    <PageHeader title="Drawing" breadcrumb={<Link href={campaignRoute} className="hover:text-ink">{campaign.name}</Link>} description="Freeze eligible entries, retain private exports, and record the approved physical or external drawing." actions={<>
      {can(ctx, "organization.manage") && <HelpLink orgSlug={orgSlug} article="freeze-drawing" label="Drawing guide" />}
      <CampaignStatusBadge status={status} />
      {canManage && !current && <DrawingOperationButton orgSlug={orgSlug} campaignId={campaignId} operation="freeze" disabled={!readiness.ready} />}
      {status === "CLOSED" && certification && current && canCertify && can(ctx, "campaigns.activate") && <DrawingOperationButton orgSlug={orgSlug} campaignId={campaignId} operation="drawn" disabled={!verificationById.get(current.id)?.ok} />}
    </>} />

    <WorkflowPanel className="mb-5" icon={<ShieldCheck aria-hidden className="size-4" />} title={current ? "Frozen population" : "Drawing readiness"} description="Action center · The application does not generate a random winner. Use the current frozen population for the operator's approved drawing." bodyClassName="space-y-4">
      <div className="grid grid-cols-2 gap-3"><StatCard label={current ? "Frozen eligible tickets" : "Eligible issued tickets"} value={current?.ticket_count ?? readiness.eligible_ticket_count} /><StatCard label="Total face value" value={formatMoney(current?.total_face_value_cents ?? readiness.total_face_value_cents)} /></div>
      <p className="text-sm text-ink-soft">Disclosed drawing: {formatDateTime(campaign.draw_at, timezone)} · {timezone}</p>
      {!current && (readiness.blocking.length ? <div><Badge tone="warning">Complete before freeze</Badge><ul className="mt-2 space-y-1 text-sm text-ink-soft">{readiness.blocking.map((blocker) => <li key={blocker}>• {blocker}</li>)}</ul></div> : <Badge tone="success">Ready for operator review and freeze</Badge>)}
      <ul className="space-y-1 text-xs text-muted" aria-label="Drawing warnings">{readiness.warnings.map((warning) => <li key={warning}>• {warning}</li>)}</ul>
      {!current && !canManage && <p className="text-sm text-ink-soft">An authorized drawing manager can freeze the entries after readiness review.</p>}
      {campaign.rules_text && <details className="rounded-control border border-line p-3"><summary className="cursor-pointer text-sm font-medium text-ink-soft">Review locked raffle rules and prizes</summary><p className="mt-3 whitespace-pre-wrap break-words text-sm text-ink-soft">{campaign.rules_text}</p></details>}
    </WorkflowPanel>

    {overview.snapshots.length === 0 && <Card className="mb-5"><CardHeader title="No frozen snapshot yet" /><CardBody><p className="text-sm text-ink-soft">Close sales, complete the readiness review, and freeze the eligible entries before conducting the physical or external drawing.</p></CardBody></Card>}
    <div className="space-y-5">{overview.snapshots.map((snapshot) => {
      const isCurrent = snapshot.id === overview.current_snapshot_id;
      const verification = verificationById.get(snapshot.id)!;
      const results = overview.results.filter((result) => result.snapshot_id === snapshot.id);
      const certified = overview.events.find((event) => event.snapshot_id === snapshot.id && event.event_type === "CERTIFIED");
      const openForEvidence = isCurrent && status === "CLOSED" && !certified;
      return <section key={snapshot.id} data-testid="drawing-snapshot" data-version={snapshot.version}>
        <Card><CardHeader title={<span className="flex flex-wrap items-center gap-2">Snapshot version {snapshot.version}<Badge tone={certified ? "success" : isCurrent ? "info" : "muted"}>{certified ? "Certified" : isCurrent ? "Current frozen snapshot" : "Superseded / reopened"}</Badge></span>} description={isCurrent ? "Use this population for the approved drawing." : "Historical population retained for audit. Use the current version for the drawing."} /><CardBody className="space-y-5">
          <dl className="grid gap-x-5 gap-y-3 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-muted">Snapshot ID</dt><dd className="break-all font-mono text-xs">{snapshot.id}</dd></div>
            <div><dt className="text-xs text-muted">Frozen at</dt><dd>{formatDateTime(snapshot.created_at, timezone)} · {timezone}</dd></div>
            <div><dt className="text-xs text-muted">Frozen by actor ID</dt><dd className="break-all font-mono text-xs">{snapshot.created_by}</dd></div>
            <div><dt className="text-xs text-muted">Eligible count / face value</dt><dd>{snapshot.ticket_count.toLocaleString()} tickets · {formatMoney(snapshot.total_face_value_cents)}</dd></div>
            <div className="sm:col-span-2"><dt className="text-xs text-muted">Canonical manifest SHA-256</dt><dd data-testid="drawing-manifest-hash" className="mt-1 break-all rounded-control bg-canvas p-2 font-mono text-xs">{snapshot.manifest_hash}</dd></div>
            <div className="sm:col-span-2"><dt className="text-xs text-muted">Freeze reason</dt><dd className="whitespace-pre-wrap break-words">{snapshot.reason}</dd></div>
          </dl>
          <SnapshotIntegrity orgSlug={orgSlug} campaignId={campaignId} verification={verification} />
          {canExport ? <div className="space-y-2"><div className="flex flex-wrap gap-2">{(["csv", "json"] as const).map((format) => <form key={format} method="post" action={`${campaignRoute}/drawing/export`}>
            <input type="hidden" name="snapshot_id" value={snapshot.id} /><input type="hidden" name="format" value={format} /><input type="hidden" name="idempotency_key" value={randomUUID()} />
            <Button variant="secondary" type="submit" disabled={!verification.ok}>{format === "csv" ? "Download CSV" : "Download JSON manifest"}</Button>
          </form>)}</div><p className="text-xs text-muted">Private buyer exports. Retain both files and the separately stored manifest hash in the approved drawing-record location. Export history records an exporter-reported file checksum. The frozen manifest is independently verified.</p></div> : <p className="text-xs text-muted">An authorized exporter can download the private buyer files. This screen does not display buyer contacts.</p>}
          {certified && <div className="rounded-control border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"><p className="font-medium">Director certification recorded</p><p className="mt-1">{formatDateTime(certified.created_at, timezone)} · {timezone}</p><p className="mt-1 break-all text-xs">Certifying actor ID: {certified.created_by}</p><p className="mt-2 whitespace-pre-wrap break-words">{certified.reason}</p>{typeof certified.metadata.results_hash === "string" && <p className="mt-2 break-all font-mono text-xs">Ordered result SHA-256: {certified.metadata.results_hash}</p>}</div>}
          <div className="space-y-3"><h3 className="text-sm font-semibold text-ink">Physical / external results</h3>{results.length === 0 ? <p className="text-sm text-muted">No external result recorded. Conduct the approved drawing from this frozen population before recording evidence.</p> : results.map((result) => <article key={result.id} className="space-y-3 rounded-control border border-line bg-canvas/50 p-3">
            <div className="flex flex-wrap items-center gap-2"><span className="text-xs text-muted">Winning ticket</span><strong className="font-mono text-sm text-ink">{result.ticket_number}</strong><Badge tone="info">{result.method === "physical" ? "Physical drawing" : "External drawing"}</Badge></div>
            <dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-xs text-muted">Actual drawing time</dt><dd>{formatDateTime(result.drawn_at, timezone)} · {timezone}</dd></div><div><dt className="text-xs text-muted">Location</dt><dd className="break-words">{result.location}</dd></div><div><dt className="text-xs text-muted">Operator</dt><dd className="break-words">{result.operator_name}</dd></div><div><dt className="text-xs text-muted">Witnesses</dt><dd className="break-words">{result.witnesses.join(", ")}</dd></div><div className="sm:col-span-2"><dt className="text-xs text-muted">Result / evidence</dt><dd className="whitespace-pre-wrap break-words">{result.result}</dd></div>{result.evidence_ref && <div className="sm:col-span-2"><dt className="text-xs text-muted">Evidence reference</dt><dd className="whitespace-pre-wrap break-all">{result.evidence_ref}</dd></div>}<div className="sm:col-span-2"><dt className="text-xs text-muted">Result SHA-256</dt><dd className="break-all font-mono text-xs">{result.result_hash}</dd></div><div><dt className="text-xs text-muted">Recorded at</dt><dd>{formatDateTime(result.created_at, timezone)}</dd></div><div><dt className="text-xs text-muted">Recording actor ID</dt><dd className="break-all font-mono text-xs">{result.created_by}</dd></div><div className="sm:col-span-2"><dt className="text-xs text-muted">Record reason</dt><dd className="whitespace-pre-wrap break-words">{result.reason}</dd></div></dl>
          </article>)}</div>
          {openForEvidence && <div className="flex flex-wrap gap-2">
            {canManage && <ExternalResultButton orgSlug={orgSlug} campaignId={campaignId} snapshotId={snapshot.id} freezeTime={snapshot.created_at} disclosedDrawTime={campaign.draw_at} disabled={!verification.ok} />}
            {canCertify && results.length === 0 && <DrawingOperationButton orgSlug={orgSlug} campaignId={campaignId} snapshotId={snapshot.id} operation="reopen" />}
            {canCertify && results.length > 0 && <DrawingOperationButton orgSlug={orgSlug} campaignId={campaignId} snapshotId={snapshot.id} operation="certify" disabled={!verification.ok} />}
          </div>}
        </CardBody></Card>
      </section>;
    })}</div>

    {overview.events.length > 0 && <Card className="mt-5"><CardHeader title="Drawing history" description="Frozen versions, reopening, reported exports, and Director certification remain retained." /><CardBody><ol className="space-y-4">{[...overview.events].reverse().map((event) => <li key={event.id} className="border-b border-line pb-4 last:border-0 last:pb-0"><p className="text-sm font-medium text-ink">{eventLabels[event.event_type]} · Snapshot version {overview.snapshots.find((snapshot) => snapshot.id === event.snapshot_id)?.version}</p><p className="mt-1 text-xs text-muted">{formatDateTime(event.created_at, timezone)} · {timezone}</p><p className="mt-1 break-all font-mono text-xs text-muted">Actor ID: {event.created_by}</p>{event.reason && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink-soft">{event.reason}</p>}{event.event_type === "EXPORTED" && <><p className="mt-1 text-xs text-muted">Format: {typeof event.metadata.format === "string" ? event.metadata.format.toUpperCase() : "Unknown"} · Delivery not confirmed</p>{typeof event.metadata.export_sha256 === "string" && <p className="mt-1 break-all font-mono text-xs text-muted">Reported file SHA-256: {event.metadata.export_sha256}</p>}</>}</li>)}</ol></CardBody></Card>}
  </>;
}

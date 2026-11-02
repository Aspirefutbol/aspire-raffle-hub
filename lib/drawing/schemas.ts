import { z } from "zod";
import { id, optionalText } from "@/lib/validation";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const reason = z.string().trim().min(3, "Give a reason of at least 3 characters.").max(500);
const request = z.object({
  campaign_id: id,
  idempotency_key: z.string().trim().min(1).max(200),
  reason,
});

export const freezeDrawingSchema = request.extend({
  prize_readiness_confirmed: z.literal(true, { error: "Confirm approved prizes and drawing readiness." }),
});
export const snapshotActionSchema = request.extend({ snapshot_id: id });
export const verifySnapshotSchema = z.object({ campaign_id: id, snapshot_id: id });
export const externalDrawingResultSchema = snapshotActionSchema.extend({
  drawn_at: z.iso.datetime({ offset: true }),
  location: z.string().trim().min(3).max(500),
  operator: z.string().trim().min(3).max(200),
  witnesses: z.array(z.string().trim().min(3).max(200)).min(1, "Record at least one witness.").max(20),
  method: z.enum(["physical", "external"]),
  winning_ticket_number: z.string().trim().min(1).max(200),
  result: z.string().trim().min(3).max(2000),
  evidence_ref: optionalText(1000),
});

export const drawingReadinessSchema = z.object({
  campaign_id: id, status: z.string(), ready: z.boolean(),
  blocking: z.array(z.string()), warnings: z.array(z.string()),
  eligible_ticket_count: count, total_face_value_cents: count,
  current_snapshot_id: id.nullable(),
});

// These projections deliberately contain no snapshot entries or buyer contacts.
export const drawingSnapshotSchema = z.object({
  id, organization_id: id, campaign_id: id, version: count,
  supersedes_snapshot_id: id.nullable(), created_at: z.string(), created_by: id,
  reason: z.string(), prize_readiness_confirmed: z.boolean(),
  ticket_count: count, total_face_value_cents: count, manifest_hash: hash,
});
export const drawingEventSchema = z.object({
  id, campaign_id: id, snapshot_id: id,
  event_type: z.enum(["FROZEN", "REOPENED", "EXPORTED", "CERTIFIED"]),
  created_at: z.string(), created_by: id, reason: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
});
export const drawingResultSchema = z.object({
  id, campaign_id: id, snapshot_id: id, ticket_number: z.string(),
  drawn_at: z.string(), location: z.string(), operator_name: z.string(),
  witnesses: z.array(z.string()), method: z.enum(["physical", "external"]),
  result: z.string(), evidence_ref: z.string().nullable(), reason: z.string(),
  created_at: z.string(), created_by: id, result_hash: hash,
});
export const drawingOverviewSchema = z.object({
  campaign_id: id, current_snapshot_id: id.nullable(),
  snapshots: z.array(drawingSnapshotSchema), events: z.array(drawingEventSchema),
  results: z.array(drawingResultSchema), can_export: z.boolean(),
});
export const drawingIntegritySchema = z.object({
  snapshot_id: id, ok: z.boolean(), count_ok: z.boolean(), entries_ok: z.boolean(),
  manifest_ok: z.boolean(), source_anchors_ok: z.boolean(),
  ledger_chains_ok: z.boolean(), audit_anchor_ok: z.boolean(),
});
export const externalDrawingResultReceiptSchema = z.object({
  result_id: id, snapshot_id: id, ticket_number: z.string(), replayed: z.boolean(),
});

export type DrawingOverview = z.infer<typeof drawingOverviewSchema>;
export type DrawingSnapshot = z.infer<typeof drawingSnapshotSchema>;
export type DrawingIntegrity = z.infer<typeof drawingIntegritySchema>;
export type ExternalDrawingResultPayload = z.infer<typeof externalDrawingResultSchema>;
export type ExternalDrawingResultReceipt = z.infer<typeof externalDrawingResultReceiptSchema>;

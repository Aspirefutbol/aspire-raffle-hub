import { isDeepStrictEqual } from "node:util";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getOrgContext } from "@/lib/auth/org-context";
import { getSessionUser } from "@/lib/auth/session";
import { drawingCsv, drawingFileHash, drawingJson, makeDrawingArtifact, type DrawingArtifactEntry } from "@/lib/drawing/export";
import { drawingIntegritySchema } from "@/lib/drawing/schemas";
import { publicEnv } from "@/lib/env";
import type { Permission } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { id } from "@/lib/validation";

export const runtime = "nodejs";

const PAGE_SIZE = 1000;
const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};
const BUYER_PERMISSIONS: readonly Permission[] = [
  "organization.manage", "reconciliation.manage", "adjustments.approve", "audit.read",
];
const quantity = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const formSchema = z.object({
  snapshot_id: id.transform((value) => value.toLowerCase()),
  format: z.enum(["csv", "json"]),
  idempotency_key: z.string().trim().min(1).max(200),
});
const snapshotSchema = z.object({
  id, organization_id: id, campaign_id: id,
  version: quantity, ticket_count: quantity, total_face_value_cents: quantity,
  manifest: z.record(z.string(), z.unknown()),
  manifest_canonical: z.string().min(1), manifest_hash: hash,
}).passthrough();
const manifestSchema = z.object({
  snapshot_id: id, organization_id: id, campaign_id: id,
  version: quantity, ticket_count: quantity, total_face_value_cents: quantity,
}).passthrough();
const pageSchema = z.object({
  snapshot: snapshotSchema,
  entries: z.array(z.object({ entry_payload_canonical: z.string().min(1), entry_hash: hash })),
  offset: z.number().int().nonnegative(), limit: z.literal(PAGE_SIZE),
  total: quantity, has_more: z.boolean(), historical: z.boolean(),
});
const receiptSchema = z.object({ event_id: id, snapshot_id: id, replayed: z.boolean() });

function failure(message: string, status: number, headers: Record<string, string> = {}) {
  return Response.json({ error: message }, { status, headers: { ...PRIVATE_HEADERS, ...headers } });
}

function rpcFailure(code: string) {
  if (code === "42501") return failure("You do not have permission to export drawing buyers.", 403);
  if (code === "P0002") return failure("Drawing snapshot not found.", 404);
  if (code === "23514" || code === "23505") return failure("The drawing export could not be verified or recorded.", 409);
  return failure("Could not generate the drawing export.", 500);
}

function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  if (!origin || (site !== null && site !== "same-origin")) return false;
  // A configured public origin remains correct behind the deployment proxy.
  const siteUrl = publicEnv().NEXT_PUBLIC_SITE_URL;
  const expectedOrigin = siteUrl ? new URL(siteUrl).origin : request.nextUrl.origin;
  try {
    return new URL(origin).origin === origin && origin === expectedOrigin;
  } catch {
    return false;
  }
}

// Browsing or prefetching a URL must never generate an export audit event.
export function GET() {
  return failure("Use an explicit POST to download a drawing export.", 405, { Allow: "POST" });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orgSlug: string; campaignId: string }> },
) {
  try {
    if (!sameOrigin(request)) return failure("A same-origin request is required.", 403);

    const { orgSlug, campaignId: routeCampaignId } = await params;
    const checkedCampaign = id.safeParse(routeCampaignId);
    if (!checkedCampaign.success) return failure("Campaign not found.", 404);
    const campaignId = checkedCampaign.data.toLowerCase();

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return failure("Submit the drawing export form.", 400);
    }
    if (["snapshot_id", "format", "idempotency_key"].some((key) => form.getAll(key).length !== 1)) {
      return failure("Submit one snapshot, format, and request key.", 400);
    }
    const checkedForm = formSchema.safeParse({
      snapshot_id: form.get("snapshot_id"), format: form.get("format"),
      idempotency_key: form.get("idempotency_key"),
    });
    if (!checkedForm.success) return failure("Invalid drawing export request.", 400);
    const { snapshot_id: snapshotId, format, idempotency_key: requestKey } = checkedForm.data;

    const user = await getSessionUser();
    if (!user) return failure("Sign in to download a drawing export.", 401);
    const ctx = await getOrgContext(orgSlug);
    if (!ctx || ctx.user.id !== user.id) return failure("Organization not found.", 404);
    if (!ctx.permissions.has("exports.run") || !BUYER_PERMISSIONS.some((permission) => ctx.permissions.has(permission))) {
      return failure("You do not have permission to export drawing buyers.", 403);
    }

    const supabase = await createClient();
    const organizationId = ctx.organization.id;
    const campaign = await supabase.from("campaigns").select("id")
      .eq("organization_id", organizationId).eq("id", campaignId).maybeSingle();
    if (campaign.error) return rpcFailure(campaign.error.code);
    if (!campaign.data) return failure("Campaign not found.", 404);

    let snapshot: z.infer<typeof snapshotSchema> | undefined;
    const entries: DrawingArtifactEntry[] = [];
    let offset = 0;
    while (true) {
      const result = await supabase.rpc("drawing_snapshot_export", {
        p_organization_id: organizationId, p_snapshot_id: snapshotId,
        p_offset: offset, p_limit: PAGE_SIZE,
      });
      if (result.error) return rpcFailure(result.error.code);
      const checkedPage = pageSchema.safeParse(result.data);
      if (!checkedPage.success) return failure("The drawing export failed integrity verification.", 409);
      const page = checkedPage.data;
      if (page.snapshot.id !== snapshotId || page.snapshot.organization_id !== organizationId
        || page.snapshot.campaign_id !== campaignId) return failure("Drawing snapshot not found.", 404);
      if (page.offset !== offset || page.total !== page.snapshot.ticket_count
        || page.entries.length !== Math.min(PAGE_SIZE, page.total - offset)
        || page.has_more !== (offset + PAGE_SIZE < page.total)
        || (snapshot !== undefined && !isDeepStrictEqual(snapshot, page.snapshot))) {
        return failure("The drawing export is incomplete or inconsistent.", 409);
      }
      snapshot = page.snapshot;
      entries.push(...page.entries);
      if (!page.has_more) break;
      offset += PAGE_SIZE;
    }

    if (!snapshot || entries.length !== snapshot.ticket_count) {
      return failure("The drawing export is incomplete.", 409);
    }
    try {
      const manifest = manifestSchema.parse(JSON.parse(snapshot.manifest_canonical));
      if (!isDeepStrictEqual(manifest, snapshot.manifest)
        || manifest.snapshot_id !== snapshotId || manifest.organization_id !== organizationId
        || manifest.campaign_id !== campaignId || manifest.version !== snapshot.version
        || manifest.ticket_count !== snapshot.ticket_count
        || manifest.total_face_value_cents !== snapshot.total_face_value_cents) {
        return failure("The drawing manifest does not match its frozen snapshot.", 409);
      }
    } catch {
      return failure("The drawing manifest failed integrity verification.", 409);
    }

    const verification = await supabase.rpc("verify_drawing_snapshot", {
      p_organization_id: organizationId, p_snapshot_id: snapshotId,
    });
    if (verification.error) return rpcFailure(verification.error.code);
    const checkedVerification = drawingIntegritySchema.safeParse(verification.data);
    if (!checkedVerification.success || checkedVerification.data.snapshot_id !== snapshotId
      || !checkedVerification.data.ok || !checkedVerification.data.count_ok
      || !checkedVerification.data.entries_ok || !checkedVerification.data.manifest_ok
      || !checkedVerification.data.source_anchors_ok || !checkedVerification.data.ledger_chains_ok
      || !checkedVerification.data.audit_anchor_ok) {
      return failure("The drawing snapshot failed integrity verification.", 409);
    }

    let contents: string;
    try {
      const artifact = makeDrawingArtifact(snapshot, entries);
      contents = format === "csv" ? drawingCsv(artifact) : drawingJson(artifact);
    } catch {
      return failure("The drawing export failed integrity verification.", 409);
    }
    const fileHash = drawingFileHash(contents);
    const audit = await supabase.rpc("export_drawing_snapshot", {
      p_organization_id: organizationId, p_snapshot_id: snapshotId,
      p_idempotency_key: requestKey, p_format: format, p_export_sha256: fileHash,
    });
    if (audit.error) return rpcFailure(audit.error.code);
    const checkedReceipt = receiptSchema.safeParse(audit.data);
    if (!checkedReceipt.success || checkedReceipt.data.snapshot_id !== snapshotId) {
      return failure("The drawing export could not be recorded.", 500);
    }

    return new Response(contents, {
      headers: {
        ...PRIVATE_HEADERS,
        "Content-Type": format === "csv" ? "text/csv; charset=utf-8" : "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="drawing-${snapshotId}-v${snapshot.version}.${format}"`,
        "X-Drawing-Manifest-SHA256": snapshot.manifest_hash,
        "X-Drawing-File-SHA256": fileHash,
      },
    });
  } catch {
    return failure("Could not generate the drawing export.", 500);
  }
}

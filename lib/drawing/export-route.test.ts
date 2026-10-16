import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import Papa from "papaparse";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/o/[orgSlug]/campaigns/[campaignId]/drawing/export/route";
import { getOrgContext, type OrgContext } from "@/lib/auth/org-context";
import { getSessionUser, type SessionUser } from "@/lib/auth/session";
import { publicEnv } from "@/lib/env";
import type { Permission } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { verifyDrawingArtifact, type DrawingArtifact, type DrawingArtifactEntry } from "./export";
import type { DrawingIntegrity } from "./schemas";

vi.mock("@/lib/auth/org-context", () => ({ getOrgContext: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/env", () => ({ publicEnv: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const SITE = "https://raffle.example.test";
const ORG_ID = "00000000-0000-0000-0000-000000000001";
const CAMPAIGN_ID = "00000000-0000-0000-0000-000000000002";
const SNAPSHOT_ID = "00000000-0000-0000-0000-000000000003";
const USER_ID = "00000000-0000-0000-0000-000000000004";
const FOREIGN_ID = "00000000-0000-0000-0000-000000000099";
const REQUEST_KEY = "retain-this-key-when-retrying";
const user: SessionUser = {
  id: USER_ID, email: "exporter@example.test", fullName: "Exporter", isPlatformAdmin: false, lastOrganizationId: ORG_ID,
};

function sha256(contents: string | Buffer) {
  return createHash("sha256").update(contents).digest("hex");
}

function fixture(count: number) {
  const entries: DrawingArtifactEntry[] = Array.from({ length: count }, (_, index) => {
    const payload = {
      snapshot_id: SNAPSHOT_ID, organization_id: ORG_ID, campaign_id: CAMPAIGN_ID,
      ticket_id: `ticket-${index}`, ticket_number: `AFC-${index}`, sequence_number: index * 2 + 1,
      sale_id: "00000000-0000-0000-0000-000000000005", buyer_name: '=SUM(1,2) "Zoë"',
      buyer_phone: "+15555550100", buyer_email: "buyer@example.test", player_name: "Player", team_name: "Team",
      face_value_cents: 500, issued_at: "2026-10-13T12:00:00+00:00",
    };
    // Exact canonical bytes are evidence; spacing must survive the route.
    const canonical = JSON.stringify(payload, null, 1);
    return { entry_payload_canonical: canonical, entry_hash: sha256(canonical) };
  });
  const manifest = {
    schema_version: 1, eligibility_policy: "ISSUED_UNREVERSED_V1", snapshot_id: SNAPSHOT_ID,
    organization_id: ORG_ID, campaign_id: CAMPAIGN_ID, version: 2, ticket_count: count,
    total_face_value_cents: count * 500, frozen_at: "2026-10-13T13:00:00+00:00",
    entries_hash: sha256(entries.map((entry) => entry.entry_hash).join("")),
    disclosures: { campaign_name: "Raffle", draw_at: "2026-11-10T18:00:00+00:00", operator_legal_name: "Organization" },
  };
  const canonical = JSON.stringify(manifest, null, 1);
  return { entries, snapshot: {
    id: SNAPSHOT_ID, organization_id: ORG_ID, campaign_id: CAMPAIGN_ID, version: 2,
    ticket_count: count, total_face_value_cents: count * 500, manifest, manifest_canonical: canonical,
    manifest_hash: sha256(canonical), reason: "Immutable historical freeze",
  } };
}

type ExportPage = {
  snapshot: ReturnType<typeof fixture>["snapshot"];
  entries: DrawingArtifactEntry[];
  offset: number; limit: number; total: number; has_more: boolean; historical: boolean;
};
interface HarnessOptions {
  count?: number;
  permissions?: Permission[];
  roles?: OrgContext["roles"];
  anonymous?: boolean;
  foreignOrganization?: boolean;
  missingCampaign?: boolean;
  contextUserId?: string;
  pageMutation?: (page: ExportPage, offset: number) => ExportPage;
  verification?: Partial<DrawingIntegrity>;
  auditError?: string;
  receiptSnapshotId?: string;
  invalidReceipt?: boolean;
  pageError?: { offset: number; code: string };
}
interface RequestOptions {
  format?: string;
  origin?: string | null;
  fetchSite?: string;
  mutateForm?: (form: FormData) => void;
}

function harness(options: HarnessOptions = {}) {
  const facts = fixture(options.count ?? 1);
  const context: OrgContext = {
    user: { ...user, id: options.contextUserId ?? USER_ID },
    organization: { id: ORG_ID, name: "Organization", slug: "org", legalName: null, timezone: "UTC" },
    roles: options.roles ?? ["ORGANIZATION_ADMIN"],
    permissions: new Set(options.permissions ?? ["exports.run", "organization.manage"]),
  };
  vi.mocked(getSessionUser).mockResolvedValue(options.anonymous ? null : user);
  vi.mocked(getOrgContext).mockResolvedValue(options.foreignOrganization ? null : context);
  vi.mocked(publicEnv).mockReturnValue({
    NEXT_PUBLIC_SITE_URL: SITE, NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key-without-credentials",
  });
  const query = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: options.missingCampaign ? null : { id: CAMPAIGN_ID }, error: null }),
  };
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === "drawing_snapshot_export") {
      const offset = Number(args.p_offset);
      if (options.pageError?.offset === offset) return { data: null, error: { code: options.pageError.code } };
      const page: ExportPage = {
        snapshot: structuredClone(facts.snapshot), entries: structuredClone(facts.entries.slice(offset, offset + 1000)),
        offset, limit: 1000, total: facts.entries.length, has_more: offset + 1000 < facts.entries.length,
        // Current/historical status can change; the frozen header cannot.
        historical: offset === 0,
      };
      return { error: null, data: options.pageMutation?.(page, offset) ?? page };
    }
    if (name === "verify_drawing_snapshot") return { error: null, data: {
      snapshot_id: SNAPSHOT_ID, ok: true, count_ok: true, entries_ok: true, manifest_ok: true,
      source_anchors_ok: true, ledger_chains_ok: true, audit_anchor_ok: true, ...options.verification,
    } };
    if (name === "export_drawing_snapshot") return options.auditError
      ? { data: null, error: { code: options.auditError } }
      : { error: null, data: options.invalidReceipt ? {} : {
        event_id: "00000000-0000-0000-0000-000000000006",
        snapshot_id: options.receiptSnapshotId ?? SNAPSHOT_ID, replayed: true,
      } };
    throw new Error(`Unexpected RPC ${name}`);
  });
  const client = { from: vi.fn(() => query), rpc };
  vi.mocked(createClient).mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>);
  const post = (changes: RequestOptions = {}) => {
    const form = new FormData();
    form.set("snapshot_id", SNAPSHOT_ID);
    form.set("format", changes.format ?? "json");
    form.set("idempotency_key", REQUEST_KEY);
    changes.mutateForm?.(form);
    const headers = new Headers();
    if (changes.origin !== null) headers.set("origin", changes.origin ?? SITE);
    if (changes.fetchSite) headers.set("sec-fetch-site", changes.fetchSite);
    return POST(new NextRequest(`http://internal-bind:3000/o/org/campaigns/${CAMPAIGN_ID}/drawing/export`, {
      method: "POST", headers, body: form,
    }), { params: Promise.resolve({ orgSlug: "org", campaignId: CAMPAIGN_ID }) });
  };
  const auditCalls = () => rpc.mock.calls.filter(([name]) => name === "export_drawing_snapshot");
  return { facts, client, query, rpc, post, auditCalls };
}

async function expectNoFile(response: Response, status: number) {
  expect(response.status).toBe(status);
  expect(response.headers.get("content-disposition")).toBeNull();
  expect(response.headers.get("cache-control")).toContain("private, no-store");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(await response.text()).not.toContain("buyer@example.test");
}

beforeEach(() => vi.clearAllMocks());

describe("explicit drawing export requests", () => {
  it.each(["json", "csv"])("downloads all 1003 entries as %s and reports the exact UTF-8 file checksum", async (format) => {
    const h = harness({ count: 1003 });
    const response = await h.post({ format, fetchSite: "same-origin" });
    expect(response.status).toBe(200);
    const bytes = Buffer.from(await response.arrayBuffer());
    const contents = bytes.toString("utf8");
    if (format === "json") {
      const artifact = JSON.parse(contents) as DrawingArtifact;
      expect(artifact.entries).toHaveLength(1003);
      expect(artifact.manifest_canonical).toBe(h.facts.snapshot.manifest_canonical);
      expect(artifact.entries).toEqual(h.facts.entries);
      expect(verifyDrawingArtifact(artifact, h.facts.snapshot.manifest_hash)).toEqual({ ok: true });
    } else {
      expect(bytes.subarray(0, 3).toString("hex")).toBe("efbbbf");
      const csv = Papa.parse<Record<string, string>>(contents, { header: true, skipEmptyLines: true });
      expect(csv.errors).toEqual([]);
      expect(csv.data).toHaveLength(1003);
      expect(csv.data.at(-1)?.["Ticket number"]).toBe("AFC-1002");
      expect(csv.data[0]?.["Buyer name"]).toBe("'=SUM(1,2) \"Zoë\"");
      expect(csv.data[0]?.["Buyer phone"]).toBe("'+15555550100");
    }
    expect(h.query.eq.mock.calls).toEqual([["organization_id", ORG_ID], ["id", CAMPAIGN_ID]]);
    expect(h.rpc.mock.calls.filter(([name]) => name === "drawing_snapshot_export").map(([, args]) => args.p_offset)).toEqual([0, 1000]);
    expect(h.rpc.mock.calls.map(([name]) => name)).toEqual([
      "drawing_snapshot_export", "drawing_snapshot_export", "verify_drawing_snapshot", "export_drawing_snapshot",
    ]);
    expect(h.auditCalls()).toEqual([["export_drawing_snapshot", {
      p_organization_id: ORG_ID, p_snapshot_id: SNAPSHOT_ID, p_idempotency_key: REQUEST_KEY,
      p_format: format, p_export_sha256: sha256(bytes),
    }]]);
    expect(sha256(bytes)).not.toBe(h.facts.snapshot.manifest_hash);
    expect(response.headers.get("x-drawing-file-sha256")).toBe(sha256(bytes));
    expect(response.headers.get("x-drawing-manifest-sha256")).toBe(h.facts.snapshot.manifest_hash);
    expect(response.headers.get("content-disposition")).toBe(`attachment; filename="drawing-${SNAPSHOT_ID}-v2.${format}"`);
    expect(response.headers.get("cache-control")).toContain("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("preserves request identity and deterministic bytes across a retry", async () => {
    const h = harness();
    const first = await h.post(); const retry = await h.post();
    expect(first.status).toBe(200); expect(retry.status).toBe(200);
    expect(await first.text()).toBe(await retry.text());
    expect(h.auditCalls()).toHaveLength(2);
    expect(h.auditCalls()[0]?.[1]).toEqual(h.auditCalls()[1]?.[1]);
  });

  it("GET has no authentication, buyer-read, or audit side effects", async () => {
    const h = harness(); const response = GET();
    await expectNoFile(response, 405);
    expect(response.headers.get("allow")).toBe("POST");
    expect(getSessionUser).not.toHaveBeenCalled(); expect(getOrgContext).not.toHaveBeenCalled();
    expect(h.client.from).not.toHaveBeenCalled(); expect(h.rpc).not.toHaveBeenCalled();
  });

  it.each<RequestOptions>([
    { origin: "https://evil.example.test" }, { origin: null }, { origin: "null" },
    { origin: `${SITE}:444` }, { origin: `${SITE}/forged-origin` },
    { fetchSite: "same-site" }, { fetchSite: "cross-site" },
  ])("rejects CSRF before authentication or database access: %j", async (changes) => {
    const h = harness();
    await expectNoFile(await h.post(changes), 403);
    expect(getSessionUser).not.toHaveBeenCalled(); expect(getOrgContext).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled(); expect(h.rpc).not.toHaveBeenCalled();
  });

  it.each<[HarnessOptions, number]>([
    [{ anonymous: true }, 401], [{ foreignOrganization: true }, 404],
    [{ contextUserId: FOREIGN_ID }, 404], [{ missingCampaign: true }, 404],
  ])("rejects inaccessible caller/organization/campaign: %j", async (options, status) => {
    const h = harness(options);
    await expectNoFile(await h.post(), status);
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it.each<Permission[]>([
    ["exports.run"], ["organization.manage"], ["campaigns.read", "exports.run"],
  ])("requires buyer authority and export permission even for an admin role: %j", async (...permissions) => {
    const h = harness({ permissions, roles: ["ORGANIZATION_ADMIN", "DIRECTOR"] });
    await expectNoFile(await h.post(), 403);
    expect(createClient).not.toHaveBeenCalled(); expect(h.auditCalls()).toEqual([]);
  });

  it.each<Permission>(["organization.manage", "reconciliation.manage", "adjustments.approve", "audit.read"])(
    "authorizes through permission keys, including exports.run plus %s", async (permission) => {
      const h = harness({ permissions: ["exports.run", permission], roles: ["PARTICIPANT_FAMILY"] });
      expect((await h.post()).status).toBe(200);
      expect(h.auditCalls()).toHaveLength(1);
    },
  );

  it("ignores forged actor, tenant, campaign, and checksum fields", async () => {
    const h = harness();
    const response = await h.post({ mutateForm: (form) => {
      for (const key of ["organization_id", "campaign_id", "actor_id"]) form.set(key, FOREIGN_ID);
      form.set("export_sha256", "0".repeat(64)); form.set("p_export_sha256", "0".repeat(64));
      form.set("manifest_hash", "0".repeat(64)); form.set("role", "DIRECTOR");
    } });
    expect(response.status).toBe(200);
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(h.auditCalls()[0]?.[1]).toEqual({
      p_organization_id: ORG_ID, p_snapshot_id: SNAPSHOT_ID, p_idempotency_key: REQUEST_KEY,
      p_format: "json", p_export_sha256: sha256(bytes),
    });
    expect(h.query.eq.mock.calls).toEqual([["organization_id", ORG_ID], ["id", CAMPAIGN_ID]]);
  });

  it("rejects ambiguous or non-text form fields without reading buyers", async () => {
    const attacks: Array<(form: FormData) => void> = [
      (form) => form.append("snapshot_id", FOREIGN_ID),
      (form) => form.set("snapshot_id", new File([SNAPSHOT_ID], "snapshot.txt")),
      (form) => form.delete("idempotency_key"),
      (form) => form.set("format", "xlsx"),
    ];
    for (const mutateForm of attacks) {
      const h = harness();
      await expectNoFile(await h.post({ mutateForm }), 400);
      expect(h.rpc).not.toHaveBeenCalled();
    }
  });

  it.each(["changed header", "missing entries", "premature completion", "wrong offset"])(
    "rejects incomplete or inconsistent pagination: %s", async (corruption) => {
      const h = harness({ count: 1003, pageMutation: (page, offset) => {
        if (corruption === "premature completion" && !offset) return { ...page, has_more: false };
        if (!offset) return page;
        if (corruption === "changed header") page.snapshot.reason = "Unexpected refreeze";
        if (corruption === "missing entries") page.entries.pop();
        if (corruption === "wrong offset") page.offset = 0;
        return page;
      } });
      await expectNoFile(await h.post(), 409);
      expect(h.auditCalls()).toEqual([]);
    },
  );

  it("does not deliver or report a partial population when a later page fails", async () => {
    const h = harness({ count: 1003, pageError: { offset: 1000, code: "57014" } });
    await expectNoFile(await h.post(), 500);
    expect(h.rpc.mock.calls.map(([name]) => name)).toEqual(["drawing_snapshot_export", "drawing_snapshot_export"]);
  });

  it.each([false, true])("rejects changed canonical entry bytes, including recomputed entry hash=%s", async (rehash) => {
    const h = harness({ pageMutation: (page) => {
      const entry = page.entries[0]!;
      entry.entry_payload_canonical = entry.entry_payload_canonical.replace("buyer@example.test", "forged@example.test");
      if (rehash) entry.entry_hash = sha256(entry.entry_payload_canonical);
      return page;
    } });
    await expectNoFile(await h.post(), 409);
    expect(h.auditCalls()).toEqual([]);
  });

  it("rejects a duplicate entry across full-length pages", async () => {
    const original = fixture(1003);
    const h = harness({ count: 1003, pageMutation: (page, offset) => {
      if (offset) page.entries[0] = original.entries[0]!;
      return page;
    } });
    await expectNoFile(await h.post(), 409);
    expect(h.auditCalls()).toEqual([]);
  });

  it.each(["header campaign", "canonical campaign", "header version", "canonical whitespace"])(
    "rejects manifest or route binding corruption: %s", async (corruption) => {
      const h = harness({ pageMutation: (page) => {
        if (corruption === "header campaign") page.snapshot.campaign_id = FOREIGN_ID;
        if (corruption === "header version") page.snapshot.version = 3;
        if (corruption === "canonical campaign") {
          page.snapshot.manifest.campaign_id = FOREIGN_ID;
          page.snapshot.manifest_canonical = JSON.stringify(page.snapshot.manifest, null, 1);
          page.snapshot.manifest_hash = sha256(page.snapshot.manifest_canonical);
        }
        if (corruption === "canonical whitespace") page.snapshot.manifest_canonical = JSON.stringify(page.snapshot.manifest);
        return page;
      } });
      await expectNoFile(await h.post(), corruption === "header campaign" ? 404 : 409);
      expect(h.auditCalls()).toEqual([]);
    },
  );

  it.each<Partial<DrawingIntegrity>>([{ ok: false }, { audit_anchor_ok: false }])(
    "requires successful SQL verification and the original audit anchor: %j", async (verification) => {
      const h = harness({ verification });
      await expectNoFile(await h.post(), 409);
      expect(h.auditCalls()).toEqual([]);
    },
  );

  it.each<[HarnessOptions, number]>([
    [{ auditError: "23514" }, 409], [{ receiptSnapshotId: FOREIGN_ID }, 500], [{ invalidReceipt: true }, 500],
  ])("does not deliver a file without a valid export receipt: %j", async (options, status) => {
    const h = harness(options);
    await expectNoFile(await h.post(), status);
    expect(h.auditCalls()).toHaveLength(1);
  });
});

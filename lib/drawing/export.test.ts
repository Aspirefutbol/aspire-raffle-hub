import { describe, expect, it } from "vitest";
import Papa from "papaparse";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drawingCsv, drawingFileHash, drawingJson, makeDrawingArtifact, verifyDrawingArtifact, type DrawingArtifactEntry } from "./export";

function fixture(count = 2, overrides: Record<string, unknown> = {}) {
  const entries: DrawingArtifactEntry[] = Array.from({ length: count }, (_, index) => {
    const payload = {
      snapshot_id: "snapshot-1", organization_id: "org-1", campaign_id: "campaign-1", ticket_id: `ticket-${index + 1}`,
      ticket_number: `AFC-${index + 1}`, sequence_number: index + 1, sale_id: "sale-1", buyer_name: "Supporter, Jr.",
      buyer_email: "buyer@example.test", buyer_phone: "+15555550100", player_name: "Liam", team_name: "Team A",
      issued_at: "2026-10-13T12:00:00+00:00", face_value_cents: 500, ...overrides,
    };
    // Deliberately use jsonb-style spaces; replacing this with JS serialization
    // would break the independent hash verification.
    const canonical = JSON.stringify(payload, null, 1);
    return { entry_payload_canonical: canonical, entry_hash: drawingFileHash(canonical) };
  });
  const manifest = {
    schema_version: 1, eligibility_policy: "ISSUED_UNREVERSED_V1", snapshot_id: "snapshot-1", organization_id: "org-1",
    campaign_id: "campaign-1", version: 1, frozen_at: "2026-10-13T13:00:00+00:00", ticket_count: count,
    total_face_value_cents: count * 500, entries_hash: drawingFileHash(entries.map((entry) => entry.entry_hash).join("")),
    disclosures: { campaign_name: "Aspire raffle", draw_at: "2026-11-10T18:00:00+00:00", operator_legal_name: "Aspire Sports Group" },
  };
  const canonical = JSON.stringify(manifest, null, 1);
  return { snapshot: { manifest_canonical: canonical, manifest_hash: drawingFileHash(canonical) }, entries };
}

describe("independent frozen drawing artifacts", () => {
  it("verifies exact canonical bytes against a separately retained freeze hash", () => {
    const { snapshot, entries } = fixture();
    const artifact = makeDrawingArtifact(snapshot, entries);
    expect(verifyDrawingArtifact(JSON.parse(drawingJson(artifact)), snapshot.manifest_hash)).toEqual({ ok: true });
    expect(verifyDrawingArtifact(artifact, "0".repeat(64)).ok).toBe(false);
    expect(verifyDrawingArtifact({ ...artifact, manifest_canonical: JSON.stringify(JSON.parse(artifact.manifest_canonical)) }, snapshot.manifest_hash).ok).toBe(false);
  });

  it("rejects removed, injected, duplicated, altered or cross-snapshot entries", () => {
    const { snapshot, entries } = fixture();
    const artifact = makeDrawingArtifact(snapshot, entries);
    expect(verifyDrawingArtifact({ ...artifact, entries: entries.slice(1) }, snapshot.manifest_hash).ok).toBe(false);
    expect(verifyDrawingArtifact({ ...artifact, entries: [...entries, entries[0]] }, snapshot.manifest_hash).ok).toBe(false);
    expect(verifyDrawingArtifact({ ...artifact, entries: [entries[0], entries[0]] }, snapshot.manifest_hash).ok).toBe(false);
    const altered = { ...entries[0]!, entry_payload_canonical: entries[0]!.entry_payload_canonical.replace("AFC-1", "AFC-999") };
    expect(verifyDrawingArtifact({ ...artifact, entries: [altered, entries[1]] }, snapshot.manifest_hash).ok).toBe(false);
    const foreign = fixture(1, { snapshot_id: "another-snapshot" }).entries[0]!;
    expect(verifyDrawingArtifact({ ...artifact, entries: [foreign, entries[1]] }, snapshot.manifest_hash).ok).toBe(false);
  });

  it("keeps export membership complete beyond a single 1000-row API page", () => {
    const { snapshot, entries } = fixture(1003);
    const artifact = makeDrawingArtifact(snapshot, [...entries.slice(1000), ...entries.slice(0, 1000)]);
    const csv = Papa.parse<string[]>(drawingCsv(artifact), { skipEmptyLines: true });
    expect(csv.errors).toEqual([]);
    expect(csv.data).toHaveLength(1004);
    expect(csv.data[1]![8]).toBe("AFC-1");
    expect(csv.data.at(-1)![8]).toBe("AFC-1003");
    expect(drawingJson(artifact)).toBe(drawingJson(makeDrawingArtifact(snapshot, entries)));
  });

  it.each(["=HYPERLINK(\"https://evil.test\")", "  =1+1", "\tNormal", "\n=1+1", "+15555550100", "-1+1", "@SUM(1)", "\uFEFF=1+1", "\0=1+1"])(
    "neutralizes spreadsheet execution while retaining canonical text: %s", (buyer_name) => {
      const { snapshot, entries } = fixture(1, { buyer_name });
      const artifact = makeDrawingArtifact(snapshot, entries);
      const csv = Papa.parse<string[]>(drawingCsv(artifact), { skipEmptyLines: true });
      expect(csv.data[1]![9]).toBe(`'${buyer_name.replace(/\0/g, "")}`);
      expect(JSON.parse(artifact.entries[0]!.entry_payload_canonical).buyer_name).toBe(buyer_name);
    },
  );

  it("preserves Unicode, commas, quotes and null contacts without leaking private notes", () => {
    const { snapshot, entries } = fixture(1, { buyer_name: "Zoë, \"Supporter\"", buyer_email: null, buyer_phone: null, private_notes: "INTERNAL ONLY" });
    const artifact = makeDrawingArtifact(snapshot, entries);
    const csv = drawingCsv(artifact);
    const rows = Papa.parse<string[]>(csv, { skipEmptyLines: true });
    expect(rows.data[1]![9]).toBe('Zoë, "Supporter"');
    expect(rows.data[1]!.slice(10, 12)).toEqual(["", ""]);
    expect(csv).not.toContain("INTERNAL ONLY");
    expect(rows.data[0]).not.toContain("Private notes");
    expect(drawingFileHash(csv)).not.toBe(snapshot.manifest_hash);
  });

  it("lets an operator verify the downloaded file independently and rejects a tampered population", () => {
    const { snapshot, entries } = fixture();
    const artifact = makeDrawingArtifact(snapshot, entries);
    const directory = mkdtempSync(join(tmpdir(), "drawing-export-"));
    const file = join(directory, "manifest.json");
    try {
      writeFileSync(file, drawingJson(artifact), { mode: 0o600 });
      expect(execFileSync(process.execPath, ["scripts/verify-drawing-export.mjs", file, snapshot.manifest_hash], { encoding: "utf8" }))
        .toContain("Verified 2 frozen entries");
      writeFileSync(file, JSON.stringify({ ...artifact, entries: entries.slice(1) }));
      expect(() => execFileSync(process.execPath, ["scripts/verify-drawing-export.mjs", file, snapshot.manifest_hash], { stdio: "pipe" })).toThrow();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

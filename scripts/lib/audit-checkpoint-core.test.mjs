import { describe, expect, it } from "vitest";
import {
  buildCheckpoint, canonicalJson, checkContinuity, checkpointFileName, evaluatePartitions, signCheckpoint, verifySignature,
} from "./audit-checkpoint-core.mjs";

const row = (over = {}) => ({
  organization_id: "org-a", organization_name: "Org A", organization_slug: "org-a",
  ok: true, rows_checked: 3, first_bad_pos: null, head_hash: "h3", last_chain_pos: 3, ...over,
});

describe("audit checkpoint core", () => {
  it("accepts a verified chain", () => {
    const { partitions, problems } = evaluatePartitions([row(), row({ organization_id: null, organization_slug: null, organization_name: "(platform)", rows_checked: 0, head_hash: null, last_chain_pos: null })]);
    expect(problems).toEqual([]);
    expect(partitions[0]).toMatchObject({ verified: true, chain_head_hash: "h3", last_chain_position: 3 });
  });

  it("fails when verification fails, the head is missing, or positions disagree", () => {
    expect(evaluatePartitions([row({ ok: false, first_bad_pos: 2, head_hash: null })]).problems[0]).toMatch(/FAILED at position 2/);
    expect(evaluatePartitions([row({ head_hash: null })]).problems[0]).toMatch(/no chain head hash/);
    expect(evaluatePartitions([row({ last_chain_pos: 5 })]).problems[0]).toMatch(/≠ rows verified/);
  });

  it("continuity: extends when the previous head is still at its position", async () => {
    const { partitions } = evaluatePartitions([row({ rows_checked: 5, last_chain_pos: 5, head_hash: "h5" })]);
    const prev = { partitions: [{ organization_id: "org-a", organization_slug: "org-a", last_chain_position: 3, chain_head_hash: "h3" }] };
    const r = await checkContinuity(partitions, prev, async (_org, pos) => (pos === 3 ? "h3" : null));
    expect(r.problems).toEqual([]);
    expect(partitions[0].continuity).toBe("extends-previous");
  });

  it("continuity: detects a rewritten history, a shrunk chain, and a missing partition", async () => {
    const prev = { partitions: [{ organization_id: "org-a", organization_slug: "org-a", last_chain_position: 3, chain_head_hash: "h3" }] };
    const rewritten = evaluatePartitions([row({ head_hash: "x3" })]).partitions;
    expect((await checkContinuity(rewritten, prev, async () => "x3")).problems[0]).toMatch(/no longer matches/);
    const shrunk = evaluatePartitions([row({ rows_checked: 2, last_chain_pos: 2, head_hash: "h2" })]).partitions;
    expect((await checkContinuity(shrunk, prev, async () => null)).problems[0]).toMatch(/shrank/);
    expect((await checkContinuity([], prev, async () => null)).problems[0]).toMatch(/missing now/);
  });

  it("signs deterministically and detects edits", () => {
    const cp = buildCheckpoint({ environment: "staging", generatedAt: "2026-10-12T00:00:00.000Z", partitions: evaluatePartitions([row()]).partitions });
    const signed = signCheckpoint(cp, "k");
    expect(verifySignature(signed, "k")).toBe(true);
    expect(verifySignature({ ...signed, verified: false }, "k")).toBe(false);
    expect(signCheckpoint(cp, undefined).signature).toBeNull();
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: 1 }] })).toBe('{"a":[{"c":1,"d":2}],"b":1}');
  });

  it("names files by environment and timestamp", () => {
    expect(checkpointFileName("staging", "2026-10-12T06:17:00.123Z")).toBe("audit-checkpoint-staging-2026-10-12T06-17-00-123Z.json");
  });
});

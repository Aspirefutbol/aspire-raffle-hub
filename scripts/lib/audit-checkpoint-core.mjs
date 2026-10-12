// Pure logic for audit checkpoints (no I/O): building, verifying, signing and
// comparing checkpoints. Used by scripts/audit-checkpoint.mjs; unit-tested.
import { createHash, createHmac } from "node:crypto";

export const CHECKPOINT_FORMAT = "raffle-hub.audit-checkpoint";
export const CHECKPOINT_FORMAT_VERSION = 1;

/** JSON with recursively sorted keys, so hashes/signatures are reproducible. */
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

export const sha256Hex = (text) => createHash("sha256").update(text).digest("hex");

/** Maps audit_checkpoint_rows() output to checkpoint partitions and finds problems. */
export function evaluatePartitions(rows) {
  const problems = [];
  const partitions = rows.map((r) => {
    const rowsChecked = Number(r.rows_checked);
    const lastPos = r.last_chain_pos == null ? null : Number(r.last_chain_pos);
    const p = {
      organization_id: r.organization_id,
      organization_name: r.organization_name,
      organization_slug: r.organization_slug,
      verified: Boolean(r.ok),
      rows_checked: rowsChecked,
      first_bad_position: r.first_bad_pos == null ? null : Number(r.first_bad_pos),
      last_chain_position: lastPos,
      chain_head_hash: r.head_hash ?? null,
      continuity: "not-checked",
    };
    const label = p.organization_slug ?? p.organization_name ?? "(platform)";
    if (!p.verified) problems.push(`${label}: hash chain verification FAILED at position ${p.first_bad_position}`);
    else if (rowsChecked > 0 && !p.chain_head_hash) problems.push(`${label}: ${rowsChecked} events but no chain head hash`);
    else if (rowsChecked > 0 && lastPos !== rowsChecked) problems.push(`${label}: last chain position ${lastPos} ≠ rows verified ${rowsChecked}`);
    return p;
  });
  return { partitions, problems };
}

/**
 * Proves the current chain still contains each previous head at its old
 * position (nothing before it was rewritten or removed).
 * hashAt(orgId|null, position) → Promise<string|null>
 */
export async function checkContinuity(partitions, previous, hashAt) {
  const problems = [];
  if (!previous) {
    for (const p of partitions) p.continuity = "first-checkpoint";
    return { problems };
  }
  const byId = new Map(partitions.map((p) => [p.organization_id ?? "platform", p]));
  for (const prev of previous.partitions ?? []) {
    const key = prev.organization_id ?? "platform";
    const label = prev.organization_slug ?? prev.organization_name ?? "(platform)";
    const cur = byId.get(key);
    if (!cur) {
      problems.push(`${label}: present in the previous checkpoint but missing now`);
      continue;
    }
    if (!cur.verified) {
      cur.continuity = "unverifiable"; // the chain itself failed verification
      continue;
    }
    if (!prev.last_chain_position) {
      cur.continuity = "extends-previous";
      continue;
    }
    if ((cur.last_chain_position ?? 0) < prev.last_chain_position) {
      cur.continuity = "broken";
      problems.push(`${label}: chain shrank from ${prev.last_chain_position} to ${cur.last_chain_position ?? 0} events`);
      continue;
    }
    const stored = await hashAt(prev.organization_id ?? null, prev.last_chain_position);
    if (stored !== prev.chain_head_hash) {
      cur.continuity = "broken";
      problems.push(`${label}: hash at position ${prev.last_chain_position} no longer matches the previous checkpoint head`);
    } else {
      cur.continuity = "extends-previous";
    }
  }
  for (const p of partitions) if (p.continuity === "not-checked") p.continuity = "new";
  return { problems };
}

export function buildCheckpoint({ environment, generatedAt, schemaVersion, appCommit, sourceHost, previous, partitions }) {
  return {
    format: CHECKPOINT_FORMAT,
    format_version: CHECKPOINT_FORMAT_VERSION,
    environment,
    generated_at: generatedAt,
    database_schema_version: schemaVersion ?? null,
    app_commit: appCommit ?? null,
    source_host: sourceHost ?? null,
    previous_checkpoint: previous ? { file: previous.file, sha256: previous.sha256 } : null,
    verified: partitions.every((p) => p.verified),
    partitions,
  };
}

/** Optional HMAC-SHA256 over the canonical JSON of everything except `signature`. */
export function signCheckpoint(checkpoint, key, keyId = "default") {
  if (!key) return { ...checkpoint, signature: null };
  const { signature: _ignored, ...body } = checkpoint;
  return { ...body, signature: { alg: "HMAC-SHA256", key_id: keyId, value: createHmac("sha256", key).update(canonicalJson(body)).digest("hex") } };
}

export function verifySignature(checkpoint, key) {
  if (!checkpoint.signature) return false;
  const { signature, ...body } = checkpoint;
  return createHmac("sha256", key).update(canonicalJson(body)).digest("hex") === signature.value;
}

export function checkpointFileName(environment, generatedAt) {
  return `audit-checkpoint-${environment}-${generatedAt.replace(/[:.]/g, "-")}.json`;
}

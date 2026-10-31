import { createHash } from "node:crypto";
import Papa from "papaparse";

export interface DrawingArtifactEntry {
  entry_payload_canonical: string;
  entry_hash: string;
}

export interface DrawingArtifact {
  schema_version: 1;
  manifest_canonical: string;
  manifest_hash: string;
  entries: DrawingArtifactEntry[];
}

type JsonObject = Record<string, unknown>;
const HASH = /^[a-f0-9]{64}$/;

export function drawingFileHash(contents: string): string {
  return createHash("sha256").update(contents, "utf8").digest("hex");
}

function object(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid drawing payload.");
  return value as JsonObject;
}

function text(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw new Error("Missing drawing field.");
  return value;
}

function integer(value: unknown, minimum = 1): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) throw new Error("Invalid drawing quantity.");
  return value;
}

function decodedEntry(entry: DrawingArtifactEntry): JsonObject {
  return object(JSON.parse(entry.entry_payload_canonical));
}

function orderedEntries(entries: DrawingArtifactEntry[]): DrawingArtifactEntry[] {
  return entries.map((entry) => ({ entry, payload: decodedEntry(entry) }))
    .sort((a, b) => integer(a.payload.sequence_number) - integer(b.payload.sequence_number)
      || text(a.payload.ticket_id).localeCompare(text(b.payload.ticket_id), "en"))
    .map(({ entry }) => entry);
}

/**
 * Checks a downloaded manifest against the separately retained freeze hash.
 * PostgreSQL's canonical strings are hashed verbatim: JS never guesses jsonb
 * property ordering, spacing or timestamp formatting. This checks the artifact;
 * source ledger/checkpoint verification remains a separate operator check.
 */
export function verifyDrawingArtifact(value: unknown, expectedManifestHash: string): { ok: boolean; error?: string } {
  try {
    const artifact = object(value);
    if (artifact.schema_version !== 1 || !Array.isArray(artifact.entries)) throw new Error("Unsupported drawing artifact.");
    const canonical = text(artifact.manifest_canonical);
    const manifestHash = text(artifact.manifest_hash);
    if (!HASH.test(expectedManifestHash) || manifestHash !== expectedManifestHash || drawingFileHash(canonical) !== expectedManifestHash) {
      throw new Error("The manifest does not match the retained freeze hash.");
    }
    const manifest = object(JSON.parse(canonical));
    if (manifest.schema_version !== 1 || manifest.eligibility_policy !== "ISSUED_UNREVERSED_V1") throw new Error("Unsupported eligibility policy.");
    const count = integer(manifest.ticket_count);
    const total = integer(manifest.total_face_value_cents);
    integer(manifest.version);
    if (artifact.entries.length !== count) throw new Error("The eligible ticket count does not match.");
    const tickets = new Set<string>();
    const numbers = new Set<string>();
    const sequences = new Set<number>();
    const entries: DrawingArtifactEntry[] = [];
    let faceValue = 0n;
    for (const value of artifact.entries) {
      const entry = object(value);
      const canonical = text(entry.entry_payload_canonical);
      const hash = text(entry.entry_hash);
      if (!HASH.test(hash) || drawingFileHash(canonical) !== hash) throw new Error("A frozen entry hash does not match.");
      const payload = object(JSON.parse(canonical));
      if (payload.snapshot_id !== manifest.snapshot_id || payload.organization_id !== manifest.organization_id
        || payload.campaign_id !== manifest.campaign_id) throw new Error("An entry belongs to a different snapshot.");
      const ticket = text(payload.ticket_id);
      const number = text(payload.ticket_number);
      const sequence = integer(payload.sequence_number);
      if (tickets.has(ticket) || numbers.has(number) || sequences.has(sequence)) throw new Error("A frozen ticket is duplicated.");
      tickets.add(ticket); numbers.add(number); sequences.add(sequence);
      faceValue += BigInt(integer(payload.face_value_cents));
      entries.push({ entry_payload_canonical: canonical, entry_hash: hash });
    }
    if (faceValue !== BigInt(total)) throw new Error("The frozen face value does not match.");
    const entriesHash = drawingFileHash(orderedEntries(entries).map((entry) => entry.entry_hash).join(""));
    if (manifest.entries_hash !== entriesHash) throw new Error("The eligible population does not match the manifest.");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Invalid drawing artifact." };
  }
}

export function makeDrawingArtifact(
  snapshot: { manifest_canonical: string; manifest_hash: string },
  entries: DrawingArtifactEntry[],
): DrawingArtifact {
  const artifact: DrawingArtifact = {
    schema_version: 1,
    manifest_canonical: snapshot.manifest_canonical,
    manifest_hash: snapshot.manifest_hash,
    entries: orderedEntries(entries).map(({ entry_payload_canonical, entry_hash }) => ({ entry_payload_canonical, entry_hash })),
  };
  const verified = verifyDrawingArtifact(artifact, snapshot.manifest_hash);
  if (!verified.ok) throw new Error(verified.error);
  return artifact;
}

export function drawingJson(artifact: DrawingArtifact): string {
  const verified = verifyDrawingArtifact(artifact, artifact.manifest_hash);
  if (!verified.ok) throw new Error(verified.error);
  return `${JSON.stringify(artifact, null, 2)}\n`;
}

function spreadsheetText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value !== "string") throw new Error("Invalid drawing text.");
  const cleaned = value.replace(/\0/g, "");
  // Quoting CSV alone does not stop Excel/Sheets interpreting a formula.
  // Preserve the original value in the canonical JSON artifact, not this cell.
  return /^[\s\uFEFF]*[=+\-@\t\r\n]/.test(cleaned) ? `'${cleaned}` : cleaned;
}

export function drawingCsv(artifact: DrawingArtifact): string {
  const verified = verifyDrawingArtifact(artifact, artifact.manifest_hash);
  if (!verified.ok) throw new Error(verified.error);
  const manifest = object(JSON.parse(artifact.manifest_canonical));
  const disclosures = object(manifest.disclosures);
  const fields = ["Snapshot ID", "Snapshot version", "Manifest SHA-256", "Eligible ticket count", "Frozen at",
    "Campaign", "Drawing date", "Operator", "Ticket number", "Buyer name", "Buyer email", "Buyer phone",
    "Player", "Team", "Sale ID", "Issued at", "Face value cents"];
  const data = orderedEntries(artifact.entries).map((entry) => {
    const row = decodedEntry(entry);
    return [manifest.snapshot_id, manifest.version, artifact.manifest_hash, manifest.ticket_count, manifest.frozen_at,
      disclosures.campaign_name, disclosures.draw_at, disclosures.operator_legal_name, row.ticket_number,
      row.buyer_name, row.buyer_email, row.buyer_phone, row.player_name, row.team_name, row.sale_id, row.issued_at,
      row.face_value_cents].map((value) => typeof value === "number" ? integer(value) : spreadsheetText(value));
  });
  return `\uFEFF${Papa.unparse({ fields, data }, { quotes: true, newline: "\r\n" })}\r\n`;
}

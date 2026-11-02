#!/usr/bin/env node
// Independent verification of the downloaded JSON against a retained freeze
// hash (for example, the hash in the operator's audit/certification record).
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const sha256 = value => createHash('sha256').update(value, 'utf8').digest('hex');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const isCount = value => Number.isSafeInteger(value) && value > 0;

try {
  const [file, expectedHash, ...extra] = process.argv.slice(2);
  assert(file && /^[a-f0-9]{64}$/.test(expectedHash ?? '') && extra.length === 0,
    'Usage: node scripts/verify-drawing-export.mjs <manifest.json> <retained-freeze-sha256>');
  const artifact = JSON.parse(await readFile(file, 'utf8'));
  assert(artifact.schema_version === 1 && Array.isArray(artifact.entries), 'Unsupported drawing artifact.');
  assert(typeof artifact.manifest_canonical === 'string' && artifact.manifest_hash === expectedHash
    && sha256(artifact.manifest_canonical) === expectedHash, 'Manifest differs from the retained freeze hash.');
  const manifest = JSON.parse(artifact.manifest_canonical);
  assert(manifest.schema_version === 1 && manifest.eligibility_policy === 'ISSUED_UNREVERSED_V1', 'Unsupported eligibility policy.');
  assert(isCount(manifest.ticket_count) && artifact.entries.length === manifest.ticket_count, 'Eligible ticket count differs.');
  assert(isCount(manifest.total_face_value_cents), 'Invalid total face value.');
  const tickets = new Set();
  const numbers = new Set();
  const sequences = new Set();
  let value = 0n;
  const entries = artifact.entries.map(entry => {
    assert(typeof entry.entry_payload_canonical === 'string' && /^[a-f0-9]{64}$/.test(entry.entry_hash)
      && sha256(entry.entry_payload_canonical) === entry.entry_hash, 'A frozen entry hash differs.');
    const payload = JSON.parse(entry.entry_payload_canonical);
    assert(payload.snapshot_id === manifest.snapshot_id && payload.organization_id === manifest.organization_id
      && payload.campaign_id === manifest.campaign_id, 'An entry belongs to a different snapshot.');
    assert(typeof payload.ticket_id === 'string' && typeof payload.ticket_number === 'string'
      && isCount(payload.sequence_number) && isCount(payload.face_value_cents), 'Invalid ticket identity or face value.');
    assert(!tickets.has(payload.ticket_id) && !numbers.has(payload.ticket_number) && !sequences.has(payload.sequence_number), 'Duplicate frozen ticket.');
    tickets.add(payload.ticket_id); numbers.add(payload.ticket_number); sequences.add(payload.sequence_number);
    value += BigInt(payload.face_value_cents);
    return { sequence: payload.sequence_number, hash: entry.entry_hash };
  });
  entries.sort((a, b) => a.sequence - b.sequence);
  assert(value === BigInt(manifest.total_face_value_cents), 'Total face value differs.');
  assert(sha256(entries.map(entry => entry.hash).join('')) === manifest.entries_hash, 'Frozen eligible population differs.');
  console.log(`Verified ${entries.length} frozen entries against the retained freeze hash. Source ledger/checkpoint verification remains separate.`);
} catch (error) {
  // Do not dump the downloaded buyer records or artifact payload on failure.
  console.error(error instanceof SyntaxError ? 'Invalid drawing JSON.' : error.message);
  process.exitCode = 1;
}

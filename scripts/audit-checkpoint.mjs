#!/usr/bin/env node
// Exports a verified audit-chain checkpoint OUTSIDE the database.
//
//   npm run audit:checkpoint -- [--out <dir>] [--previous <file>] [--environment <name>]
//
// Env (server/CI only — never expose to a browser):
//   SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)  project API URL
//   SUPABASE_SECRET_KEY                          service-role/secret key (audit_checkpoint_rows is service-role only)
//   AUDIT_ENVIRONMENT                            e.g. staging | production (default: local)
//   AUDIT_CHECKPOINT_SIGNING_KEY                 optional HMAC key; AUDIT_CHECKPOINT_KEY_ID optional label
//
// Exit codes: 0 ok · 1 configuration/connection error · 2 chain verification failed
//             · 3 continuity with the previous checkpoint broken.
// A checkpoint file is written for 2 and 3 as evidence; never overwritten.
import { execSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import {
  buildCheckpoint, checkContinuity, checkpointFileName, evaluatePartitions, sha256Hex, signCheckpoint,
} from "./lib/audit-checkpoint-core.mjs";

const { values: args } = parseArgs({
  options: {
    out: { type: "string", default: process.env.AUDIT_CHECKPOINT_DIR ?? "audit-checkpoints" },
    previous: { type: "string" },
    environment: { type: "string", default: process.env.AUDIT_ENVIRONMENT ?? "local" },
  },
});

function fatal(message, code = 1) {
  console.error(`✗ ${message}`);
  process.exit(code);
}

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) fatal("Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SECRET_KEY.");
const environment = args.environment;
if (!/^[a-z0-9-]{1,32}$/.test(environment)) fatal("--environment must be lowercase letters, digits or dashes.");

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

// Previous checkpoint: explicit file, else the newest one for this environment in --out.
function loadPrevious() {
  let file = args.previous;
  if (!file) {
    try {
      const candidates = readdirSync(args.out)
        .filter((f) => f.startsWith(`audit-checkpoint-${environment}-`) && f.endsWith(".json"))
        .sort();
      if (candidates.length) file = join(args.out, candidates.at(-1));
    } catch {
      // no directory yet
    }
  }
  if (!file) return null;
  const text = readFileSync(file, "utf8");
  const parsed = JSON.parse(text);
  if (parsed.environment !== environment) fatal(`Previous checkpoint ${file} is for "${parsed.environment}", not "${environment}".`);
  return { file: basename(file), sha256: sha256Hex(text), data: parsed };
}

let previous;
try {
  previous = loadPrevious();
} catch (e) {
  fatal(`Could not read the previous checkpoint: ${e.message}`);
}

const { data: rows, error } = await db.rpc("audit_checkpoint_rows");
if (error || !Array.isArray(rows)) fatal(`Database call failed: ${error?.message ?? "no data"} (is the URL right and the key a service-role key?)`);
const { data: schemaVersion } = await db.rpc("audit_schema_version");

const { partitions, problems } = evaluatePartitions(rows);
const continuity = await checkContinuity(partitions, previous?.data, async (orgId, pos) => {
  const { data, error: e } = await db.rpc("audit_chain_hash_at", { p_organization_id: orgId, p_chain_pos: pos });
  if (e) fatal(`Database call failed: ${e.message}`);
  return data;
});

let appCommit = process.env.GITHUB_SHA ?? null;
if (!appCommit) {
  try {
    appCommit = execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    appCommit = null;
  }
}

const generatedAt = new Date().toISOString();
const checkpoint = signCheckpoint(
  buildCheckpoint({
    environment,
    generatedAt,
    schemaVersion,
    appCommit,
    sourceHost: new URL(url).host,
    previous,
    partitions,
  }),
  process.env.AUDIT_CHECKPOINT_SIGNING_KEY,
  process.env.AUDIT_CHECKPOINT_KEY_ID,
);

mkdirSync(args.out, { recursive: true });
const fileName = checkpointFileName(environment, generatedAt);
const body = `${JSON.stringify(checkpoint, null, 2)}\n`;
writeFileSync(join(args.out, fileName), body, { flag: "wx" }); // never overwrite history
writeFileSync(join(args.out, `${fileName}.sha256`), `${sha256Hex(body)}  ${fileName}\n`, { flag: "wx" });

const total = partitions.reduce((n, p) => n + p.rows_checked, 0);
console.log(`Checkpoint ${join(args.out, fileName)}`);
console.log(`  environment=${environment} partitions=${partitions.length} events=${total} schema=${schemaVersion ?? "?"}`);
console.log(`  previous=${previous ? previous.file : "none"} signed=${checkpoint.signature ? "yes" : "no"}`);
for (const p of partitions) {
  console.log(`  ${p.verified ? "✓" : "✗"} ${(p.organization_slug ?? "(platform)").padEnd(24)} ${String(p.rows_checked).padStart(7)} events  head=${p.chain_head_hash?.slice(0, 16) ?? "-"}…  ${p.continuity}`);
}

if (problems.length) {
  for (const p of problems) console.error(`✗ ${p}`);
  process.exit(2);
}
if (continuity.problems.length) {
  for (const p of continuity.problems) console.error(`✗ ${p}`);
  process.exit(3);
}
console.log("✓ All audit chains verified.");

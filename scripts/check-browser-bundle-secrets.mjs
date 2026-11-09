#!/usr/bin/env node
// Read-only detection of server-only values accidentally in public Next.js assets.
// Never print secret values. Run --self-test to verify positive/negative detection.
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, extname } from "node:path";
const names = [
  "ASPIRE_BUNDLE_SECRET_CANARY", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY",
  "NETLIFY_AUTH_TOKEN", "SELLER_LINK_KEY_V1", "SELLER_LINK_KEY_V2",
  "AUDIT_CHECKPOINT_SIGNING_KEY",
];
const extensions = new Set([".js", ".mjs", ".html", ".css", ".json", ".svg", ".txt", ".map"]);
function scan(root, values) {
  let checked = 0;
  const matches = [];
  function walk(dir) {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); }
    catch (error) {
      if (error.code === "ENOENT") throw new Error(`Missing public build directory: ${dir}`);
      throw error;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && extensions.has(extname(entry.name).toLowerCase())) {
        checked++;
        const data = readFileSync(path, "utf8");
        for (const [label, secret] of values) if (data.includes(secret)) matches.push({ path, label });
      }
    }
  }
  walk(root);
  return { checked, matches };
}
if (process.argv.includes("--self-test")) {
  const dir = mkdtempSync(join(tmpdir(), "aspire-secret-scan-"));
  try {
    mkdirSync(join(dir, "static"));
    const testValue = "aspire-ci-synthetic-canary-not-a-real-secret-12345";
    writeFileSync(join(dir, "static", "safe.js"), "const ok=true;");
    const clean = scan(dir, [["canary", testValue]]);
    if (clean.checked !== 1 || clean.matches.length) throw Error("Clean-bundle assertion failed");
    writeFileSync(join(dir, "static", "leak.js"), `window.leaked=${JSON.stringify(testValue)}`);
    const leaked = scan(dir, [["canary", testValue]]);
    if (leaked.checked !== 2 || leaked.matches.length !== 1) throw Error("Injected-leak detection failed");
    console.log("Synthetic bundle scan: clean and injected-leak checks passed.");
  } finally { rmSync(dir, { recursive: true, force: true }); }
  process.exit(0);
}
const values = names.flatMap(label => {
  const secret = process.env[label];
  return secret && secret.length >= 16 ? [[label, secret]] : [];
});
if (!process.env.ASPIRE_BUNDLE_SECRET_CANARY || process.env.ASPIRE_BUNDLE_SECRET_CANARY.length < 16) {
  console.error("Missing CI canary; refusing to silently skip secret bundle scan.");
  process.exit(2);
}
let checked = 0;
const matches = [];
for (const root of [".next/static", "public"]) {
  const result = scan(resolve(root), values);
  checked += result.checked;
  matches.push(...result.matches);
}
if (!checked) { console.error("No public text assets scanned."); process.exit(2); }
if (matches.length) {
  for (const { path, label } of matches) console.error(`Server secret value detected in public asset: ${path} (${label})`);
  process.exit(1);
}
console.log(`Public asset secret scan passed: ${checked} text assets, ${values.length} protected values checked.`);

/**
 * Fail the build when the runtime listing-agreement body drifts from the
 * canonical Markdown template (excluding counsel adaptation notes).
 *
 * Canonical: src/lib/templates/REALORA_Listing_Agreement_Template.md
 * Runtime:   src/lib/templates/listing-agreement-body.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const mdPath = resolve(root, "src/lib/templates/REALORA_Listing_Agreement_Template.md");
const tsPath = resolve(root, "src/lib/templates/listing-agreement-body.ts");

function stripAdaptationNotes(text) {
  const cut = text.search(/\n---\s*\n+\s*## Adaptation notes/);
  return cut >= 0 ? text.slice(0, cut) : text;
}

function normalize(text) {
  return stripAdaptationNotes(text).replace(/\s+/g, " ").trim();
}

function unescapeTsString(raw) {
  return raw
    .replace(/\\n/g, "\n")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

function extractTsBody(source) {
  const match = source.match(/export const LISTING_AGREEMENT_BODY = "([\s\S]*)";\s*$/);
  if (!match) {
    throw new Error("Could not find LISTING_AGREEMENT_BODY string in listing-agreement-body.ts");
  }
  return unescapeTsString(match[1]);
}

function firstDiff(a, b) {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    if (a[i] !== b[i]) {
      return {
        index: i,
        md: a.slice(Math.max(0, i - 40), i + 80),
        ts: b.slice(Math.max(0, i - 40), i + 80),
      };
    }
  }
  return {
    index: len,
    md: a.slice(Math.max(0, len - 40)),
    ts: b.slice(Math.max(0, len - 40)),
  };
}

const mdRaw = readFileSync(mdPath, "utf8");
const tsRaw = readFileSync(tsPath, "utf8");
const mdNorm = normalize(mdRaw);
const tsNorm = normalize(extractTsBody(tsRaw));

if (mdNorm === tsNorm) {
  console.log("check-agreement-template: ok");
  process.exit(0);
}

const diff = firstDiff(mdNorm, tsNorm);
console.error("check-agreement-template: FAIL — listing agreement sources drifted");
console.error(`  md: ${mdPath}`);
console.error(`  ts: ${tsPath}`);
console.error(`  normalized lengths: md=${mdNorm.length} ts=${tsNorm.length}`);
console.error(`  first difference near index ${diff.index}:`);
console.error(`    md: …${JSON.stringify(diff.md)}…`);
console.error(`    ts: …${JSON.stringify(diff.ts)}…`);
console.error("  Reconcile toward the canonical .md (edit .md, then update listing-agreement-body.ts).");
process.exit(1);

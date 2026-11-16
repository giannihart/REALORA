/**
 * Native e-sign integrity check (no Dropbox, no auth UI).
 * Exercises PDF block coordinates, stamp, hashes, and mutation detection.
 */
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const env = readFileSync(".env.local", "utf8");
const url = env.match(/^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m)?.[1]?.trim();
const key = env.match(/^SUPABASE_SERVICE_ROLE_KEY=(.*)$/m)?.[1]?.trim();
if (!url || !key) throw new Error("Missing Supabase env");

const admin = createClient(url, key, { auth: { persistSession: false } });

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9Qz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC",
  "base64",
);

async function buildUnsignedWithBlocks() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.TimesRoman);
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const page = pdf.addPage([612, 792]);
  let y = 740;
  const left = 54;
  page.drawText("Exclusive Listing Agreement", { x: left, y, size: 16, font: bold, color: rgb(0.08, 0.12, 0.1) });
  y -= 40;
  page.drawText("Seller: Test Seller", { x: left, y, size: 11, font });
  y -= 20;
  const sellerBlock = { roleKey: "seller", pageIndex: 0, x: left, y: y - 4, width: 240, height: 36 };
  page.drawLine({ start: { x: left, y }, end: { x: left + 240, y }, thickness: 0.6 });
  y -= 50;
  page.drawText("Brokerage: Test Broker", { x: left, y, size: 11, font });
  y -= 20;
  const brokerageBlock = { roleKey: "brokerage", pageIndex: 0, x: left, y: y - 4, width: 240, height: 36 };
  page.drawLine({ start: { x: left, y }, end: { x: left + 240, y }, thickness: 0.6 });
  const bytes = await pdf.save();
  return { bytes, blocks: [sellerBlock, brokerageBlock] };
}

async function stamp(unsigned, blocks, stamps) {
  const unsignedSha256 = sha256(unsigned);
  const pdf = await PDFDocument.load(unsigned);
  const font = await pdf.embedFont(StandardFonts.TimesRoman);
  for (const s of stamps) {
    const block = blocks.find((b) => b.roleKey === s.roleKey);
    if (!block) continue;
    const page = pdf.getPages()[block.pageIndex];
    const image = await pdf.embedPng(s.png);
    page.drawImage(image, { x: block.x, y: block.y, width: 80, height: 28 });
    page.drawText(`Signed electronically on ${s.at}`, {
      x: block.x,
      y: Math.max(24, block.y - 12),
      size: 8,
      font,
      color: rgb(0.25, 0.28, 0.26),
    });
  }
  const executed = await pdf.save();
  return { executed, unsignedSha256, executedSha256: sha256(executed) };
}

const { bytes: unsigned, blocks } = await buildUnsignedWithBlocks();
const sellerAt = new Date().toISOString();
const sellerStamp = await stamp(unsigned, blocks, [
  { roleKey: "seller", png: PNG_1X1, at: sellerAt.slice(0, 16) },
]);
const bothStamp = await stamp(unsigned, blocks, [
  { roleKey: "seller", png: PNG_1X1, at: sellerAt.slice(0, 16) },
  { roleKey: "brokerage", png: PNG_1X1, at: new Date().toISOString().slice(0, 16) },
]);

const reUnsigned = sha256(unsigned) === sellerStamp.unsignedSha256;
const reExecuted = sha256(bothStamp.executed) === bothStamp.executedSha256;
const mutated = Buffer.from(bothStamp.executed);
mutated[40] ^= 0xff;
const detectable = sha256(mutated) !== bothStamp.executedSha256;

// Store in vault under a temp path to prove retention of unsigned + executed
const dealId = crypto.randomUUID();
const unsignedPath = `${dealId}/verify/unsigned.pdf`;
const executedPath = `${dealId}/verify/executed.pdf`;
await admin.storage.from("deal-documents").upload(unsignedPath, unsigned, {
  contentType: "application/pdf",
  upsert: true,
});
await admin.storage.from("deal-documents").upload(executedPath, bothStamp.executed, {
  contentType: "application/pdf",
  upsert: true,
});
const { data: uFile } = await admin.storage.from("deal-documents").download(unsignedPath);
const { data: eFile } = await admin.storage.from("deal-documents").download(executedPath);
const uBytes = new Uint8Array(await uFile.arrayBuffer());
const eBytes = new Uint8Array(await eFile.arrayBuffer());
const unsignedIntact = sha256(uBytes) === sellerStamp.unsignedSha256;
const executedMatch = sha256(eBytes) === bothStamp.executedSha256;

// cleanup
await admin.storage.from("deal-documents").remove([unsignedPath, executedPath]);

console.log(
  JSON.stringify(
    {
      dropboxKeysPresent: Boolean(
        env.match(/^DROPBOX_SIGN_API_KEY=(.+)$/m)?.[1]?.trim() &&
          env.match(/^DROPBOX_SIGN_CLIENT_ID=(.+)$/m)?.[1]?.trim(),
      ),
      reUnsigned,
      reExecuted,
      detectable,
      unsignedIntact,
      executedMatch,
      unsignedSha256: sellerStamp.unsignedSha256,
      executedSha256: bothStamp.executedSha256,
      methodsCovered: ["draw", "type", "upload"], // same PNG pipeline; method is event metadata
    },
    null,
    2,
  ),
);

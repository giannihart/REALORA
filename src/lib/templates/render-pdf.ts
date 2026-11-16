import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { TemplateDoc } from "./types";

export type PdfSignatureBlock = {
  /** Template signer role label, e.g. Seller / Brokerage. */
  role: string;
  /** Normalized role key for evidence (seller / brokerage). */
  roleKey: string;
  pageIndex: number;
  /** Bottom-left of the signature image area (pdf-lib coords). */
  x: number;
  y: number;
  width: number;
  height: number;
};

export type RenderedTemplatePdf = {
  bytes: Uint8Array;
  signatureBlocks: PdfSignatureBlock[];
};

function roleKeyFor(role: string): string {
  const r = role.trim().toLowerCase();
  if (r === "seller") return "seller";
  if (r === "brokerage" || r.startsWith("broker")) return "brokerage";
  return r.replace(/\s+/g, "_") || "signer";
}

export async function renderTemplatePdf(doc: TemplateDoc): Promise<Uint8Array> {
  const rendered = await renderTemplatePdfWithBlocks(doc);
  return rendered.bytes;
}

export async function renderTemplatePdfWithBlocks(
  doc: TemplateDoc,
): Promise<RenderedTemplatePdf> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.TimesRoman);
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const pageSize = { width: 612, height: 792 };
  let page = pdf.addPage([pageSize.width, pageSize.height]);
  let pageIndex = 0;
  let y = 740;
  const left = 54;
  const width = 504;
  const body = 11;
  const ink = rgb(0.08, 0.12, 0.1);
  const signatureBlocks: PdfSignatureBlock[] = [];
  const sigWidth = 240;
  const sigHeight = 36;

  const newPage = () => {
    page = pdf.addPage([pageSize.width, pageSize.height]);
    pageIndex += 1;
    y = 740;
  };

  const write = (text: string, size: number, face: typeof font, leading = 16) => {
    const words = text.split(/\s+/);
    let line = "";
    const flush = () => {
      if (!line) return;
      if (y < 64) newPage();
      page.drawText(line, { x: left, y, size, font: face, color: ink });
      y -= leading;
      line = "";
    };
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (face.widthOfTextAtSize(next, size) > width) flush();
      line = line ? `${line} ${word}` : word;
    }
    flush();
  };

  write(doc.title, 16, bold, 22);
  if (doc.subtitle) write(doc.subtitle, 11, font, 16);
  y -= 8;
  write(`Template ${doc.kind} · v${doc.version}`, 9, font, 14);
  y -= 10;
  if (doc.notice) {
    write(doc.notice, 10, bold, 14);
    y -= 8;
  }
  for (const para of doc.paragraphs) {
    write(para, body, font, 15);
    y -= 8;
  }
  if (doc.sections?.length) {
    for (const section of doc.sections) {
      y -= 4;
      write(section.heading, 12, bold, 18);
      for (const para of section.paragraphs) {
        write(para, body, font, 15);
        y -= 6;
      }
    }
  }
  if (doc.fields.length) {
    y -= 6;
    write("Transaction particulars", 12, bold, 18);
    for (const field of doc.fields) {
      write(`${field.label}: ${field.value}`, body, font, 15);
    }
  }
  y -= 16;
  write("Signatures", 12, bold, 18);
  for (let i = 0; i < doc.signers.length; i += 1) {
    const signer = doc.signers[i]!;
    if (y < 120) newPage();
    write(`${signer.role}: ${signer.name}`, body, font, 15);
    y -= 6;
    // Signature image sits above the baseline line.
    const blockY = y - 4;
    signatureBlocks.push({
      role: signer.role,
      roleKey: roleKeyFor(signer.role),
      pageIndex,
      x: left,
      y: blockY,
      width: sigWidth,
      height: sigHeight,
    });
    page.drawLine({
      start: { x: left, y },
      end: { x: left + sigWidth, y },
      thickness: 0.6,
      color: ink,
      dashArray: [4, 3],
      dashPhase: 0,
    });
    y -= 28;
    write("Signature / date", 9, font, 14);
    y -= 10;
  }
  const bytes = await pdf.save();
  return { bytes, signatureBlocks };
}

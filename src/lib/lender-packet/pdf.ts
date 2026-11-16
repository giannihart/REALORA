import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { LenderPacketPayload } from "@/lib/lender-packet/types";

function money(n: number) {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function yn(v: boolean) {
  return v ? "Yes" : "No";
}

export async function buildLenderPacketPdf(
  payload: LenderPacketPayload,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([612, 792]);
  const ink = rgb(0.08, 0.16, 0.12);
  const muted = rgb(0.35, 0.4, 0.38);
  let y = 742;

  const write = (
    text: string,
    size: number,
    face: typeof font,
    color = ink,
    leading = 14,
  ) => {
    const lines = wrap(text, size, face, 504);
    for (const line of lines) {
      if (y < 54) return;
      page.drawText(line, { x: 54, y, size, font: face, color });
      y -= leading;
    }
  };

  write("REALORA lender introduction packet", 16, bold, ink, 20);
  write(
    `Prepared ${payload.preparedAt.slice(0, 10)} at the buyer's direction.`,
    10,
    font,
    muted,
    16,
  );
  y -= 4;

  write("Buyer", 11, bold, muted, 13);
  write(payload.buyerName || "Buyer", 12, bold, ink, 15);
  write(payload.buyerEmail, 11, font, ink, 13);
  if (payload.buyerPhone) write(payload.buyerPhone, 11, font, ink, 13);
  const addr = payload.currentAddress;
  write(
    `Current address: ${addr.street}${addr.unit ? ` ${addr.unit}` : ""}, ${addr.city}, ${addr.state} ${addr.zip}`,
    11,
    font,
    ink,
    13,
  );
  y -= 6;

  write("Search", 11, bold, muted, 13);
  write(`Timeline: ${payload.timeline}`, 11, font, ink, 13);
  write(`Area: ${payload.area}`, 11, font, ink, 13);
  write(`Property type: ${payload.propertyType}`, 11, font, ink, 13);
  write(`Occupancy: ${payload.occupancy}`, 11, font, ink, 13);
  write(`Target price: ${money(payload.targetPrice)}`, 11, font, ink, 13);
  write(
    `Monthly payment comfort (buyer-stated): ${money(payload.comfortMonthlyPayment)}/mo`,
    11,
    font,
    ink,
    13,
  );
  write(`Cash up front (down + closing): ${money(payload.downPayment)}`, 11, font, ink, 13);
  write(`Funds timing: ${payload.fundsTiming}`, 11, font, ink, 13);
  y -= 6;

  write("Financial summary", 11, bold, muted, 13);
  write(`Gross annual income: ${money(payload.annualIncome)}`, 11, font, ink, 13);
  write(`Monthly debts: ${money(payload.monthlyDebts)}`, 11, font, ink, 13);
  write(
    `Estimated buying power (Realora gauge): ${money(payload.estimatedBuyingPower)}`,
    11,
    font,
    ink,
    13,
  );
  write(
    `Credit score band (self-reported): ${payload.creditScoreBandLabel}`,
    11,
    font,
    ink,
    13,
  );
  y -= 6;

  write("Declarations", 11, bold, muted, 13);
  write(`Self-employment income: ${yn(payload.selfEmployed)}`, 11, font, ink, 13);
  write(`Owned a home in the past 3 years: ${yn(payload.ownedHomePast3Years)}`, 11, font, ink, 13);
  write(`Military affiliation: ${yn(payload.militaryAffiliation)}`, 11, font, ink, 13);
  write(
    `Bankruptcy, foreclosure, or short sale (past 7 years): ${yn(payload.bankruptcyOrShortSale)}`,
    11,
    font,
    ink,
    13,
  );
  y -= 6;

  write("Introduction", 11, bold, muted, 13);
  write(`Lender: ${payload.lenderName}`, 11, font, ink, 13);
  write(`Lender email: ${payload.lenderEmail}`, 11, font, ink, 13);
  y -= 10;

  write(
    "Prepared by the buyer on Realora and sent at their direction. Realora is not a lender, made no credit decision, and charges no fee for this introduction.",
    9,
    font,
    muted,
    11,
  );
  y -= 6;
  write(
    "Your lender collects those securely in their own application. Realora never asks for them.",
    9,
    font,
    muted,
    11,
  );

  pdf.setTitle(`Lender packet — ${payload.buyerName}`);
  pdf.setSubject(`Introduction to ${payload.lenderName}`);
  return pdf.save();
}

function wrap(
  text: string,
  size: number,
  font: { widthOfTextAtSize: (t: string, s: number) => number },
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

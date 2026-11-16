import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export async function generateFeeInvoicePdf(input: {
  address: string;
  priceCents: number;
  platformFeeCents: number;
  buyerAgentFeeCents: number | null;
  issuedAt: string;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.TimesRoman);
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const page = pdf.addPage([612, 792]);
  const ink = rgb(0.08, 0.12, 0.1);
  let y = 740;
  const write = (text: string, size: number, face: typeof font, leading = 18) => {
    page.drawText(text, { x: 54, y, size, font: face, color: ink });
    y -= leading;
  };
  const money = (cents: number) =>
    `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  write("REALORA closing fee invoice", 18, bold, 26);
  write(`Issued ${input.issuedAt.slice(0, 10)}`, 11, font, 18);
  write(`Property: ${input.address}`, 12, font, 18);
  write(`Contract price: ${money(input.priceCents)}`, 12, font, 22);
  write("Line items (disbursed at closing — do not pay by card)", 12, bold, 20);
  write(`REALORA 1%: ${money(input.platformFeeCents)}`, 12, font, 18);
  if (input.buyerAgentFeeCents != null && input.buyerAgentFeeCents > 0) {
    write(`Buyer-agent +1%: ${money(input.buyerAgentFeeCents)}`, 12, font, 18);
  }
  y -= 12;
  write(
    "This invoice tracks amounts that appear on the closing statement. REALORA does not collect the fee by card.",
    10,
    font,
    14,
  );
  pdf.setTitle(`REALORA 1% ${input.platformFeeCents}`);
  pdf.setSubject(
    input.buyerAgentFeeCents
      ? `Buyer-agent +1% ${input.buyerAgentFeeCents}`
      : "No buyer-agent line",
  );
  return pdf.save();
}

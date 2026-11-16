/**
 * Writes fixtures/sample-contract.pdf — a synthetic 2–3 page NY contract of sale.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const paragraphs = [
  "CONTRACT OF SALE — NEW YORK RESIDENTIAL CONDOMINIUM",
  "This Contract of Sale is made as of the Contract Date stated below, between the Seller and the Buyer named below, for the Premises described below, located in the State of New York.",
  "Seller: Maren Calder LLC",
  "Buyer: Jonah Ellis and Priya Shah",
  "Premises address: 184 Pacific Street, Apt 4B, Brooklyn, NY 11201",
  "The Premises is a residential condominium unit together with its appurtenant common interest in The Pacific House Condominium.",
  "Contract date: 2026-10-08",
  "Purchase price: $2,150,000.00 (two million one hundred fifty thousand and 00/100 dollars), being 215000000 cents.",
  "Deposit amount: $215,000.00 (21500000 cents). Deposit holder name: Hartman & Wei LLP. The deposit is paid on signing and held in attorney escrow. REALORA never holds escrow money.",
  "Financing type: Conventional. Mortgage amount: $1,720,000.00 (172000000 cents). Mortgage commitment deadline: 2026-12-15.",
  "This Contract is contingent on Buyer obtaining a written conventional mortgage commitment on or before the mortgage commitment deadline of 2026-12-15.",
  "Closing target: Closing shall take place on or about 2027-01-20. Outside date: 2027-01-31. Time is not of the essence as to the on-or-about date; it is of the essence as to the outside date unless extended in writing.",
  "Contingencies with dates:",
  "Mortgage commitment contingency date: 2026-12-15.",
  "Board approval contingency date: 2026-12-01.",
  "Inspection contingency date: 2026-10-22.",
  "Condo rider present: yes. This contract includes a Condominium Rider, which is attached and made a part of this Contract. The Condominium Rider governs board approval, the offering plan, and unit-specific representations.",
  "Inclusions notes: Refrigerator, washer, dryer, and window treatments",
  "Exclusions notes: Seller's dining table and artwork",
  "The parties acknowledge that this instrument is a complete statement of the sale terms. Any field not stated in this Contract is omitted and shall not be inferred.",
  "Attorney escrow. The deposit is held by Hartman & Wei LLP as Seller's counsel. Release is only against a fully executed Contract and as the Contract provides.",
  "Risk of loss remains with Seller until closing. Transfer is by bargain and sale deed with covenant against grantor's acts, subject to the condominium declaration.",
  "This is a fictional sample prepared for REALORA contract-extraction tests. The names, address, and figures are invented. It is not a filed legal instrument and creates no obligation.",
  "IN WITNESS WHEREOF the parties have executed this Contract as of the Contract Date.",
  "Seller signature: Maren Calder LLC, by authorized signatory.",
  "Buyer signatures: Jonah Ellis; Priya Shah.",
];

const pdf = await PDFDocument.create();
const font = await pdf.embedFont(StandardFonts.TimesRoman);
const bold = await pdf.embedFont(StandardFonts.TimesRomanBold);
const ink = rgb(0.05, 0.08, 0.1);
let page = pdf.addPage([612, 792]);
let y = 740;

function write(text, size, face, leading) {
  const width = 504;
  const words = text.split(/\s+/);
  let line = "";
  const flush = () => {
    if (!line) return;
    if (y < 64) {
      page = pdf.addPage([612, 792]);
      y = 740;
    }
    page.drawText(line, { x: 54, y, size, font: face, color: ink });
    y -= leading;
    line = "";
  };
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (face.widthOfTextAtSize(next, size) > width) flush();
    line = line ? `${line} ${word}` : word;
  }
  flush();
}

write(paragraphs[0], 16, bold, 22);
y -= 8;
for (let i = 1; i < paragraphs.length; i += 1) {
  const face = paragraphs[i].includes(":") && paragraphs[i].length < 80 ? bold : font;
  write(paragraphs[i], 11, face, 16);
  y -= 6;
}

const bytes = await pdf.save();
const out = resolve(process.cwd(), "fixtures/sample-contract.pdf");
writeFileSync(out, bytes);
console.log(`Wrote ${out} (${bytes.length} bytes, ${pdf.getPageCount()} pages)`);

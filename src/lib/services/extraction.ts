import "server-only";
import type { ContractExtraction } from "@/lib/services/extraction-types";
import { EMPTY_EXTRACTION } from "@/lib/services/extraction-types";

export function extractionAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({
    data: bytes.slice(),
    useSystemFonts: true,
  });
  const doc = await task.promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const line = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .filter(Boolean)
      .join(" ");
    pages.push(line);
  }
  return pages.join("\n\n");
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t ? t : null;
}

function asCents(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string" && value.trim()) {
    const n = Number(value.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? Math.round(n) : null;
  }
  return null;
}

function asBool(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  return null;
}

function normalize(raw: Record<string, unknown>): ContractExtraction {
  const parties = (raw.parties ?? {}) as Record<string, unknown>;
  const deposit = (raw.deposit ?? {}) as Record<string, unknown>;
  const financing = (raw.financing ?? {}) as Record<string, unknown>;
  const closing = (raw.closing ?? {}) as Record<string, unknown>;
  const contingencies = Array.isArray(raw.contingencies) ? raw.contingencies : [];
  return {
    parties: {
      seller: asString(parties.seller),
      buyer: asString(parties.buyer),
    },
    premisesAddress: asString(raw.premisesAddress),
    purchasePriceCents: asCents(raw.purchasePriceCents),
    contractDate: asString(raw.contractDate),
    deposit: {
      amountCents: asCents(deposit.amountCents),
      holderName: asString(deposit.holderName),
    },
    financing: {
      type: asString(financing.type),
      mortgageAmountCents: asCents(financing.mortgageAmountCents),
      commitmentDeadline: asString(financing.commitmentDeadline),
    },
    closing: {
      onOrAbout: asString(closing.onOrAbout),
      outsideDate: asString(closing.outsideDate),
    },
    contingencies: contingencies
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const row = item as Record<string, unknown>;
        const name = asString(row.name);
        if (!name) return null;
        return { name, date: asString(row.date) };
      })
      .filter((row): row is { name: string; date: string | null } => row != null),
    condoRider: asBool(raw.condoRider),
    inclusionsNotes: asString(raw.inclusionsNotes),
    exclusionsNotes: asString(raw.exclusionsNotes),
  };
}

const SCHEMA_INSTRUCTIONS = `Extract a New York residential contract of sale into JSON.
Return ONLY JSON matching this shape:
{
  "parties": { "seller": string|null, "buyer": string|null },
  "premisesAddress": string|null,
  "purchasePriceCents": number|null,
  "contractDate": string|null,
  "deposit": { "amountCents": number|null, "holderName": string|null },
  "financing": { "type": string|null, "mortgageAmountCents": number|null, "commitmentDeadline": string|null },
  "closing": { "onOrAbout": string|null, "outsideDate": string|null },
  "contingencies": [{ "name": string, "date": string|null }],
  "condoRider": boolean|null,
  "inclusionsNotes": string|null,
  "exclusionsNotes": string|null
}
Rules:
- Money in integer cents (e.g. $2,150,000 = 215000000).
- Dates as YYYY-MM-DD.
- If a field is not explicitly stated, use null. Never guess.
- condoRider is true only if a condo rider is mentioned as present; false if the contract says there is none; null if silent.
- contingencies: only named contingencies with any stated date.`;

export async function extractContractFromText(text: string): Promise<ContractExtraction> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error("ANTHROPIC_API_KEY is not set.");
  }
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey: key });
  const message = await client.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 2000,
    system: SCHEMA_INSTRUCTIONS,
    messages: [
      {
        role: "user",
        content: `Contract text:\n\n${text.slice(0, 40000)}`,
      },
    ],
  });
  const block = message.content.find((c) => c.type === "text");
  const raw = block && "text" in block ? block.text : "";
  const jsonStart = raw.indexOf("{");
  const jsonEnd = raw.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd < jsonStart) return { ...EMPTY_EXTRACTION };
  const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1)) as Record<string, unknown>;
  return normalize(parsed);
}

export async function extractContractFromPdf(bytes: Uint8Array): Promise<ContractExtraction> {
  const text = await extractPdfText(bytes);
  return extractContractFromText(text);
}

import type { TemplateDoc } from "./types";
import { LISTING_AGREEMENT_BODY } from "./listing-agreement-body";

/**
 * Canonical agreement text (edit here, then refresh listing-agreement-body.ts):
 * src/lib/templates/REALORA_Listing_Agreement_Template.md
 */
export const LISTING_AGREEMENT_SOURCE_PATH =
  "src/lib/templates/REALORA_Listing_Agreement_Template.md";

export type ListingAgreementInput = {
  sellerName: string;
  brokerageName: string;
  licenseNumber: string;
  brokerOfRecordName: string;
  brokerOfRecordLicense: string;
  address: string;
  bbl?: string | null;
  block?: string | null;
  lot?: string | null;
  date: string;
  /** ISO date (YYYY-MM-DD) when the exclusive ends. */
  exclusiveExpiresOn: string;
  /** Protection period after expiration (default 90). */
  protectionDays?: number;
  buyerAgentOffered: boolean;
};

export function exclusiveExpiresOn(fromIsoDate: string, termDays = 180): string {
  const base = new Date(`${fromIsoDate}T12:00:00`);
  if (Number.isNaN(base.getTime())) {
    const fallback = new Date();
    fallback.setDate(fallback.getDate() + termDays);
    return fallback.toISOString().slice(0, 10);
  }
  base.setDate(base.getDate() + termDays);
  return base.toISOString().slice(0, 10);
}

export function formatExclusiveLabel(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** Customer-facing agreements must never print placeholder brokerage identity. */
export function brokerageIdentityIsRenderable(
  legalName: string | null | undefined,
  licenseNumber?: string | null,
  brokerOfRecordName?: string | null,
  brokerOfRecordLicense?: string | null,
): boolean {
  const name = (legalName ?? "").trim();
  const license = (licenseNumber ?? "").trim();
  const borName = (brokerOfRecordName ?? "").trim();
  const borLicense = (brokerOfRecordLicense ?? "").trim();
  if (!name || /placeholder/i.test(name)) return false;
  if (!license || license.toUpperCase() === "PENDING") return false;
  if (!borName || /placeholder/i.test(borName)) return false;
  if (!borLicense || borLicense.toUpperCase() === "PENDING") return false;
  return true;
}

export function blockLotFromBbl(bbl: string | null | undefined): {
  block: string;
  lot: string;
} {
  const digits = (bbl ?? "").replace(/\D/g, "").padStart(10, "0").slice(-10);
  if (!/^[1-5]\d{9}$/.test(digits)) return { block: "", lot: "" };
  return {
    block: String(Number(digits.slice(1, 6))),
    lot: String(Number(digits.slice(6, 10))),
  };
}

function agreementBodyFromSource(): string {
  const raw = LISTING_AGREEMENT_BODY;
  // Drop HTML counsel flag comment at top; keep body before counsel notes separator.
  // Preserve variant markers encoded as HTML comments through this pass.
  const withoutComments = raw.replace(/<!--[\s\S]*?-->/g, (block) => {
    if (/VARIANT:COBROKE_/.test(block)) return block;
    return "";
  });
  const cut = withoutComments.split(/\n---\n/)[0] ?? withoutComments;
  return cut.trim();
}

function applyCobrokeVariant(body: string, buyerAgentOffered: boolean): string {
  const off = body.match(
    /<!--\s*VARIANT:COBROKE_OFF\s*-->([\s\S]*?)<!--\s*\/VARIANT:COBROKE_OFF\s*-->/,
  );
  const on = body.match(
    /<!--\s*VARIANT:COBROKE_ON\s*-->([\s\S]*?)<!--\s*\/VARIANT:COBROKE_ON\s*-->/,
  );
  const chosen = (buyerAgentOffered ? on?.[1] : off?.[1])?.trim() ?? "";
  return body
    .replace(
      /<!--\s*VARIANT:COBROKE_OFF\s*-->[\s\S]*?<!--\s*\/VARIANT:COBROKE_OFF\s*-->/,
      buyerAgentOffered ? "" : chosen,
    )
    .replace(
      /<!--\s*VARIANT:COBROKE_ON\s*-->[\s\S]*?<!--\s*\/VARIANT:COBROKE_ON\s*-->/,
      buyerAgentOffered ? chosen : "",
    );
}

/** Strip counsel PENDING DECISION markers; keep the operative sentence that follows. */
function stripPendingDecisions(body: string): string {
  return body.replace(/\[PENDING DECISION[^\]]*\]\s*/g, "");
}

function fillFields(
  body: string,
  values: Record<string, string>,
): string {
  return body.replace(/\[([A-Z0-9_]+)\]/g, (full, key: string) => {
    if (Object.prototype.hasOwnProperty.call(values, key)) {
      return values[key] ?? "";
    }
    return full;
  });
}

function toTemplateDoc(filled: string, input: ListingAgreementInput): TemplateDoc {
  const lines = filled.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const paragraphs: string[] = [];
  const sections: TemplateDoc["sections"] = [];
  let current: { heading: string; paragraphs: string[] } | null = null;
  const sectionRe = /^(\d+)\.\s+(.+)$/;
  const signatureLines: string[] = [];

  for (const line of lines) {
    if (/^Seller — Signature/i.test(line) || /^Brokerage — Signature/i.test(line)) {
      signatureLines.push(line);
      continue;
    }
    const m = line.match(sectionRe);
    if (m) {
      if (current) sections!.push(current);
      current = { heading: `${m[1]}. ${m[2]}`, paragraphs: [] };
      continue;
    }
    if (current) current.paragraphs.push(line);
    else paragraphs.push(line);
  }
  if (current) sections!.push(current);

  const fields: TemplateDoc["fields"] = [
    { label: "Property", value: input.address },
    ...(input.bbl ? [{ label: "BBL", value: input.bbl }] : []),
    ...(input.block ? [{ label: "Block", value: input.block }] : []),
    ...(input.lot ? [{ label: "Lot", value: input.lot }] : []),
    { label: "Seller", value: input.sellerName },
    { label: "Brokerage", value: input.brokerageName },
    { label: "License", value: input.licenseNumber },
    { label: "Broker of record", value: input.brokerOfRecordName },
    {
      label: "Broker of record license",
      value: input.brokerOfRecordLicense,
    },
    { label: "Exclusive expires", value: formatExclusiveLabel(input.exclusiveExpiresOn) },
    {
      label: "Protection period (days)",
      value: String(input.protectionDays ?? 90),
    },
    {
      label: "Buyer-agent compensation",
      value: input.buyerAgentOffered ? "1% offered" : "Not offered",
    },
  ];

  return {
    kind: "listing-agreement",
    version: 4,
    title: "Exclusive Listing Agreement",
    subtitle: "Seller and brokerage",
    // No counsel-review notice in the seller-facing document.
    paragraphs,
    sections,
    fields,
    signers: [
      { role: "Seller", name: input.sellerName },
      {
        role: "Brokerage",
        name: `${input.brokerOfRecordName}, Broker of Record, ${input.brokerageName}`,
      },
    ],
  };
}

export function listingAgreementTemplate(input: ListingAgreementInput): TemplateDoc {
  if (
    !brokerageIdentityIsRenderable(
      input.brokerageName,
      input.licenseNumber,
      input.brokerOfRecordName,
      input.brokerOfRecordLicense,
    )
  ) {
    throw new Error(
      "Brokerage identity is not configured. Set the legal name, license, and broker of record before generating an agreement.",
    );
  }

  const fromBbl = blockLotFromBbl(input.bbl);
  const block = (input.block ?? fromBbl.block).trim() || "—";
  const lot = (input.lot ?? fromBbl.lot).trim() || "—";
  const bbl = (input.bbl ?? "").trim() || "—";
  const protectionDays = String(
    Number.isFinite(input.protectionDays) && (input.protectionDays as number) > 0
      ? Math.floor(input.protectionDays as number)
      : 90,
  );

  const values: Record<string, string> = {
    EFFECTIVE_DATE: formatExclusiveLabel(input.date),
    EXPIRATION_DATE: formatExclusiveLabel(input.exclusiveExpiresOn),
    SELLER_LEGAL_NAME: input.sellerName.trim(),
    BROKERAGE_LEGAL_NAME: input.brokerageName.trim(),
    BROKERAGE_LICENSE: input.licenseNumber.trim(),
    BROKER_OF_RECORD_NAME: input.brokerOfRecordName.trim(),
    BROKER_OF_RECORD_LICENSE: input.brokerOfRecordLicense.trim(),
    PROPERTY_ADDRESS: input.address.trim(),
    BLOCK: block,
    LOT: lot,
    BBL: bbl,
    PROTECTION_DAYS: protectionDays,
  };

  let body = agreementBodyFromSource();
  body = applyCobrokeVariant(body, input.buyerAgentOffered);
  body = stripPendingDecisions(body);
  body = fillFields(body, values);

  const leftover = body.match(/\[[A-Z0-9_]+\]/g);
  if (leftover?.length) {
    throw new Error(`Listing agreement still has unfilled fields: ${leftover.join(", ")}`);
  }

  return toTemplateDoc(body, {
    ...input,
    block,
    lot,
    bbl,
    protectionDays: Number(protectionDays),
  });
}

/** Flatten rendered doc to searchable plain text (verify helpers). */
export function listingAgreementPlainText(doc: TemplateDoc): string {
  const parts = [
    doc.title,
    doc.subtitle ?? "",
    ...doc.paragraphs,
    ...(doc.sections ?? []).flatMap((s) => [s.heading, ...s.paragraphs]),
    ...doc.fields.map((f) => `${f.label}: ${f.value}`),
    ...doc.signers.map((s) => `${s.role}: ${s.name}`),
  ];
  return parts.join("\n");
}

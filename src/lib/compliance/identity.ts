import "server-only";
import type { createServiceRoleClient } from "@/lib/supabase/admin";
import { brokerageIdentityIsRenderable } from "@/lib/templates/listing-agreement";

export const PLACEHOLDER_LEGAL_NAME = "REALORA (placeholder)";
export const PLACEHOLDER_LICENSE = "PENDING";

export const IDENTITY_KEYS = {
  legalName: "brokerage_legal_name",
  license: "brokerage_license_number",
  brokerOfRecordName: "broker_of_record_name",
  brokerOfRecordLicense: "broker_of_record_license",
  listingTermDays: "listing_agreement_term_days",
  protectionDays: "listing_agreement_protection_days",
} as const;

export const DEFAULT_LISTING_TERM_DAYS = 180;
export const DEFAULT_PROTECTION_DAYS = 90;

export type BrokerageIdentity = {
  legalName: string;
  licenseNumber: string;
  brokerOfRecordName: string;
  brokerOfRecordLicense: string;
  listingTermDays: number;
  protectionDays: number;
  placeholder: boolean;
};

function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

export function identityFromMap(map: Record<string, string>): BrokerageIdentity {
  const legalName = (map[IDENTITY_KEYS.legalName] ?? "").trim() || PLACEHOLDER_LEGAL_NAME;
  const licenseNumber = (map[IDENTITY_KEYS.license] ?? "").trim() || PLACEHOLDER_LICENSE;
  const brokerOfRecordName =
    (map[IDENTITY_KEYS.brokerOfRecordName] ?? "").trim() || PLACEHOLDER_LEGAL_NAME;
  const brokerOfRecordLicense =
    (map[IDENTITY_KEYS.brokerOfRecordLicense] ?? "").trim() || PLACEHOLDER_LICENSE;
  const listingTermDays = positiveInt(
    map[IDENTITY_KEYS.listingTermDays],
    DEFAULT_LISTING_TERM_DAYS,
  );
  const protectionDays = positiveInt(
    map[IDENTITY_KEYS.protectionDays],
    DEFAULT_PROTECTION_DAYS,
  );
  const placeholder = !brokerageIdentityIsRenderable(
    legalName,
    licenseNumber,
    brokerOfRecordName,
    brokerOfRecordLicense,
  );
  return {
    legalName,
    licenseNumber,
    brokerOfRecordName,
    brokerOfRecordLicense,
    listingTermDays,
    protectionDays,
    placeholder,
  };
}

export async function loadBrokerageIdentity(
  admin: ReturnType<typeof createServiceRoleClient>,
): Promise<BrokerageIdentity> {
  const { data } = await admin.from("settings").select("key, value");
  const map: Record<string, string> = {};
  for (const row of data ?? []) map[row.key] = row.value;
  return identityFromMap(map);
}

/** Agreements must not emit placeholder brokerage identity into customer documents. */
export function assertRenderableBrokerageIdentity(identity: BrokerageIdentity): void {
  if (identity.placeholder) {
    throw new Error(
      "Brokerage identity is not configured. Set the legal name, license, and broker of record in settings before generating an agreement.",
    );
  }
}

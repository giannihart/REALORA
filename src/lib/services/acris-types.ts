export type LastSale = { date: string; amountCents: number };

export type LastDeed = { type: string; date: string };

export type PropertyRecord = {
  bbl: string;
  normalizedAddress: string;
  lat: number;
  lng: number;
  borough: string;
  block: string;
  lot: string;
  propertyType: string | null;
  ownersOfRecord: string[];
  lastSale: LastSale | null;
  lastDeed: LastDeed | null;
  documentCount: number;
  openViolations: number | null;
};

/** Public-record fields only — never include platform table data. */
export type PublicAcrisRecord = {
  owners: string[];
  address: string;
  bbl: string;
  borough: string;
  block: string;
  lot: string;
  unit: string | null;
  propertyType: string | null;
  lastDeed: LastDeed | null;
};

export type PublicAcrisCandidate = {
  bbl: string;
  address: string;
  unit: string | null;
  borough: string;
  block: string;
  lot: string;
  owners: string[];
};

export type AcrisLookupReason =
  | "matched"
  | "condo_units_available"
  | "coop_no_deeds"
  | "no_deed_for_lot"
  | "bbl_not_found"
  | "address_unresolved"
  | "upstream_error";

export type AcrisDiagnostics = {
  input: string;
  borough: string | null;
  resolved: {
    address: string;
    borough: string;
    bbl: string;
    candidateCount: number;
  } | null;
  counts: {
    master: number;
    legals: number;
    parties: number;
  };
  reason: AcrisLookupReason;
};

/** Slim diagnostics for production API responses. */
export type AcrisDiagnosticsPublic = {
  resolved: { address: string; bbl: string } | null;
  reason: AcrisLookupReason;
};

export type PublicAcrisLookup =
  | { status: "match"; record: PublicAcrisRecord; diagnostics: AcrisDiagnostics }
  | { status: "none"; diagnostics: AcrisDiagnostics }
  | {
      status: "multiple";
      candidates: PublicAcrisCandidate[];
      diagnostics: AcrisDiagnostics;
    };

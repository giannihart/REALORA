/**
 * NYC Open Data (Socrata) dataset IDs, resolved 2026-10-29 from
 * https://api.us.socrata.com/api/catalog/v1?domains=data.cityofnewyork.us&q=ACRIS
 * and q=DOB Violations. Pin them here — do not scatter IDs across the codebase.
 *
 * Real Property (not Personal Property) ACRIS extracts:
 *   Master  bnx9-e6tj  document details (doc type, amount, dates)
 *   Parties 636b-3b5g  party names (grantee = owner of record)
 *   Legals  8h5j-fqxa  borough/block/lot per document
 * DOB Violations 3h2n-5cm9  BIS civil penalties (open-count is best-effort)
 */
export const SOCRATA_DOMAIN = "data.cityofnewyork.us";

export const SOCRATA_DATASETS = {
  acrisMaster: "bnx9-e6tj",
  acrisParties: "636b-3b5g",
  acrisLegals: "8h5j-fqxa",
  dobViolations: "3h2n-5cm9",
  /** 2020 Neighborhood Tabulation Areas (polygons). */
  nta2020: "9nt8-h7nd",
} as const;

export function socrataResourceUrl(datasetId: string): string {
  return `https://${SOCRATA_DOMAIN}/resource/${datasetId}.json`;
}

export function socrataGeoJsonUrl(datasetId: string): string {
  return `https://${SOCRATA_DOMAIN}/resource/${datasetId}.geojson`;
}

export function socrataHeaders(): HeadersInit {
  const token = process.env.SOCRATA_APP_TOKEN;
  if (!token) return { Accept: "application/json" };
  return { Accept: "application/json", "X-App-Token": token };
}

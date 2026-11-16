export interface AcrisSummary {
  address: string;
  owner: string;
  borough: string;
  block: string;
  lot: string;
  yearBuilt: number;
  lastDeed: string;
  assessedValue: number;
}

export interface AcrisService {
  lookup(address: string): Promise<AcrisSummary | null>;
}

/** Local-mode stub. Live ACRIS lives in server-only `acris.ts`. */
export const acrisService: AcrisService = {
  async lookup(address: string) {
    const trimmed = address.trim();
    if (!trimmed) return null;
    return {
      address: trimmed,
      owner: "Record owner on file",
      borough: trimmed.toLowerCase().includes("brooklyn") ? "Brooklyn" : "Manhattan",
      block: "01234",
      lot: "0056",
      yearBuilt: 1924,
      lastDeed: "2021-06-18",
      assessedValue: 2_140_000,
    };
  },
};

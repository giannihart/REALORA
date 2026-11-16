export interface SyndicationStatus {
  channel: string;
  live: boolean;
  at: string;
}

export interface SyndicationService {
  current(): Promise<SyndicationStatus[]>;
}

export const syndicationService: SyndicationService = {
  async current() {
    return [
      { channel: "RLS", live: true, at: "2026-09-18 09:12" },
      { channel: "StreetEasy", live: true, at: "2026-09-18 09:40" },
      { channel: "Zillow", live: true, at: "2026-09-18 10:02" },
      { channel: "Trulia", live: true, at: "2026-09-18 10:02" },
    ];
  },
};

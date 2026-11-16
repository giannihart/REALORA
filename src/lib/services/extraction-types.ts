export type ContractParties = {
  seller: string | null;
  buyer: string | null;
};

export type ContractDeposit = {
  amountCents: number | null;
  holderName: string | null;
};

export type ContractFinancing = {
  type: string | null;
  mortgageAmountCents: number | null;
  commitmentDeadline: string | null;
};

export type ContractClosing = {
  onOrAbout: string | null;
  outsideDate: string | null;
};

export type ContractContingency = {
  name: string;
  date: string | null;
};

export type ContractExtraction = {
  parties: ContractParties;
  premisesAddress: string | null;
  purchasePriceCents: number | null;
  contractDate: string | null;
  deposit: ContractDeposit;
  financing: ContractFinancing;
  closing: ContractClosing;
  contingencies: ContractContingency[];
  condoRider: boolean | null;
  inclusionsNotes: string | null;
  exclusionsNotes: string | null;
};

export type ExtractedPayload = {
  status: "proposed" | "confirmed";
  proposed: ContractExtraction;
  confirmed?: ContractExtraction | null;
  confirmerId?: string | null;
  confirmedAt?: string | null;
};

export const EMPTY_EXTRACTION: ContractExtraction = {
  parties: { seller: null, buyer: null },
  premisesAddress: null,
  purchasePriceCents: null,
  contractDate: null,
  deposit: { amountCents: null, holderName: null },
  financing: { type: null, mortgageAmountCents: null, commitmentDeadline: null },
  closing: { onOrAbout: null, outsideDate: null },
  contingencies: [],
  condoRider: null,
  inclusionsNotes: null,
  exclusionsNotes: null,
};

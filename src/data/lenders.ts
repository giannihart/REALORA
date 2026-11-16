/**
 * Panel lenders for orientation. Realora is not a lender and takes no referral fees.
 * No logos, no rates, no rankings. Emails are for packet introductions only.
 */

export interface PanelLender {
  id: string;
  name: string;
  specialty: string;
  tag: "Works with Realora timelines";
  /** Introduction inbox for lender packets (sample addresses in this build). */
  email: string;
}

export const PANEL_LENDERS: PanelLender[] = [
  {
    id: "sample-harbor",
    name: "Harbor Street Lending",
    specialty: "Jumbo and townhouse financing across New York.",
    tag: "Works with Realora timelines",
    email: "intros+harbor@realora.dev",
  },
  {
    id: "sample-board",
    name: "Boardhouse Mortgage",
    specialty: "Co-op fluent — building questionnaires and board packages.",
    tag: "Works with Realora timelines",
    email: "intros+boardhouse@realora.dev",
  },
  {
    id: "sample-first",
    name: "First Keys Home Loans",
    specialty: "First-time buyers, FHA and VA when those loans fit.",
    tag: "Works with Realora timelines",
    email: "intros+firstkeys@realora.dev",
  },
];

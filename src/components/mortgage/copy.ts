/** Not-a-lender footer print — shown on /mortgage intake screens. */
export const FOOT_PRINT =
  "Realora is not a lender or mortgage broker and does not make credit decisions. Loans are provided by independent lenders; you may use any lender you choose.";

export const FAQ = [
  {
    q: "Is Realora a lender?",
    a: "No. Realora is not a lender or mortgage broker and does not make credit decisions. Loans come from independent lenders you choose — including ones you already work with.",
  },
  {
    q: "Does this hurt my credit?",
    a: "No. Completing the packet on Realora does not pull your credit. A lender may run a credit check later only if you continue with them off the platform.",
  },
  {
    q: "Who sees my information?",
    a: "Your packet goes only to the lender you direct us to send it to, with your consent on record. Realora does not sell your information.",
  },
  {
    q: "What is the buying-power number?",
    a: "It is Realora’s estimate from the income, debts, and cash you enter — not a lender’s commitment. It becomes your lender’s number on Realora once a pre-approval letter is confirmed through the platform.",
  },
  {
    q: "Can I use my own lender?",
    a: "Yes. You may introduce any lender you choose. If you already have a pre-approval letter, upload it on your Financing page instead of starting a new packet.",
  },
] as const;

/** Last FAQ row — free-text ask; answer fills like other FAQ answers (chat API later). */
export const FAQ_ASK_PLACEHOLDER = "Ask anything…";

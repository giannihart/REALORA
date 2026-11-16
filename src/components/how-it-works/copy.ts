/** How it works — product story. Rules: no tours, attorney escrow, seller representation, verification never self-attested. */

export const FOOT_PRINT =
  "REALORA is in formation and is not yet a licensed New York real estate broker. Brokerage services, if any, will be provided only once licensed or through a licensed broker partner.";

export const PILLARS = [
  {
    title: "1% to sell.",
    body: "Realora’s fee is 1% of the sale price, paid at closing from proceeds. Optional +1% to a buyer’s agent is your election — never Realora’s take on the buyer side.",
  },
  {
    title: "Both parties. Always.",
    body: "On listed deals, Realora represents the seller. The portal keeps buyer and seller on the same file without flipping who we work for.",
  },
  {
    title: "Attorneys hold the money",
    body: "Contracts are drafted by counsel. Deposits sit in the seller’s attorney’s escrow. Realora coordinates — it never holds client funds.",
  },
  {
    title: "Virtual tours. By design.",
    body: "Realora does not host, schedule, or attend showings. Buyers visit on their own. 3D / Matterport-style media is photography product on the listing.",
  },
] as const;

export const SELL_INTRO = {
  id: "selling",
  eyebrow: "Act one · Selling",
  title: "List once. Keep more. Close on the number you approved.",
  sub: "From address intake to clear-to-close, every step lives in one seller portal.",
} as const;

export const SELL_CHAPTERS = [
  {
    id: "start",
    label: "01",
    title: "Open a listing plan",
    body: "Confirm the property, walk ACRIS facts, sign the listing agreement, and schedule media. Ownership is checked in intake and staff review — never a self-attested checkbox.",
  },
  {
    id: "keep",
    label: "02",
    title: "See what you keep before you list",
    body: "Traditional brokerage often takes about 5.5%. Realora is 1%. Run the net sheet, then list against a keep number you already understand.",
  },
  {
    id: "live",
    label: "03",
    title: "Go live where buyers look",
    body: "Photography, video, floor plan, and Matterport-style media ship with the listing. It publishes to the marketplace and MLS/RLS feeds. Realora does not attend viewings — buyers come on their own.",
  },
  {
    id: "offers",
    label: "04",
    title: "Compare offers by net and certainty",
    body: "ID, funds, and financing status are confirmed through platform and staff flows before they show as verified. You rank what you actually take home — not theater.",
  },
  {
    id: "contract",
    label: "05",
    title: "Attorneys draft. Escrow stays with counsel.",
    body: "Approve price, choose the offer, sign. Both attorneys work from the same term package. The deposit goes to the seller’s attorney’s escrow.",
  },
  {
    id: "close",
    label: "06",
    title: "Close against the net sheet you approved",
    body: "Inspection, title, appraisal, and lender chase sit on one timeline. Closing reconciles to the keep figure you saw on day one.",
  },
] as const;

export const BRIDGE = {
  title: "Same record. Other side of the deal.",
  body: "Buyers shop, verify, and offer on the same platform the seller runs — one file, two perspectives, no duplicate paperwork wars.",
} as const;

export const BUY_INTRO = {
  id: "buying",
  eyebrow: "Act two · Buying",
  title: "Know your number. Offer with proof. Track every deadline.",
  sub: "Financing, verification, and progress stay visible from first save through clear-to-close.",
} as const;

export const BUY_CHAPTERS = [
  {
    id: "start",
    label: "01",
    title: "Browse live inventory",
    body: "Create an account, save homes, and open the portal. Search and listing detail are the same marketplace on Buy.",
  },
  {
    id: "power",
    label: "02",
    title: "Know your buying power",
    body: "Income, debts, and cash feed the gauge on Financing. It is Realora’s estimate until a lender’s pre-approval is confirmed on platform.",
  },
  {
    id: "mortgage",
    label: "03",
    title: "Optional lender introduction",
    body: "A short packet goes to a lender you choose. Realora is not a lender, charges no fee for the intro, and never makes a credit decision.",
  },
  {
    id: "verify",
    label: "04",
    title: "Verification is done for real",
    body: "Identity and funds are confirmed through platform and AE/staff review. A self-check is never enough to show as verified on an offer.",
  },
  {
    id: "offer",
    label: "05",
    title: "Submit terms the seller can trust",
    body: "Financing type, contingencies, and verification status land on the seller’s comparison board — the same UI they use to choose.",
  },
  {
    id: "close",
    label: "06",
    title: "One timeline through clear-to-close",
    body: "Once accepted, counsel drafts from platform terms. Deposits go to the seller’s attorney’s escrow. Diligence and closing prep stay in your portal.",
  },
] as const;

export const SELL_NEXT_STEP = {
  title: "Review 3 offers",
  body: "Three term sheets are in. Rank by net proceeds and certainty, then accept, counter, or decline.",
  cta: "Open offers",
  ctaHref: "/portal",
};

export const BUY_NEXT_STEP = {
  title: "Your offer is with the seller",
  body: "The seller is comparing price, certainty, and timing. We will update this the moment they decide. Your term sheet stays in Documents.",
  cta: "View your terms",
  ctaHref: "/portal",
};

export const SELL_HANDLING = [
  {
    id: "hiw-insp",
    title: "Inspection coordination",
    description: "Vendor booked; report files to the vault when ready.",
    status: "In Progress" as const,
  },
  {
    id: "hiw-title",
    title: "Title search",
    description: "Title company assigned and chasing clearances.",
    status: "Waiting" as const,
  },
  {
    id: "hiw-lender",
    title: "Buyer lender follow-up",
    description: "Daily chase until clear-to-close — silence is never the status.",
    status: "In Progress" as const,
  },
] as const;

export const SELL_DEADLINE = {
  item: "Inspection contingency",
  date: "Nov 14",
};

export const SELL_TIMELINE = [
  {
    id: "list",
    order: 1,
    title: "Listed",
    status: "Complete" as const,
    date: "Oct 2",
    description: "Live on Realora and MLS/RLS feeds.",
  },
  {
    id: "offer",
    order: 2,
    title: "Offer accepted",
    status: "Complete" as const,
    date: "Oct 18",
    description: "Cash offer with funds verified on platform.",
  },
  {
    id: "contract",
    order: 3,
    title: "Contract",
    status: "In Progress" as const,
    targetDate: "Oct 28",
    description: "Attorneys exchanging drafts; deposit to seller counsel escrow.",
  },
  {
    id: "diligence",
    order: 4,
    title: "Diligence",
    status: "Upcoming" as const,
    description: "Inspection, title, and appraisal on the calendar.",
  },
  {
    id: "close",
    order: 5,
    title: "Closing",
    status: "Upcoming" as const,
    description: "Final numbers vs. your day-one net sheet.",
  },
] as const;

export const BUY_TIMELINE = [
  {
    id: "saved",
    order: 1,
    title: "Home saved",
    status: "Complete" as const,
    date: "Oct 5",
    description: "On your shortlist with buying-power context.",
  },
  {
    id: "financing",
    order: 2,
    title: "Financing ready",
    status: "Complete" as const,
    date: "Oct 12",
    description: "Pre-approval confirmed by staff — not a self-check.",
  },
  {
    id: "offer",
    order: 3,
    title: "Offer submitted",
    status: "In Progress" as const,
    description: "With the seller for comparison.",
  },
  {
    id: "contract",
    order: 4,
    title: "Contract",
    status: "Upcoming" as const,
    description: "Attorneys and escrow with seller counsel.",
  },
  {
    id: "close",
    order: 5,
    title: "Closing",
    status: "Upcoming" as const,
    description: "Clear-to-close through your portal timeline.",
  },
] as const;

export const MORTGAGE_CARDS = [
  {
    title: "Where to shop in your range",
    body: "Weigh a lower or higher price against your real numbers.",
  },
  {
    title: "Your monthly payment",
    body: "See how down payment and loan program shift it.",
  },
  {
    title: "Your cash to close",
    body: "What goes out up front, and what to keep in reserve.",
  },
] as const;

export const VERIFY_POINTS = [
  {
    title: "Identity",
    body: "Confirmed through platform / AE / staff flows — not a buyer checkbox.",
  },
  {
    title: "Funds or pre-approval",
    body: "Cash proof or lender letter reviewed before it shows as verified on an offer.",
  },
  {
    title: "Ownership (sellers)",
    body: "Listing ownership is checked in intake and staff review before go-live.",
  },
] as const;

export const FAQ = [
  {
    q: "Do I still need an attorney?",
    a: "Yes. In New York, attorneys draft and review the contract of sale. Realora coordinates them and never replaces counsel. Deposits stay in the seller’s attorney’s escrow.",
  },
  {
    q: "Does Realora show the home?",
    a: "No. Realora does not conduct, host, staff, schedule, or book tours or showings. Buyers may visit on their own. Listing media can include a 3D / Matterport-style walkthrough as photography product.",
  },
  {
    q: "Who does Realora represent?",
    a: "On listed deals, Realora always represents the seller. Optional +1% to a buyer’s agent is the seller’s election. Buyer fee is never Realora’s take on the seller side.",
  },
  {
    q: "What does the 1% cover?",
    a: "Pricing support, media, listing and marketing, offer verification and management, and coordination through closing. Paid at closing from proceeds — never upfront. Attorney, title, and lender costs remain yours.",
  },
  {
    q: "Is Realora a lender?",
    a: "No. Mortgage intake is an optional introduction to an independent lender you choose. Realora does not make credit decisions.",
  },
] as const;

export const FAQ_ASK_PLACEHOLDER = "Ask anything…";

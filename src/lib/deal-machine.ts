import { BUYER_PERSONA_OFFER_ID } from "@/data/seed";
import type {
  ComingUpItem,
  Deal,
  DealState,
  DealView,
  Deadline,
  HandlingTask,
  Milestone,
  NextStep,
} from "@/lib/types";

const DEAL_ORDER: DealState[] = [
  "INTAKE",
  "PREP",
  "LIVE",
  "TOURS_OFFERS",
  "ACCEPTED",
  "CONTRACT",
  "IN_CONTRACT",
  "DILIGENCE",
  "CLEAR_TO_CLOSE",
  "CLOSING",
  "POST_CLOSE",
];

export function stateIndex(state: DealState): number {
  if (state === "FELL_THROUGH") return -1;
  return DEAL_ORDER.indexOf(state);
}

export function atLeast(state: DealState, min: DealState): boolean {
  return stateIndex(state) >= stateIndex(min);
}

function countComplete(milestones: Milestone[]): { done: number; total: number } {
  return {
    done: milestones.filter((m) => m.status === "Complete").length,
    total: milestones.length,
  };
}

function buyerRejected(deal: Deal): boolean {
  return Boolean(
    deal.acceptedOfferId && deal.acceptedOfferId !== BUYER_PERSONA_OFFER_ID,
  );
}

function buyerMilestones(deal: Deal): Milestone[] {
  const s = deal.state;
  const inspectionStatus: Milestone["status"] = atLeast(s, "CLEAR_TO_CLOSE")
    ? "Complete"
    : s === "DILIGENCE"
      ? "In Progress"
      : "Upcoming";
  const mortgageStatus: Milestone["status"] = atLeast(s, "CLOSING")
    ? "Complete"
    : s === "CLEAR_TO_CLOSE"
      ? "In Progress"
      : "Upcoming";
  const titleStatus: Milestone["status"] = atLeast(s, "CLOSING")
    ? "Complete"
    : "Upcoming";
  const ctcStatus: Milestone["status"] = atLeast(s, "CLOSING")
    ? "Complete"
    : "Upcoming";
  const closeStatus: Milestone["status"] = s === "CLOSING" ? "In Progress" : atLeast(s, "POST_CLOSE") ? "Complete" : "Upcoming";
  const deedStatus: Milestone["status"] = atLeast(s, "POST_CLOSE")
    ? "Complete"
    : "Upcoming";

  return [
    {
      id: "b1",
      index: 1,
      title: "Buyer onboarding",
      status: "Complete",
      completedOn: "2026-09-08",
    },
    {
      id: "b2",
      index: 2,
      title: "Offer submitted",
      status: atLeast(s, "TOURS_OFFERS") ? "Complete" : "Upcoming",
      completedOn: atLeast(s, "TOURS_OFFERS") ? "2026-10-09" : undefined,
    },
    {
      id: "b3",
      index: 3,
      title: "Offer accepted",
      status: atLeast(s, "ACCEPTED") ? "Complete" : "Upcoming",
      completedOn: atLeast(s, "ACCEPTED") ? "2026-10-12" : undefined,
    },
    {
      id: "b4",
      index: 4,
      title: "Earnest money deposit",
      status: atLeast(s, "IN_CONTRACT") ? "Complete" : "Upcoming",
      completedOn: atLeast(s, "IN_CONTRACT") ? "2026-10-14" : undefined,
    },
    {
      id: "b5",
      index: 5,
      title: "Inspection and due diligence",
      status: inspectionStatus,
      description:
        inspectionStatus === "In Progress"
          ? deal.inspectionBooked
            ? "Property inspection is scheduled. Review access notes and confirm attendance."
            : "Property inspection is the current diligence item. Schedule the visit, then review the report in Documents."
          : undefined,
      responsible:
        inspectionStatus === "In Progress" ? "Alex Chen · Inspector" : undefined,
      next:
        inspectionStatus === "In Progress"
          ? deal.inspectionBooked
            ? "Attend inspection · await report"
            : "Schedule inspection · await report"
          : undefined,
      actions:
        inspectionStatus === "In Progress"
          ? [
              { label: "View related tasks", href: "/portal/buyer/services" },
              { label: "View documents", href: "/portal/buyer/documents" },
            ]
          : undefined,
    },
    {
      id: "b6",
      index: 6,
      title: "Mortgage underwriting and appraisal",
      status: mortgageStatus,
    },
    {
      id: "b7",
      index: 7,
      title: "Title & closing prep",
      status: titleStatus,
    },
    {
      id: "b8",
      index: 8,
      title: "Clear to close",
      status: ctcStatus,
    },
    {
      id: "b9",
      index: 9,
      title: "Closing day",
      status: closeStatus,
    },
    {
      id: "b10",
      index: 10,
      title: "Deed recorded & keys",
      status: deedStatus,
    },
  ];
}

function sellerMilestones(deal: Deal): Milestone[] {
  const s = deal.state;
  const mark = (
    completeAt: DealState,
    inProgressAt: DealState,
  ): Milestone["status"] => {
    if (atLeast(s, completeAt)) return "Complete";
    if (s === inProgressAt) return "In Progress";
    return "Upcoming";
  };

  return [
    {
      id: "s1",
      index: 1,
      title: "Listing prep",
      status: atLeast(s, "PREP") ? "Complete" : s === "INTAKE" ? "In Progress" : "Upcoming",
      completedOn: atLeast(s, "PREP") ? "2026-09-12" : undefined,
    },
    {
      id: "s2",
      index: 2,
      title: "Listing is Live",
      status: atLeast(s, "LIVE") ? "Complete" : s === "PREP" ? "In Progress" : "Upcoming",
      completedOn: atLeast(s, "LIVE") ? "2026-09-18" : undefined,
    },
    {
      id: "s3",
      index: 3,
      title: "Offers",
      status: mark("ACCEPTED", "TOURS_OFFERS"),
      description:
        s === "TOURS_OFFERS" || s === "LIVE"
          ? "Term sheets land here. Rank by net proceeds and certainty, then accept, counter, or decline."
          : undefined,
    },
    {
      id: "s4",
      index: 4,
      title: "Accepted",
      status: mark("CONTRACT", "ACCEPTED"),
      completedOn: atLeast(s, "ACCEPTED") ? "2026-10-12" : undefined,
    },
    {
      id: "s5",
      index: 5,
      title: "Contract",
      status: mark("DILIGENCE", "CONTRACT"),
      completedOn: atLeast(s, "IN_CONTRACT") ? "2026-10-14" : undefined,
    },
    {
      id: "s6",
      index: 6,
      title: "Diligence",
      status: mark("CLEAR_TO_CLOSE", "DILIGENCE"),
    },
    {
      id: "s7",
      index: 7,
      title: "Clear to close",
      status: mark("CLOSING", "CLEAR_TO_CLOSE"),
    },
    {
      id: "s8",
      index: 8,
      title: "Closing",
      status: s === "CLOSING" ? "In Progress" : atLeast(s, "POST_CLOSE") ? "Complete" : "Upcoming",
    },
  ];
}

function buyerNext(deal: Deal): NextStep {
  if (buyerRejected(deal)) {
    return {
      title: "The seller accepted another offer",
      body: "Your terms were not selected. You can keep searching — new listings go live on the marketplace every week.",
      cta: "Browse homes",
      ctaHref: "/buy",
      ctaAction: "browse-homes",
    };
  }

  if (deal.state === "TOURS_OFFERS") {
    return {
      title: "Your offer is with the seller",
      body: "The seller is comparing price, certainty, and timing. We will update this the moment they decide. Your term sheet stays in Documents.",
      cta: "View your terms",
      ctaHref: "/portal/buyer/documents",
      due: "Expires Oct 21",
    };
  }

  if (deal.state === "DILIGENCE") {
    if (!deal.inspectionBooked) {
      return {
        title: "Review inspection report",
        body: "Open the report in Documents. Decide on repair requests or contingency next steps with your broker. Legal advice comes from counsel after legal review if needed.",
        cta: "Schedule inspection",
        ctaAction: "schedule-inspection",
        due: "Due Oct 27",
      };
    }
    if (!deal.inspectionReportReviewed) {
      return {
        title: "Confirm attendance / await report",
        body: "Inspection is on the calendar with Alex Chen. Attend the visit, then the report will land in Documents.",
        cta: "View related tasks",
        ctaHref: "/portal/buyer/services",
        due: "Target Oct 24",
      };
    }
    return {
      title: "Send repair requests or proceed",
      body: "The report is in Documents. Decide on repair requests with counsel after legal review, or confirm you are ready to proceed.",
      cta: "Open report",
      ctaHref: "/portal/buyer/documents",
    };
  }

  if (deal.state === "CLEAR_TO_CLOSE") {
    return {
      title: "Review underwriting status",
      body: "Mortgage underwriting and appraisal are the current items. Cash buyers skip lender conditions and wait on title.",
      cta: "Open financing",
      ctaHref: "/portal/buyer/financing",
    };
  }

  if (deal.state === "CLOSING") {
    return {
      title: "Confirm closing details",
      body: "Attorneys set the table. Deposits remain with the seller's attorney's escrow. REALORA coordinates the room, the wire instructions, and the key handoff.",
      cta: "Open documents",
      ctaHref: "/portal/buyer/documents",
    };
  }

  if (deal.state === "POST_CLOSE") {
    return {
      title: "Deed recorded — keys are yours",
      body: "Recording is in. Welcome home. Utilities, locksmith, and movers stay available in Services.",
      cta: "Book a locksmith",
      ctaHref: "/portal/buyer/services",
    };
  }

  return {
    title: "Sit tight — we are coordinating",
    body: "Your next step updates automatically when this is done.",
    cta: "View progress",
    ctaHref: "/portal/buyer/progress",
  };
}

const AE_ROLES = new Set(["agent_seller", "broker_of_record"]);

export function isAeViewer(partyRoles: string[] = []): boolean {
  return partyRoles.some((role) => AE_ROLES.has(role));
}

function isPlainSellerViewer(partyRoles: string[] = []): boolean {
  const hasSeller = partyRoles.some((role) => role === "seller" || role === "co_seller");
  return hasSeller && !isAeViewer(partyRoles);
}

function sellerNext(deal: Deal, offerCount: number, partyRoles: string[] = []): NextStep {
  if (isAeViewer(partyRoles) && deal.state === "ACCEPTED") {
    return {
      title: "Confirm the executed contract",
      body: "Attorneys have circulated the contract. Confirm it is fully executed so the deposit can be posted to the seller's attorney's escrow.",
      cta: "Confirm contract",
      ctaAction: "mark-contract",
    };
  }
  if (isAeViewer(partyRoles) && deal.state === "CONTRACT") {
    return {
      title: "Confirm deposit received",
      body: "Earnest money is held by the seller's attorney's escrow — the platform never holds it. Confirm receipt to open diligence.",
      cta: "Confirm deposit",
      ctaAction: "confirm-deposit",
    };
  }
  if (deal.state === "INTAKE" || deal.state === "PREP") {
    // Price, photos, media, and permits are internal. HomePanels clears this to
    // null once the listing agreement is signed (“You're all up to date”).
    return {
      title: "Sign your listing agreement",
      body: "Review and sign in Documents. Realora handles pricing, media, and permit research.",
      cta: "Open documents",
      ctaHref: "/portal/seller/documents",
    };
  }
  if (deal.state === "TOURS_OFFERS") {
    return {
      title: `Review ${offerCount} offers`,
      body: "Compare terms side by side. Highest purchase price is not necessarily the strongest offer. Consequential decisions require an explicit confirmation step.",
      cta: "Open offers",
      ctaHref: "/portal/seller/offers",
      ctaAction: "review-offers",
      due: "Best & final Oct 23",
    };
  }
  if (deal.state === "DILIGENCE") {
    return {
      title: "Track diligence",
      body: "Inspection and title are underway. Respond if the buyer asks for repairs or credits. Attorneys draft; the platform coordinates.",
      cta: "Open documents",
      ctaHref: "/portal/seller/documents",
    };
  }
  if (deal.state === "LIVE") {
    return {
      title: "Review tour feedback",
      body: "The listing is live on RLS, StreetEasy, Zillow, and Trulia. Tour notes collect here as they come in.",
      cta: "Open listing",
      ctaHref: "/portal/seller/listing",
    };
  }
  if (deal.state === "CLOSING") {
    return {
      title: "Confirm the closing table",
      body: "Attorneys run the closing. Deposits stay in the seller's attorney's escrow. REALORA coordinates everyone else.",
      cta: "Open documents",
      ctaHref: "/portal/seller/documents",
    };
  }
  if (deal.state === "POST_CLOSE") {
    return {
      title: "Closed — recording complete",
      body: "The deed is recorded. Final statements are in Documents.",
      cta: "View documents",
      ctaHref: "/portal/seller/documents",
    };
  }
  return {
    title: "Listing is moving",
    body: "Your next step updates automatically when this is done.",
    cta: "View progress",
    ctaHref: "/portal/seller/progress",
  };
}

function buyerHandling(deal: Deal): HandlingTask[] {
  if (deal.state === "TOURS_OFFERS") {
    return [
      {
        id: "bh1",
        title: "Present terms to the seller",
        description: "Realora is presenting your term sheet alongside competing offers.",
        status: "In Progress",
      },
      {
        id: "bh2",
        title: "Coordinate attorney intro",
        description: "Realora is lining up counsel for contract once an offer is accepted.",
        status: "Waiting",
      },
    ];
  }
  return [
    {
      id: "bh-title",
      title: "Title & settlement",
      description: "Realora is coordinating title and escrow with the settlement team.",
      status: "In Progress",
    },
    {
      id: "bh-appraisal",
      title: "Coordinate appraisal scheduling",
      description: "Realora is handling this for you.",
      status: "In Progress",
    },
    {
      id: "bh-search",
      title: "Order title search",
      description: "Waiting on title.",
      status: "Waiting",
    },
  ];
}

function sellerHandling(deal: Deal, partyRoles: string[] = []): HandlingTask[] {
  if (deal.state === "INTAKE" || deal.state === "PREP") {
    return [
      {
        id: "sh-media-scheduled",
        title: "Media handled by Realora",
        description:
          "Photography, 3D tour, video, and floor plan — scheduled when you listed.",
        status: "In Progress",
      },
      {
        id: "sh-expediter",
        title: "Realora is handling the permit research.",
        description:
          "Permits, filings, and record research — handled by our team behind the scenes.",
        status: "In Progress",
      },
    ];
  }
  if (deal.state === "LIVE") {
    return [
      {
        id: "sh-media-scheduled",
        title: "Media handled by Realora",
        description:
          "Photography, 3D tour, video, and floor plan — scheduled when you listed.",
        status: "In Progress",
      },
      {
        id: "sh-expediter",
        title: "Realora is handling the permit research.",
        description:
          "Permits, filings, and record research — handled by our team behind the scenes.",
        status: "In Progress",
      },
      {
        id: "sh-rls",
        title: "RLS syndication",
        description: "Live on StreetEasy, Zillow, Trulia, and RLS.",
        status: "In Progress",
      },
    ];
  }
  if (isPlainSellerViewer(partyRoles) && deal.state === "ACCEPTED") {
    return [
      {
        id: "sh-ae-contract",
        title: "Confirm the executed contract",
        description: "Realora is handling it — the listing broker confirms the executed contract.",
        status: "In Progress",
      },
      {
        id: "sh-contract",
        title: "Attorney contract draft",
        description: "Counsel is drafting. Realora is coordinating signatures.",
        status: "In Progress",
      },
    ];
  }
  if (isPlainSellerViewer(partyRoles) && deal.state === "CONTRACT") {
    return [
      {
        id: "sh-ae-deposit",
        title: "Confirm deposit received",
        description: "Realora is handling it — the listing broker confirms attorney escrow.",
        status: "In Progress",
      },
      {
        id: "sh-title",
        title: "Title & settlement",
        description: "Realora is coordinating title with the settlement team.",
        status: "Waiting",
      },
    ];
  }
  if (atLeast(deal.state, "TOURS_OFFERS") && !atLeast(deal.state, "ACCEPTED")) {
    return [
      {
        id: "sh-rls",
        title: "RLS syndication",
        description: "Live on StreetEasy, Zillow, Trulia, and RLS.",
        status: "Complete",
      },
      {
        id: "sh-media",
        title: "Media delivered",
        description: "Photography, 3D tour, video, and floor plan are in the listing — arranged by Realora.",
        status: "Complete",
      },
      {
        id: "sh-expediter",
        title: "Realora is handling the permit research.",
        description: "Permits, filings, and record research — handled by our team behind the scenes.",
        status: "In Progress",
      },
      {
        id: "sh-tours",
        title: "Tour feedback digest",
        description: "Realora is collecting notes after each showing.",
        status: "In Progress",
      },
    ];
  }
  return [
    {
      id: "sh-contract",
      title: "Attorney contract draft",
      description: "Counsel is drafting. Realora is coordinating signatures.",
      status: "Complete",
    },
    {
      id: "sh-title",
      title: "Title & settlement",
      description: "Realora is coordinating title with the settlement team.",
      status: "In Progress",
    },
    {
      id: "sh-diligence",
      title: "Buyer diligence window",
      description: "Inspection and document review are underway.",
      status: "In Progress",
    },
  ];
}

/**
 * Next deadline for the home header. Closing shows for both parties once a
 * real close date exists on the accepted offer — until then, no placeholder.
 */
function closingDeadline(deal: Deal): Deadline | null {
  // Wire to accepted-offer closeDate when that field is plumbed on Deal.
  void deal;
  return null;
}

function buyerDeadline(deal: Deal): Deadline | null {
  if (buyerRejected(deal)) {
    return { item: "Search for the next home", date: "Open" };
  }
  if (deal.state === "TOURS_OFFERS") {
    return { item: "Offer expires", date: "2026-10-21" };
  }
  if (deal.state === "DILIGENCE") {
    return { item: "Inspection contingency", date: "2026-10-27" };
  }
  if (deal.state === "CLEAR_TO_CLOSE") {
    return { item: "Appraisal / underwriting", date: "2026-10-31" };
  }
  if (
    deal.state === "CONTRACT" ||
    deal.state === "IN_CONTRACT" ||
    deal.state === "CLOSING" ||
    deal.state === "POST_CLOSE"
  ) {
    return closingDeadline(deal);
  }
  return null;
}

function sellerDeadline(deal: Deal): Deadline | null {
  if (deal.state === "TOURS_OFFERS") {
    return { item: "Best & final deadline", date: "2026-10-23" };
  }
  if (deal.state === "DILIGENCE") {
    return { item: "Inspection contingency", date: "2026-10-27" };
  }
  if (
    deal.state === "ACCEPTED" ||
    deal.state === "CONTRACT" ||
    deal.state === "IN_CONTRACT" ||
    deal.state === "CLEAR_TO_CLOSE" ||
    deal.state === "CLOSING" ||
    deal.state === "POST_CLOSE"
  ) {
    return closingDeadline(deal);
  }
  return null;
}

function comingUpFrom(milestones: Milestone[]): ComingUpItem[] {
  return milestones
    .filter((m) => m.status === "Upcoming")
    .slice(0, 2)
    .map((m) => ({ title: m.title, date: m.targetDate }));
}

export function getDealView(
  deal: Deal,
  offerCount = 3,
  partyRoles: string[] = [],
): DealView {
  const bMiles = buyerMilestones(deal);
  const sMiles = sellerMilestones(deal);
  const rejected = buyerRejected(deal);
  const buyerComingUp: ComingUpItem[] = rejected
    ? [{ title: "Browse the marketplace" }]
    : comingUpFrom(bMiles);

  return {
    buyerNext: buyerNext(deal),
    sellerNext: sellerNext(deal, offerCount, partyRoles),
    buyerHandling: buyerHandling(deal),
    sellerHandling: sellerHandling(deal, partyRoles),
    buyerMilestones: bMiles,
    sellerMilestones: sMiles,
    buyerDeadline: buyerDeadline(deal),
    sellerDeadline: sellerDeadline(deal),
    buyerProgress: countComplete(bMiles),
    sellerProgress: countComplete(sMiles),
    buyerComingUp,
    sellerComingUp: comingUpFrom(sMiles),
    buyerRejected: rejected,
  };
}

/** Accepting Buyer B fast-forwards CONTRACT + IN_CONTRACT into DILIGENCE. */
export function stateAfterAccept(): DealState {
  return "DILIGENCE";
}

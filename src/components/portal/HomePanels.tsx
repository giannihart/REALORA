"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { getDealView } from "@/lib/deal-machine";
import { useAppData } from "@/lib/data/use-app-data";
import type { DocumentItem, Milestone, NextStep, Role } from "@/lib/types";
import { resendSignatureAction } from "@/lib/actions/documents";
import { completeTaskAction } from "@/lib/actions/deal";
import { roleLabel } from "@/lib/invite-roles";
import { resolveOwnershipReviewAction } from "@/lib/actions/verification";
import { isSupabaseDataMode } from "@/lib/data/mode";
import { requestApprovalAction } from "@/lib/actions/approvals";
import {
  NextActionHome,
  type HomeViewModel,
  type PortalSection,
} from "@/components/portal/NextActionHome";
import { InspectionBookingCard } from "@/components/portal/InspectionBookingCard";
import { ConciergeOffers } from "@/components/portal/ConciergeOffers";
import { Timeline, type TimelineStage } from "@/components/portal/Timeline";
import { InvitePartyModal } from "@/components/portal/DealPeopleRoster";
import {
  ConsentsOverviewLine,
  DesignatedAgencyCard,
} from "@/components/portal/DesignatedAgencyCard";
import { BuyerPreOfferHome } from "@/components/portal/BuyerPreOfferHome";
import { effectiveOfferStatus } from "@/lib/offers";
import type { InviteRole } from "@/lib/invite-roles";
import type { Offer } from "@/lib/types";

function buyerHasLiveOffer(offers: Offer[]) {
  return offers.some((o) => {
    if (!o.isBuyerPersona) return false;
    const status = effectiveOfferStatus(o);
    return status !== "Declined" && status !== "Expired";
  });
}

function hrefToSection(href?: string, action?: NextStep["ctaAction"]): PortalSection {
  if (action === "schedule-inspection") return "providers";
  if (action === "review-offers") return "offers";
  if (action === "browse-homes") return "overview";
  if (!href) return "transaction";
  if (href.includes("/documents")) return "documents";
  if (href.includes("/services")) return "providers";
  if (href.includes("/financing")) return "financing";
  if (href.includes("/progress")) return "transaction";
  if (href.includes("/offers")) return "offers";
  if (href.includes("/listing")) return "listing";
  if (href.includes("/buy")) return "overview";
  return "transaction";
}

function toHomeView(
  role: Role,
  addressLine: string,
  dealView: ReturnType<typeof getDealView>,
  chip: string,
  sub: string,
  next: NextStep | null,
  signatureIssues: DocumentItem[] = [],
): HomeViewModel {
  const handling = (role === "buyer" ? dealView.buyerHandling : dealView.sellerHandling).map(
    (t) => ({
      id: t.id,
      title: t.title,
      detail: t.description,
      state: (t.status === "Waiting" ? "Pending" : "In progress") as "Pending" | "In progress",
      actionLabel: t.cta,
      actionId: t.documentId,
    }),
  );
  const miles = role === "buyer" ? dealView.buyerMilestones : dealView.sellerMilestones;
  const coming = (role === "buyer" ? dealView.buyerComingUp : dealView.sellerComingUp).map(
    (c, i) => {
      const match = miles.find((m) => m.title === c.title);
      return {
        id: `${c.title}-${i}`,
        title: c.title,
        detail: match?.description,
        date: c.date,
        order: match?.index,
      };
    },
  );
  const completed = miles
    .filter((m) => m.status === "Complete")
    .map((m) => ({
      id: m.id,
      title: m.title,
      date: m.completedOn,
    }));
  const progress = role === "buyer" ? dealView.buyerProgress : dealView.sellerProgress;
  const deadline = role === "buyer" ? dealView.buyerDeadline : dealView.sellerDeadline;

  return {
    addressLine,
    stageLabel: chip,
    overallStatus: sub,
    deadline: deadline ? { label: deadline.item, date: deadline.date } : undefined,
    nextStep: next
      ? {
          id: "next",
          title: next.title,
          why: next.body,
          // Only show expiry when the step itself declares urgency (offers, docs, etc.) —
          // not the deal's far closing deadline on idle "all up to date" states.
          due: next.due,
          dueDate: undefined,
          ctaLabel: next.cta,
          section: hrefToSection(next.ctaHref, next.ctaAction),
          afterComplete: "",
        }
      : null,
    handling: [
      ...handling,
      ...(role === "seller"
        ? signatureIssues.map((d) => ({
            id: `sig-${d.id}`,
            title: `${d.name} ${d.signStatus === "expired" ? "expired" : "declined"}`,
            detail: "Re-send the signature request to continue.",
            state: "Pending" as const,
            actionLabel: "Re-send",
            actionId: d.id,
          }))
        : []),
    ],
    comingUp: coming,
    completed,
    completedCount: progress.done,
    totalMilestones: progress.total,
  };
}

function sectionPath(role: Role, section: PortalSection) {
  const base = `/portal/${role}`;
  switch (section) {
    case "transaction":
      return `${base}/progress`;
    case "documents":
      return `${base}/documents`;
    case "providers":
    case "tasks":
      return `${base}/services`;
    case "financing":
      return "/portal/buyer/financing";
    case "listing":
      return "/portal/seller/listing";
    case "offers":
      return "/portal/seller/offers";
    case "messages":
      return `${base}/messages`;
    default:
      return base;
  }
}

function toStages(miles: Milestone[]): TimelineStage[] {
  return miles.map((m) => ({
    id: m.id,
    order: m.index,
    title: m.title,
    status: m.status,
    date: m.completedOn,
    targetDate: m.targetDate,
    description: m.description,
    responsibleParty: m.responsible,
    nextAction: m.next,
    relatedDocumentIds: m.actions?.some((a) => a.href.includes("documents"))
      ? ["docs"]
      : undefined,
    relatedTaskIds: m.actions?.some((a) => a.href.includes("services"))
      ? ["tasks"]
      : undefined,
  }));
}

function EmptySellerHome() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/sell");
  }, [router]);
  return <div className="px-4 py-16 text-sm text-muted" />;
}

export function PortalHome({ role }: { role: Role }) {
  const router = useRouter();
  const hydrated = useAppData((s) => s.hydrated);
  const deal = useAppData((s) => s.deal);
  const listings = useAppData((s) => s.listings);
  const offers = useAppData((s) => s.offers);
  const partyRoles = useAppData((s) => s.partyRoles ?? []);
  const markContractExecuted = useAppData((s) => s.markContractExecuted);
  const confirmDeposit = useAppData((s) => s.confirmDeposit);
  const documents = useAppData((s) => s.documents);
  const applySnapshot = useAppData((s) => s.applySnapshot);
  const assignments = useAppData((s) => s.assignments);
  const myDeals = useAppData((s) => s.myDeals);
  const dealId = useAppData((s) => s.dealId);
  const isBroker = useAppData((s) => s.isBroker);
  const dealRoster = useAppData((s) => s.dealRoster ?? []);
  const designatedAgency = useAppData((s) => s.designatedAgency ?? null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteRole, setInviteRole] = useState<InviteRole>("attorney_buyer");
  const [dismissedPrompts, setDismissedPrompts] = useState<string[]>([]);
  const signatureIssues = documents.filter(
    (d) => d.signStatus === "declined" || d.signStatus === "expired",
  );
  const listing = listings.find((l) => l.id === deal.listingId);
  const offerCount = offers.filter(
    (o) =>
      o.listingId === deal.listingId &&
      (o.status === "New" || o.status === "Viewed" || o.status === "Countered"),
  ).length;
  const view = useMemo(
    () => getDealView(deal, offerCount || 3, partyRoles),
    [deal, offerCount, partyRoles],
  );
  if (!hydrated) {
    return <div className="px-4 py-16 text-sm text-muted"></div>;
  }
  // Buyer pre-offer Home until a live (non-declined/expired) offer exists.
  // Prep vault workspaces never take over this screen.
  if (role === "buyer" && (!listing || !buyerHasLiveOffer(offers))) {
    return <BuyerPreOfferHome />;
  }
  if (!listing) return <EmptySellerHome />;

  const agreementSigned = documents.some((d) => {
    if (!/listing agreement/i.test(d.name)) return false;
    const status = (d.status ?? d.signStatus ?? "").toLowerCase();
    return (
      status === "signed" ||
      status === "fully executed" ||
      status === "fully_executed" ||
      status === "completed"
    );
  });
  // Sellers never set price/photos — Realora does that internally. After the
  // agreement is signed, acknowledge they're up to date (keep View listing).
  const next: NextStep | null =
    role === "buyer"
      ? view.buyerNext
      : deal.state === "INTAKE" || deal.state === "PREP"
        ? agreementSigned
          ? {
              title: "You're all up to date",
              body: "Nothing needed from you right now. Realora is preparing pricing, media, and permit research — we'll surface the next action here when something needs you.",
              cta: "View listing",
              ctaHref: "/portal/seller/listing",
            }
          : {
              title: "Sign your listing agreement",
              body: "Review and sign in Documents. Realora countersigns after you.",
              cta: "Open documents",
              ctaHref: "/portal/seller/documents",
            }
        : view.sellerNext;
  const chip =
    role === "buyer"
      ? deal.state === "DILIGENCE"
        ? "Inspection and due diligence"
        : deal.state === "ACCEPTED" || deal.state === "CONTRACT" || deal.state === "IN_CONTRACT"
          ? "Offer accepted"
        : view.buyerRejected
          ? "Offer not selected"
          : "Offer with seller"
      : deal.state === "TOURS_OFFERS"
        ? `Live · ${offerCount || 3} offers`
        : deal.state === "INTAKE" || deal.state === "PREP"
          ? "Getting ready to list"
          : deal.state === "LIVE"
            ? "Live"
            : "In contract";
  const sub =
    role === "buyer"
      ? deal.state === "DILIGENCE"
        ? "Property selected — offer preparation"
        : deal.state === "ACCEPTED" || deal.state === "CONTRACT" || deal.state === "IN_CONTRACT"
          ? "Offer accepted — Realora is coordinating the next chapter"
        : view.buyerRejected
          ? "This seller moved forward with another buyer"
          : "Term sheet submitted — waiting on the seller"
      : deal.state === "INTAKE" || deal.state === "PREP"
        ? agreementSigned
          ? "You're all up to date — Realora is preparing the listing"
          : "Sign your listing agreement — Realora handles the rest"
        : deal.state === "LIVE"
          ? "Listing is live on RLS and consumer portals"
          : "Listing is live on RLS and consumer portals";

  const homeView = {
    ...toHomeView(
      role,
      `${listing.address.replace(/#([A-Za-z0-9-]+)/, (_, u: string) => `#${u.toUpperCase()}`)}, ${listing.city}, ${listing.state} ${listing.zip}`,
      view,
      chip,
      sub,
      // Inspection booking lives in InspectionBookingCard — avoid a duplicate next-step CTA.
      role === "buyer" &&
        next?.ctaAction === "schedule-inspection" &&
        !deal.inspectionBooked
        ? null
        : next,
      signatureIssues,
    ),
    assignments: (assignments ?? []).length
      ? (assignments ?? []).map((a) => ({
          id: a.id,
          title: a.title,
          detail: a.due ? `${a.description} Due ${a.due}` : a.description,
          state: "Pending" as const,
          actionLabel: a.title === "Review seller ownership" ? "Approve" : "Mark done",
          actionId: a.id,
        }))
      : undefined,
    deals:
      (myDeals ?? []).length > 1
        ? (myDeals ?? []).map((d) => ({
            id: d.id,
            title: d.address,
            detail: `${roleLabel(d.role)} · ${d.state.replaceAll("_", " ")}`,
            state: "In progress" as const,
          }))
        : undefined,
  };

  const contractStates = new Set(["ACCEPTED", "CONTRACT", "IN_CONTRACT"]);
  const hasAttorneyOnSide = dealRoster.some(
    (p) =>
      p.kind === "party" &&
      ((role === "buyer" && p.role === "attorney_buyer") ||
        (role === "seller" && p.role === "attorney_seller")),
  );
  const hasInspector =
    dealRoster.some((p) => p.role === "inspector") ||
    Boolean(deal.inspectionBooked) ||
    Boolean(deal.ownInspector) ||
    Boolean(deal.serviceSelections?.Inspector);
  const showAttorneyPrompt =
    isSupabaseDataMode() &&
    contractStates.has(deal.state) &&
    !hasAttorneyOnSide &&
    !dismissedPrompts.includes(`attorney-${role}`);
  const showInspectorPrompt =
    isSupabaseDataMode() &&
    role === "buyer" &&
    deal.state === "DILIGENCE" &&
    !hasInspector &&
    !dismissedPrompts.includes("inspector");

  return (
    <>
      <NextActionHome
        image={listing.photos.find(Boolean)}
        propertyId={listing.id}
        view={homeView}
        overviewExtra={
          isSupabaseDataMode() && designatedAgency?.required ? (
            <ConsentsOverviewLine agency={designatedAgency} />
          ) : undefined
        }
        onHandlingAction={(item) => {
          if (!item.actionId) return;
          if (item.actionLabel === "Mark done") {
            void completeTaskAction(item.actionId).then((r) => {
              if (!r.ok) {
                toast(r.message);
                return;
              }
              applySnapshot(r.data);
              toast("Task complete.");
            });
            return;
          }
          if (item.actionLabel === "Approve") {
            void resolveOwnershipReviewAction(item.actionId, true).then((r) => {
              if (!r.ok) {
                toast(r.message);
                return;
              }
              applySnapshot(r.data);
              toast("Ownership approved.");
            });
            return;
          }
          void resendSignatureAction(item.actionId).then((r) => {
            if (!r.ok) {
              toast(r.message);
              return;
            }
            applySnapshot(r.data);
            toast("Signature request re-sent.");
          });
        }}
        onNavigate={(section) => {
          if (next?.ctaAction === "mark-contract") {
            void Promise.resolve(markContractExecuted?.()).catch(() => undefined);
            return;
          }
          if (next?.ctaAction === "confirm-deposit") {
            void Promise.resolve(confirmDeposit?.()).catch(() => undefined);
            return;
          }
          if (next?.ctaAction === "schedule-inspection") {
            // InspectionBookingCard on this page is the booking surface.
            return;
          }
          if (next?.ctaAction === "browse-homes") {
            router.push("/buy");
            return;
          }
          router.push(sectionPath(role, section));
        }}
      />
      {showAttorneyPrompt ? (
        <ContextualPrompt
          title="Invite your attorney"
          body="Invite your attorney — they draft and review the contract, and work from the same record."
          cta="Invite attorney"
          onCta={() => {
            setInviteRole(role === "seller" ? "attorney_seller" : "attorney_buyer");
            setInviteOpen(true);
          }}
          onDismiss={() =>
            setDismissedPrompts((ids) => [...ids, `attorney-${role}`])
          }
        />
      ) : null}
      {showInspectorPrompt ? (
        <ContextualPrompt
          title="Choose your inspector"
          body="Invite your inspector — they inspect the property, and work from the same record."
          cta="Open inspection"
          onCta={() => router.push(sectionPath(role, "providers"))}
          onDismiss={() => setDismissedPrompts((ids) => [...ids, "inspector"])}
        />
      ) : null}
      {role === "buyer" ? (
        <div className="mt-5 space-y-3">
          <InspectionBookingCard />
          <ConciergeOffers role="buyer" />
        </div>
      ) : (
        <div className="mt-5">
          <ConciergeOffers role="seller" />
        </div>
      )}
      {isSupabaseDataMode() && dealId && designatedAgency ? (
        <DesignatedAgencyCard
          dealId={dealId}
          agency={designatedAgency}
          onOpenDocument={(documentId) => {
            router.push(
              `${sectionPath(role, "documents")}?preview=${encodeURIComponent(documentId)}`,
            );
          }}
        />
      ) : null}
      {isSupabaseDataMode() && dealId && inviteOpen ? (
        <InvitePartyModal
          open={inviteOpen}
          dealId={dealId}
          initialRole={inviteRole}
          onClose={() => setInviteOpen(false)}
          onInvited={(snap, url) => {
            applySnapshot(snap);
            setInviteOpen(false);
            toast("Invite created. Share the link.");
            if (url) toast(url);
          }}
        />
      ) : null}
      <BrokerTools />
      <AeTools dealId={dealId} partyRoles={partyRoles} isBroker={Boolean(isBroker)} dealState={deal.state} />
    </>
  );
}

function ContextualPrompt({
  title,
  body,
  cta,
  onCta,
  onDismiss,
}: {
  title: string;
  body: string;
  cta: string;
  onCta: () => void;
  onDismiss: () => void;
}) {
  return (
    <section className="mt-5 rounded-2xl border border-forest bg-forest px-5 py-5 text-cream sm:px-6">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-lime">
          Next step
        </p>
        <button
          type="button"
          className="text-xs text-cream/60 hover:text-cream"
          onClick={onDismiss}
        >
          Dismiss
        </button>
      </div>
      <h2 className="mt-2 font-sans text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-cream/85">{body}</p>
      <Button variant="lime" className="mt-4 rounded-full px-5" onClick={onCta}>
        {cta}
      </Button>
    </section>
  );
}

function AeTools({
  dealId,
  partyRoles,
  isBroker,
  dealState,
}: {
  dealId: string | null;
  partyRoles: string[];
  isBroker: boolean;
  dealState: string;
}) {
  const applySnapshot = useAppData((s) => s.applySnapshot);
  const ae = isBroker || partyRoles.includes("agent_seller") || partyRoles.includes("broker_of_record");
  if (!isSupabaseDataMode() || !dealId || !ae) return null;
  return (
    <div className="mt-5 rounded-2xl border border-line bg-white p-5">
      <p className="text-sm font-semibold">Agent tools</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {dealState === "CONTRACT" ? (
          <Button
            className="rounded-xl"
            onClick={() => {
              void requestApprovalAction(dealId, "deposit_confirmation").then((r) => {
                if (!r.ok) {
                  toast(r.message);
                  return;
                }
                applySnapshot(r.data);
                toast("Deposit confirmation requested.");
              });
            }}
          >
            Request deposit confirmation
          </Button>
        ) : null}
        <Button href="/portal/seller/scorecard" variant="outline" className="rounded-xl">
          Scorecard
        </Button>
        {isBroker ? (
          <Button href="/portal/broker" variant="outline" className="rounded-xl">
            Broker console
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function BrokerTools() {
  const isBroker = useAppData((s) => s.isBroker);
  const deal = useAppData((s) => s.deal);
  const advanceClearToClose = useAppData((s) => s.advanceClearToClose);
  const markClosed = useAppData((s) => s.markClosed);
  if (!isBroker) return null;
  const actions: { label: string; run?: () => Promise<void>; show: boolean }[] = [
    { label: "Advance to clear to close", run: advanceClearToClose, show: deal.state === "DILIGENCE" },
    { label: "Mark closed", run: markClosed, show: deal.state === "CLEAR_TO_CLOSE" || deal.state === "CLOSING" },
  ];
  const visible = actions.filter((a) => a.show && a.run);
  if (!visible.length) return null;
  return (
    <div className="mt-5 rounded-2xl border border-line bg-white p-5">
      <p className="text-sm font-semibold">Broker</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {visible.map((a) => (
          <Button
            key={a.label}
            className="rounded-xl"
            onClick={() => {
              void a.run?.().catch(() => undefined);
            }}
          >
            {a.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

export function ProgressPage({ role }: { role: Role }) {
  const router = useRouter();
  const deal = useAppData((s) => s.deal);
  const partyRoles = useAppData((s) => s.partyRoles ?? []);
  const view = getDealView(deal, 3, partyRoles);
  const milestones = role === "buyer" ? view.buyerMilestones : view.sellerMilestones;
  const underContract = deal.state !== "TOURS_OFFERS";
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-sans text-2xl font-medium tracking-tight text-forest">My progress</h1>
      </div>
      <Timeline
        stages={toStages(milestones)}
        onOpenTasks={() => router.push(`/portal/${role}/services`)}
        onOpenDocuments={() => router.push(`/portal/${role}/documents`)}
      />
    </div>
  );
}

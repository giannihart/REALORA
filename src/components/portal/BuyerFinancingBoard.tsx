"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { BuyingPowerCard } from "@/components/portal/BuyingPowerCard";
import { Timeline } from "@/components/portal/Timeline";
import { LenderQuestionnaire } from "@/components/mortgage/LenderQuestionnaire";
import { MortgageCalculator } from "@/components/property/MortgageCalculator";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { getLenderPacketAction } from "@/lib/actions/lender-packet";
import {
  activeBuyerOffer,
  depositStatus,
  financingStagesFor,
  fundsLeadStatus,
  isCashPath,
  nextFinancingMilestone,
  preapprovalLeadStatus,
  sellerBadgeLine,
  sellerRaiseLine,
  verifiedDateLabel,
} from "@/lib/buyer-financing";
import { atLeast } from "@/lib/deal-machine";
import { mocksAllowed } from "@/lib/data/mode";
import { useAppData } from "@/lib/data/use-app-data";
import { formatMoney, cn } from "@/lib/format";
import { roleLabel } from "@/lib/invite-roles";
import type { LenderPacketBuyerStatus } from "@/lib/lender-packet/types";
import type { DocumentItem, Offer } from "@/lib/types";

/** Demo/screenshot previews only — never available in production. */
function previewOffer(base: Offer | undefined, preview: string | null): Offer | undefined {
  if (!base || !mocksAllowed() || !preview) return base;
  if (preview === "financed" || preview === "financed-review") {
    return {
      ...base,
      financing: "Jumbo",
      downPercent: 30,
      verifiedFunds: false,
      verificationTier: "self_reported",
    };
  }
  if (preview === "cash-review") {
    return {
      ...base,
      financing: "Cash",
      downPercent: 100,
      verifiedFunds: false,
      verificationTier: "self_reported",
    };
  }
  return base;
}

function previewDocs(
  docs: DocumentItem[],
  preview: string | null,
): DocumentItem[] {
  if (!mocksAllowed() || !preview) return docs;
  if (preview === "cash-review") {
    return [
      ...docs,
      {
        id: "preview-pof",
        name: "Proof of funds",
        group: "Closing",
        uploadedBy: "You",
        date: "2026-11-03",
        status: "For review",
        body: "",
        role: "buyer",
        visibility: "buyer_side",
      },
    ];
  }
  if (preview === "financed-review") {
    return [
      ...docs,
      {
        id: "preview-pre",
        name: "Pre-approval letter",
        group: "Closing",
        uploadedBy: "You",
        date: "2026-11-03",
        status: "For review",
        body: "",
        role: "buyer",
        visibility: "buyer_side",
      },
    ];
  }
  return docs;
}

export function BuyerFinancingBoard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preview = searchParams.get("preview");
  const deal = useAppData((s) => s.deal);
  const listings = useAppData((s) => s.listings);
  const offers = useAppData((s) => s.offers);
  const documents = useAppData((s) => s.documents);
  const dealRoster = useAppData((s) => s.dealRoster ?? []);
  const user = useAppData((s) => s.user);

  const offer = useMemo(
    () => previewOffer(activeBuyerOffer(offers), preview),
    [offers, preview],
  );
  const docs = useMemo(() => previewDocs(documents, preview), [documents, preview]);
  const cash =
    isCashPath(offer) || (!offer && user.financingPath === "cash");
  const listing = listings.find((l) => l.id === deal.listingId);
  const price = offer?.price ?? listing?.price ?? 0;
  const downPercent = offer?.downPercent ?? 20;

  const stages = useMemo(
    () => financingStagesFor(deal, offer, docs),
    [deal, offer, docs],
  );
  const nextMilestone = useMemo(
    () => nextFinancingMilestone(deal, offer, docs),
    [deal, offer, docs],
  );

  const fundsStatus = fundsLeadStatus(offer, docs);
  const preStatus = preapprovalLeadStatus(offer, docs, user.preapprovalStatus);
  const deposit = depositStatus(deal);
  const verifiedOn = verifiedDateLabel(offer, docs);

  const lender = dealRoster.find((p) => p.role === "lender");
  const [calcOpen, setCalcOpen] = useState(false);
  const [questionnaireOpen, setQuestionnaireOpen] = useState(false);
  const [packetInfo, setPacketInfo] = useState<{
    lenderName: string;
    date: string;
    status: LenderPacketBuyerStatus;
  } | null>(null);
  const offerAccepted =
    offer?.status === "Accepted" || atLeast(deal.state, "ACCEPTED");

  useEffect(() => {
    if (searchParams.get("lenderPacket") === "1") setQuestionnaireOpen(true);
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    void getLenderPacketAction().then((result) => {
      if (cancelled || !result.ok || !result.data.packet || !result.data.buyerStatus) {
        return;
      }
      const p = result.data.packet;
      setPacketInfo({
        lenderName: p.lenderName,
        date: (p.sentAt ?? p.createdAt).slice(0, 10),
        status: result.data.buyerStatus,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [questionnaireOpen]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-sans text-2xl font-medium tracking-tight text-forest">Financing</h1>
      </div>

      {/* 1. Lead card */}
      <section className="rounded-2xl border border-line bg-white p-5 sm:p-6">
        <p className="text-xs font-medium text-muted">
          Your financing for this home
        </p>
        {cash ? (
          <>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-forest">
              You&apos;re buying with cash.
            </h2>
            <dl className="mt-5 space-y-3 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <dt className="text-muted">Funds verification</dt>
                <dd className="font-medium text-forest">
                  {fundsStatus === "Verified" ? (
                    <>
                      Verified ✓
                      {verifiedOn ? (
                        <span className="ml-1.5 font-normal text-muted">{verifiedOn}</span>
                      ) : null}
                    </>
                  ) : (
                    fundsStatus
                  )}
                </dd>
              </div>
              {fundsStatus === "Not verified" ? (
                <div>
                  <Button
                    href="/portal/buyer/documents"
                    variant="lime"
                    className="rounded-xl"
                  >
                    Verify your funds
                  </Button>
                </div>
              ) : null}
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <dt className="text-muted">Deposit (EMD)</dt>
                <dd className="font-medium text-forest">
                  {offer ? formatMoney(offer.emd) : "—"}
                  <span className="ml-1.5 font-normal text-muted">· {deposit}</span>
                </dd>
              </div>
            </dl>
            <p className="mt-5 text-xs leading-5 text-forest/75">
              Your closing funds are confirmed the same way — no wire instructions ever
              arrive by email; they&apos;re confirmed inside the platform.
            </p>
          </>
        ) : (
          <>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-forest">
              You&apos;re financing this purchase.
            </h2>
            <dl className="mt-5 space-y-3 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <dt className="text-muted">Lender</dt>
                <dd className="font-medium text-forest">
                  {lender
                    ? `${lender.name}${lender.role ? ` · ${roleLabel(lender.role)}` : ""}`
                    : "No lender on this deal yet."}
                </dd>
              </div>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <dt className="text-muted">Loan shape</dt>
                <dd className="font-medium text-forest">
                  {offer
                    ? `${formatMoney(offer.price)} · ${offer.downPercent}% down (${formatMoney(Math.round((offer.price * offer.downPercent) / 100))}) · ${offer.financing}`
                    : "—"}
                </dd>
              </div>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <dt className="text-muted">Pre-approval</dt>
                <dd className="font-medium text-forest">
                  {preStatus === "Verified" ? (
                    <>
                      Verified ✓
                      {verifiedOn ? (
                        <span className="ml-1.5 font-normal text-muted">{verifiedOn}</span>
                      ) : null}
                    </>
                  ) : (
                    preStatus
                  )}
                </dd>
              </div>
              {packetInfo ? (
                <p className="text-sm leading-6 text-forest/85">
                  {packetInfo.status === "sent" ? (
                    <>
                      Packet sent to {packetInfo.lenderName} — {packetInfo.date}. When you
                      have your pre-approval letter, upload it here.
                    </>
                  ) : (
                    <>
                      Packet prepared for {packetInfo.lenderName} — {packetInfo.date}.
                      Delivery is not live yet, so nothing was claimed as sent. When you
                      have your pre-approval letter, upload it here.
                    </>
                  )}
                </p>
              ) : null}
              {preStatus === "Not verified" || preStatus === "Under review" ? (
                <div className="flex flex-wrap gap-2">
                  {preStatus !== "Under review" && !packetInfo ? (
                    <Button
                      type="button"
                      variant="lime"
                      className="rounded-xl"
                      onClick={() => setQuestionnaireOpen(true)}
                    >
                      Find a lender
                    </Button>
                  ) : null}
                  <Button
                    href="/portal/buyer/documents"
                    variant={packetInfo || preStatus === "Under review" ? "lime" : "outline"}
                    className="rounded-xl"
                  >
                    Upload pre-approval letter
                  </Button>
                </div>
              ) : null}
              {nextMilestone ? (
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <dt className="text-muted">Next milestone</dt>
                  <dd className="font-medium text-forest">{nextMilestone.title}</dd>
                </div>
              ) : null}
            </dl>
          </>
        )}
      </section>

      {/* 2. Milestones */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-forest">Financing milestones</h2>
        <Timeline stages={stages} readOnly />
      </section>

      {offer ? (
        <section className="rounded-2xl border border-line bg-white p-5 sm:p-6">
          <p className="text-xs font-medium text-muted">
            What sellers see
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone="dark">{sellerBadgeLine(offer)}</Badge>
          </div>
          <p className="mt-2 text-xs leading-5 text-forest/75">{sellerRaiseLine(offer)}</p>
        </section>
      ) : null}

      {/* Buying Power */}
      <BuyingPowerCard />

      {/* Calculator — only once price/terms are known from an accepted offer */}
      {offerAccepted ? (
        <section className="rounded-2xl border border-line bg-white p-5 sm:p-6">
          <h2 className="font-semibold text-forest">Run the numbers</h2>
          {cash ? (
            <>
              <button
                type="button"
                onClick={() => setCalcOpen((o) => !o)}
                className="mt-3 flex w-full items-center justify-between gap-3 text-left text-sm text-forest/80"
              >
                <span>
                  Paying cash for this home — the calculator matters for a financed
                  purchase.
                </span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 text-muted transition",
                    calcOpen && "rotate-180",
                  )}
                />
              </button>
              {calcOpen ? (
                <div className="mt-4">
                  <MortgageCalculator
                    price={price || 1}
                    downPercent={downPercent}
                    annualTaxes={listing?.taxes}
                    variant="deal"
                  />
                </div>
              ) : null}
            </>
          ) : (
            <div className="mt-4">
              <MortgageCalculator
                price={price || 1}
                downPercent={downPercent}
                annualTaxes={listing?.taxes}
                variant="deal"
              />
            </div>
          )}
          <p className="mt-3 text-xs text-muted">
            Prefer the full tool?{" "}
            <Link
              href="/mortgage"
              className="font-medium text-forest underline-offset-2 hover:underline"
            >
              Get a mortgage
            </Link>
          </p>
        </section>
      ) : null}

      <LenderQuestionnaire
        open={questionnaireOpen}
        onClose={() => {
          setQuestionnaireOpen(false);
          if (searchParams.get("lenderPacket") === "1") {
            router.replace("/portal/buyer/financing");
          }
        }}
        onAlreadyPreapproved={() => {
          setQuestionnaireOpen(false);
          router.push("/portal/buyer/documents");
        }}
      />
    </div>
  );
}

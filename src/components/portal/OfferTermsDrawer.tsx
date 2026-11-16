"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DesignatedAgencyCard } from "@/components/portal/DesignatedAgencyCard";
import { formatMoney, cn } from "@/lib/format";
import {
  agentRowLabel,
  contingencyChips,
  effectiveOfferStatus,
  formatCloseLine,
  formatExpiryRelative,
  formatOfferDate,
  isOfferExpired,
  offerNet,
  offerRead,
  verificationBadge,
  verificationDetail,
} from "@/lib/offers";
import { ActionFailure } from "@/lib/actions/errors";
import { isLocalDataMode, isProductionDataMode } from "@/lib/data/mode";
import { useAppData } from "@/lib/data/use-app-data";
import type { Listing, Offer, OfferStatus } from "@/lib/types";
import { toast } from "sonner";

type ConfirmAction = "accept" | "decline" | "counter";

const statusTone: Record<OfferStatus, "good" | "lime" | "warn" | "neutral" | "sold"> = {
  New: "lime",
  Viewed: "neutral",
  Countered: "warn",
  Accepted: "good",
  Declined: "sold",
  Expired: "sold",
};

export default function OfferTermsDrawer({
  offer,
  listing,
  peers,
  onClose,
}: {
  offer: Offer;
  listing: Listing | undefined;
  peers: Offer[];
  onClose: () => void;
}) {
  const acceptOffer = useAppData((s) => s.acceptOffer);
  const counterOffer = useAppData((s) => s.counterOffer);
  const declineOffer = useAppData((s) => s.declineOffer);
  const requestOfferExtension = useAppData((s) => s.requestOfferExtension);
  const designatedAgency = useAppData((s) => s.designatedAgency ?? null);
  const dealId = useAppData((s) => s.dealId);

  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);
  const [counterPrice, setCounterPrice] = useState(String(offer.price));
  const [declineNote, setDeclineNote] = useState("");
  const [agencyGate, setAgencyGate] = useState(false);

  const math = offerNet(offer, listing);
  const expired = isOfferExpired(offer);
  const status = effectiveOfferStatus(offer);
  const actionable =
    !expired &&
    status !== "Accepted" &&
    status !== "Declined" &&
    status !== "Expired";

  const showAgencyInConfirm =
    Boolean(dealId && designatedAgency) &&
    (agencyGate ||
      (isProductionDataMode() &&
        designatedAgency?.required === true &&
        designatedAgency.needsMyAck));

  async function runAccept() {
    try {
      await Promise.resolve(acceptOffer(offer.id));
      toast("Offer accepted.");
      setConfirm(null);
      onClose();
    } catch (err) {
      if (err instanceof ActionFailure && err.code === "designated_agency_required") {
        setAgencyGate(true);
        toast(err.message);
        return;
      }
      toast(err instanceof Error ? err.message : "Could not accept offer.");
    }
  }

  return (
    <>
      <Dialog.Root open onOpenChange={(next) => (!next ? onClose() : undefined)}>
        <Dialog.Portal>
          <Dialog.Overlay className="anim-overlay fixed inset-0 z-[60] bg-forest/40" />
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6">
          <Dialog.Content className="anim-rise shadow-raised flex max-h-[min(920px,calc(100vh-1.5rem))] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-line bg-cream outline-none">
            <div className="shrink-0 border-b border-line bg-white px-5 py-5 sm:px-6">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Badge tone={statusTone[status]}>{status}</Badge>
                  <Dialog.Title className="mt-3 text-xl font-semibold tracking-tight text-forest">
                    {offer.buyerLabel}
                  </Dialog.Title>
                  <p className="mt-1 text-2xl font-semibold tracking-tight text-forest">
                    {formatMoney(offer.price)}
                  </p>
                  <p className="mt-1 text-sm leading-5">
                    <span className="text-muted">You net ≈ </span>
                    <span className="font-semibold text-forest">{formatMoney(math.net)}</span>
                  </p>
                  <p className="mt-2 text-xs font-medium text-forest/70">
                    {verificationBadge(offer)} · {offer.financing}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full px-2 text-muted hover:bg-warm"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 text-sm sm:px-6">
              <details className="group overflow-hidden rounded-2xl border border-line bg-white">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 bg-warm/40 px-3.5 py-3 text-sm font-semibold text-forest [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0 flex-1">View Realora&apos;s Breakdown</span>
                  <ChevronDown
                    className="h-4 w-4 shrink-0 text-muted transition group-open:rotate-180"
                    aria-hidden
                  />
                </summary>
                <div className="border-t border-line bg-white px-3.5 py-3">
                  <p className="leading-6 text-forest/80">
                    {offerRead(offer, peers, listing)}
                  </p>
                </div>
              </details>

              <dl className="mt-5 grid grid-cols-2 gap-x-3 gap-y-3 rounded-2xl border border-line bg-white p-4 sm:p-5">
                <Item label="Financing" value={offer.financing} />
                <Item
                  label="Down payment"
                  value={`${offer.downPercent}% · ${formatMoney(Math.round((offer.price * offer.downPercent) / 100))}`}
                />
                <Item label="Deposit (EMD)" value={formatMoney(offer.emd)} />
                <Item label="Proposed close" value={formatCloseLine(offer.closeDate)} />
                <Item
                  label="Expires"
                  value={`${formatOfferDate(offer.expires)} · ${formatExpiryRelative(offer.expires)}`}
                />
                <Item label="Buyer's agent" value={agentRowLabel(offer, listing)} />
                <Item label="Contingencies" value={contingencyChips(offer).join(" · ")} />
                <Item
                  label="Concessions"
                  value={offer.concessions ? formatMoney(offer.concessions) : "None"}
                />
              </dl>

              <div className="mt-4 rounded-2xl border border-line bg-white p-4 sm:p-5">
                <p className="text-xs font-medium text-muted">
                  Buyer verification
                </p>
                <p className="mt-2 font-semibold text-forest">{verificationBadge(offer)}</p>
                <p className="mt-1 text-xs leading-5 text-forest/70">
                  {verificationDetail(offer)}
                </p>
              </div>

              <div className="mt-4 rounded-2xl border border-line bg-white p-4 sm:p-5">
                <p className="text-xs font-medium text-muted">
                  Estimated net proceeds
                </p>
                <dl className="mt-3 space-y-2.5 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Purchase price</dt>
                    <dd className="font-medium text-forest">{formatMoney(math.price)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Realora fee (1%)</dt>
                    <dd className="font-medium text-forest">−{formatMoney(math.realoraFee)}</dd>
                  </div>
                  {math.buyerAgentFee > 0 ? (
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted">Buyer&apos;s agent fee (1%)</dt>
                      <dd className="font-medium text-forest">−{formatMoney(math.buyerAgentFee)}</dd>
                    </div>
                  ) : null}
                  {math.concessions > 0 ? (
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted">Concessions</dt>
                      <dd className="font-medium text-forest">−{formatMoney(math.concessions)}</dd>
                    </div>
                  ) : null}
                  <div className="flex justify-between gap-3 border-t border-line pt-3">
                    <dt className="text-base font-semibold tracking-tight text-forest">
                      Estimated net proceeds
                    </dt>
                    <dd className="text-base font-semibold tracking-tight text-forest">
                      {formatMoney(math.net)}
                    </dd>
                  </div>
                </dl>
                <p className="mt-2 text-[11px] leading-4 text-muted">
                  Estimate before closing costs, taxes, and any negotiated credits.
                </p>
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap gap-2 border-t border-line bg-warm/40 px-5 py-4 sm:px-6">
              {expired ? (
                <Button
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => {
                    void Promise.resolve(requestOfferExtension(offer.id))
                      .then(() =>
                        toast(
                          isLocalDataMode()
                            ? "Extension requested — your AE will chase the buyer."
                            : "Extension task sent to your AE.",
                        ),
                      )
                      .catch((err: unknown) =>
                        toast(err instanceof Error ? err.message : "Could not request extension."),
                      );
                  }}
                >
                  Ask for an extension
                </Button>
              ) : actionable ? (
                <>
                  <Button
                    variant="lime"
                    className="rounded-xl"
                    onClick={() => setConfirm("accept")}
                  >
                    Accept
                  </Button>
                  <Button
                    variant="outline"
                    className="rounded-xl"
                    onClick={() => setConfirm("counter")}
                  >
                    Counter
                  </Button>
                  <Button
                    variant="ghost"
                    className="rounded-xl"
                    onClick={() => setConfirm("decline")}
                  >
                    Decline
                  </Button>
                </>
              ) : (
                <p className="text-xs text-muted">This offer is no longer actionable.</p>
              )}
              <Button variant="ghost" className="rounded-xl" onClick={onClose}>
                Close
              </Button>
            </div>
          </Dialog.Content>
          </div>
        </Dialog.Portal>

        {/* Nested confirm dialog — must live inside Dialog.Root so scroll-lock allows clicks */}
        <Dialog.Root
          open={!!confirm}
          onOpenChange={(next) => {
            if (!next) setConfirm(null);
          }}
        >
          <Dialog.Portal>
            <Dialog.Overlay className="anim-overlay fixed inset-0 z-[80] bg-forest/40" />
            <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-6">
              <Dialog.Content className="anim-rise relative flex max-h-[min(920px,calc(100vh-1.5rem))] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-line bg-white p-5 shadow-2xl outline-none sm:p-6">
                <div className="mb-4 flex shrink-0 items-start justify-between gap-4">
                  <Dialog.Title className="text-lg font-semibold text-forest">
                    {confirm === "accept"
                      ? "Confirm acceptance"
                      : confirm === "counter"
                        ? "Confirm counteroffer"
                        : "Confirm decline"}
                  </Dialog.Title>
                  <Dialog.Close className="rounded-full px-2 text-muted hover:bg-warm" aria-label="Close">
                    ✕
                  </Dialog.Close>
                </div>

                {confirm === "accept" ? (
                  <div className="space-y-4 text-sm">
                    <div className="rounded-2xl border border-line bg-white p-4">
                      <p className="text-xs font-medium text-muted">
                        Offer summary
                      </p>
                      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5">
                        <Item label="Buyer" value={offer.buyerLabel} />
                        <Item label="Price" value={formatMoney(offer.price)} />
                        <Item label="Estimated net" value={formatMoney(math.net)} />
                        <Item label="Close" value={formatCloseLine(offer.closeDate)} />
                        <Item
                          label="Contingencies"
                          value={contingencyChips(offer).join(" · ")}
                          className="col-span-2"
                        />
                      </dl>
                    </div>
                    <p className="leading-6 text-forest/80">
                      Accepting moves this deal into contract, declines the other live offers, and
                      engages attorneys through the platform. Confirm only if these are the terms
                      you intend to proceed on.
                    </p>
                    {showAgencyInConfirm && dealId && designatedAgency ? (
                      <DesignatedAgencyCard dealId={dealId} agency={designatedAgency} />
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="lime"
                        className="rounded-xl"
                        onClick={() => {
                          void runAccept();
                        }}
                      >
                        Confirm acceptance
                      </Button>
                      <Button
                        variant="ghost"
                        className="rounded-xl"
                        onClick={() => setConfirm(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : null}

                {confirm === "counter" ? (
                  <div className="space-y-4 text-sm">
                    <p className="leading-6 text-forest/80">
                      Prepare a counter on price for {offer.buyerLabel}. The current offer is marked
                      Countered and the new terms are sent through the existing counter flow.
                    </p>
                    <label className="block text-xs font-medium text-muted">
                      Counter price
                      <input
                        value={counterPrice}
                        onChange={(e) => setCounterPrice(e.target.value)}
                        className="mt-1.5 h-11 w-full rounded-xl border border-line bg-white px-3 text-sm text-forest"
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="lime"
                        className="rounded-xl"
                        onClick={() => {
                          const price = Number(counterPrice.replace(/[^0-9]/g, ""));
                          if (!(price > 0)) {
                            toast("Enter a counter price.");
                            return;
                          }
                          void Promise.resolve(counterOffer(offer.id, { price }))
                            .then(() => {
                              toast("Counter sent.");
                              setConfirm(null);
                              onClose();
                            })
                            .catch((err: unknown) =>
                              toast(err instanceof Error ? err.message : "Could not counter."),
                            );
                        }}
                      >
                        Confirm counter
                      </Button>
                      <Button
                        variant="ghost"
                        className="rounded-xl"
                        onClick={() => setConfirm(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : null}

                {confirm === "decline" ? (
                  <div className="space-y-4 text-sm">
                    <p className="leading-6 text-forest/80">
                      Decline {offer.buyerLabel}&apos;s offer. No reason is required. You may leave
                      an optional note for the buyer.
                    </p>
                    <label className="block text-xs font-medium text-muted">
                      Optional note to buyer
                      <textarea
                        value={declineNote}
                        onChange={(e) => setDeclineNote(e.target.value)}
                        rows={3}
                        className="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-forest"
                        placeholder="Optional"
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        className="rounded-xl"
                        onClick={() => {
                          void Promise.resolve(
                            declineOffer(offer.id, declineNote.trim() || undefined),
                          )
                            .then(() => {
                              toast("Offer declined.");
                              setConfirm(null);
                              onClose();
                            })
                            .catch((err: unknown) =>
                              toast(err instanceof Error ? err.message : "Could not decline."),
                            );
                        }}
                      >
                        Confirm decline
                      </Button>
                      <Button
                        variant="ghost"
                        className="rounded-xl"
                        onClick={() => setConfirm(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : null}
              </Dialog.Content>
            </div>
          </Dialog.Portal>
        </Dialog.Root>
      </Dialog.Root>
    </>
  );
}

function Item({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-xs font-medium text-muted">
        {label}
      </dt>
      <dd className="mt-0.5 font-semibold leading-5 text-forest">{value}</dd>
    </div>
  );
}

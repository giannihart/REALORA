"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { PropertyCard } from "@/components/marketplace/PropertyCard";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { startVerificationAction } from "@/lib/actions/verification";
import { queryLiveListingsAction } from "@/lib/actions/listing";
import {
  buildReadinessSteps,
  declinedOfferNotice,
  prospectiveBadge,
  prospectiveRaiseLine,
  fundsVerified,
  type ReadinessStep,
  type ReadinessStepId,
} from "@/lib/buyer-readiness";
import { listingMonthlyPayment } from "@/lib/buying-power";
import {
  resolveBuyingCapacity,
  withinBuyingCapacity,
} from "@/lib/buying-capacity";
import { useAppData } from "@/lib/data/use-app-data";
import { isSupabaseDataMode } from "@/lib/data/mode";
import type { FinancingPath, Listing } from "@/lib/types";

function stepWhy(step: ReadinessStep, path: FinancingPath | null): string {
  switch (step.id) {
    case "buying-power":
      return "See what you can afford before you shop — then homes in range are marked for you.";
    case "identity":
      return (
        step.subline ??
        "Sellers see verified buyers first — this is part of your offer, not paperwork."
      );
    case "financing":
      if (!path) {
        return "Upload proof of funds or a pre-approval letter for AE review.";
      }
      return path === "cash"
        ? "Upload proof of funds. Once confirmed, sellers see Cash — funds verified."
        : "Upload a pre-approval letter. Once confirmed, sellers see Pre-approved — documents verified.";
    default:
      return "";
  }
}

function stepAfterComplete(
  step: ReadinessStep,
  remaining: ReadinessStep[],
): string {
  const next = remaining.find((s) => s.id !== step.id && s.state !== "complete");
  if (next) return `Next up: ${next.title}.`;
  return "After this, you’re offer-ready — browse and hit Buy when you find the home.";
}

export function BuyerPreOfferHome() {
  const router = useRouter();
  const listings = useAppData((s) => s.listings);
  const offers = useAppData((s) => s.offers);
  const documents = useAppData((s) => s.documents);
  const savedListingIds = useAppData((s) => s.savedListingIds);
  const buyingPower = useAppData((s) => s.buyingPower);
  const user = useAppData((s) => s.user);
  const capacity = useMemo(
    () => resolveBuyingCapacity({ user, buyingPower }),
    [user, buyingPower],
  );
  const toggleSaved = useAppData((s) => s.toggleSaved);
  const applySnapshot = useAppData((s) => s.applySnapshot);
  const [liveRows, setLiveRows] = useState<Listing[] | null>(null);
  const [verifyBusy, setVerifyBusy] = useState(false);

  useEffect(() => {
    if (!isSupabaseDataMode()) return;
    void queryLiveListingsAction({ status: "live", newest: true, limit: 12 }).then(
      (result) => {
        if (result.ok) setLiveRows(result.data.filter((row) => row.marketplace));
      },
    );
  }, []);

  const readiness = useMemo(
    () =>
      buildReadinessSteps({
        buyingPower,
        user,
        documents,
        offers,
      }),
    [buyingPower, user, documents, offers],
  );

  const notice = useMemo(
    () => declinedOfferNotice(offers, listings),
    [offers, listings],
  );

  const verified = fundsVerified(user, offers);
  const badge = prospectiveBadge(readiness.financingPath, verified);
  const raise = prospectiveRaiseLine(readiness.financingPath, verified);

  const savedHomes = useMemo(
    () =>
      savedListingIds
        .map(
          (id) =>
            listings.find((l) => l.id === id) ?? liveRows?.find((l) => l.id === id),
        )
        .filter((l): l is Listing => Boolean(l)),
    [savedListingIds, listings, liveRows],
  );

  function onToggleSave(listingId: string) {
    toggleSaved(listingId);
  }

  const primary = readiness.nextId
    ? readiness.steps.find((s) => s.id === readiness.nextId) ?? null
    : null;
  const completed = readiness.steps.filter((s) => s.state === "complete");
  const comingUp = readiness.steps.filter(
    (s) => s.state !== "complete" && s.id !== primary?.id,
  );
  const progressPct = Math.round((readiness.readyCount / 3) * 100);

  async function runPrimary(stepId: ReadinessStepId) {
    if (stepId === "buying-power") {
      router.push("/portal/buyer/financing#buying-power");
      return;
    }
    if (stepId === "identity") {
      setVerifyBusy(true);
      const started = await startVerificationAction("id");
      setVerifyBusy(false);
      if (!started.ok) {
        toast(started.message);
        return;
      }
      applySnapshot(started.data.snapshot);
      if (started.data.hostedUrl) {
        window.location.href = started.data.hostedUrl;
        return;
      }
      toast("Identity verified.");
      return;
    }
    if (stepId === "financing") {
      router.push("/portal/buyer/documents");
    }
  }

  return (
    <div className="space-y-5">
      {notice ? (
        <div className="rounded-2xl border border-line bg-white px-5 py-4 text-sm leading-6 text-forest">
          Your offer on {notice.homeLabel} didn&apos;t land — everything you verified
          carries over.
        </div>
      ) : null}

      {/* Summary — mirrors deal Home transaction header */}
      <header className="overflow-hidden rounded-2xl border border-line bg-white">
        <div className="flex items-center gap-3 p-3 sm:gap-4 sm:p-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold tracking-tight text-forest sm:text-xl">
              Get offer-ready
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <Badge tone="dark">{badge}</Badge>
              {raise ? (
                <span className="text-xs text-muted line-clamp-1">{raise}</span>
              ) : (
                <span className="text-xs text-muted">
                  Steps that make Buy now land with strength sellers can trust
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-line bg-white px-4 py-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-xs font-medium text-muted">
              Progress
            </p>
            <p className="text-xs text-muted">{readiness.readyCount}/3</p>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-warm">
            <div
              className="h-full rounded-full bg-forest"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </header>

      {/* Your next step — same green container as deal Home */}
      <section className="rounded-2xl border border-forest bg-forest px-5 py-5 text-cream sm:px-6">
        <p className="text-xs font-medium text-lime">
          Your next step
        </p>
        {primary ? (
          <>
            <h2 className="mt-2 font-sans text-2xl font-semibold tracking-tight sm:text-3xl">
              {primary.title}
              {primary.optional ? (
                <span className="ml-2 text-sm font-normal text-cream/55">Optional</span>
              ) : null}
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-cream/85">
              {stepWhy(primary, readiness.financingPath)}
            </p>
            {primary.detail && primary.state === "in_progress" ? (
              <p className="mt-2 text-xs text-lime">{primary.detail}</p>
            ) : null}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button
                variant="lime"
                className="rounded-full px-5"
                disabled={verifyBusy && primary.id === "identity"}
                onClick={() => void runPrimary(primary.id)}
              >
                {primary.actionLabel}
              </Button>
            </div>
            <p className="mt-3 text-xs leading-5 text-cream/55">
              {stepAfterComplete(primary, readiness.steps)}
            </p>
          </>
        ) : (
          <>
            <h2 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">
              You&apos;re offer-ready
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-cream/85">
              When you find the home, your offer lands verified. Sellers will see:{" "}
              {badge}.
            </p>
            <Button
              variant="lime"
              className="mt-4 rounded-full px-5"
              href="/buy"
            >
              Browse homes
            </Button>
            <p className="mt-3 text-xs leading-5 text-cream/55">
              Hit Buy now on any listing — your strength carries over.
            </p>
          </>
        )}
      </section>

      {/* Coming up — remaining process steps */}
      {comingUp.length ? (
        <section>
          <h2 className="text-sm font-semibold text-forest">Coming up</h2>
          <p className="mt-1 text-xs text-muted">
            The rest of getting ready to hit Buy now.
          </p>
          <ol className="mt-3 space-y-1.5">
            {comingUp.map((step, i) => (
              <li
                key={step.id}
                className="flex items-center gap-3 rounded-xl border border-line bg-white px-3.5 py-2.5"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-warm text-xs font-medium text-forest">
                  {(primary ? 1 : 0) + i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-forest">
                    {step.title}
                    {step.optional ? (
                      <span className="ml-1.5 text-xs font-normal text-muted">
                        Optional
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-xs leading-5 text-muted line-clamp-2">
                    {step.state === "in_progress" && step.detail
                      ? step.detail
                      : stepWhy(step, readiness.financingPath)}
                  </p>
                </div>
                {step.state === "in_progress" ? (
                  <Badge tone="warn">In progress</Badge>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {/* Completed */}
      <section>
        <h2 className="text-sm font-semibold text-forest">Completed</h2>
        <p className="mt-1 text-xs text-muted">
          {completed.length} step{completed.length === 1 ? "" : "s"} done
        </p>
        <ul className="mt-3 space-y-1.5">
          {completed.map((step) => (
            <li
              key={step.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-line bg-white px-3.5 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-forest">{step.title}</p>
                {step.detail ? (
                  <p className="mt-0.5 text-xs text-muted">{step.detail}</p>
                ) : null}
              </div>
              <Badge tone="neutral">
                <Check size={12} strokeWidth={2.5} />
                Done
              </Badge>
            </li>
          ))}
        </ul>
      </section>

      {/* Saved homes — heart is always filled; unchecking removes the card */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-forest">Saved homes</h2>
            <p className="mt-1 text-xs text-muted">
              {savedHomes.length
                ? "Homes you’ve saved while getting offer-ready."
                : "Browse and save — then hit Buy now when you’re ready."}
            </p>
          </div>
          <Button href="/buy" variant="lime">
            Browse homes
          </Button>
        </div>
        {savedHomes.length ? (
          <div className="grid max-w-[40rem] gap-3 sm:grid-cols-2">
            {savedHomes.map((home) => (
              <PropertyCard
                key={home.id}
                listing={home}
                saved
                onSave={onToggleSave}
                monthlyEstimate={listingMonthlyPayment(
                  home.price,
                  buyingPower,
                  home.taxes,
                )}
                withinBuyingPower={withinBuyingCapacity(home.price, capacity)}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-line bg-white px-5 py-10 text-center">
            <p className="text-sm text-muted">No saved homes yet.</p>
          </div>
        )}
      </section>
    </div>
  );
}

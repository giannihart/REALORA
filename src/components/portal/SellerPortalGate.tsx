"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAppData } from "@/lib/data/use-app-data";
import {
  clearIntakeJustSigned,
  readIntakeJustSigned,
} from "@/lib/sell/intake-handoff";

function isSellerPartyRole(role: string) {
  return role === "seller" || role.endsWith("_seller") || role.includes("seller");
}

function isListingAgreementSigned(
  documents: { name: string; status: string }[],
): boolean {
  return documents.some((d) => {
    if (!/listing agreement/i.test(d.name)) return false;
    const status = (d.status ?? "").toLowerCase();
    return (
      status === "completed" ||
      status === "signed" ||
      status === "fully executed" ||
      status === "fully_executed"
    );
  });
}

/**
 * Sellers without a listing start on /sell.
 * Intake-created listings require a Signed listing agreement before the portal —
 * unsigned intake is returned to the agreement step, not admitted with a to-do.
 * AE-created listings (not fromOnboarding) may still enter unsigned.
 */
export function SellerPortalGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const hydrated = useAppData((s) => s.hydrated);
  const signedIn = useAppData((s) => s.user.signedIn);
  const role = useAppData((s) => s.user.role);
  const deal = useAppData((s) => s.deal);
  const listings = useAppData((s) => s.listings);
  const documents = useAppData((s) => s.documents ?? []);
  const myDeals = useAppData((s) => s.myDeals ?? []);
  const partyRoles = useAppData((s) => s.partyRoles ?? []);

  const listing = useMemo(
    () => listings.find((l) => l.id === deal.listingId) ?? null,
    [listings, deal.listingId],
  );

  const hasSellerListing = useMemo(() => {
    const sellerParty =
      partyRoles.some(isSellerPartyRole) || myDeals.some((d) => isSellerPartyRole(d.role));
    if (sellerParty && listing) return true;
    if (role === "seller" && listing) return true;
    return false;
  }, [listing, partyRoles, myDeals, role]);

  const agreementSigned = useMemo(
    () => isListingAgreementSigned(documents),
    [documents],
  );

  const justSignedListingId = readIntakeJustSigned();
  const signedViaIntakeHandoff = Boolean(
    listing && justSignedListingId && justSignedListingId === listing.id,
  );

  const unsignedIntake = Boolean(
    hasSellerListing &&
      listing?.fromOnboarding &&
      !agreementSigned &&
      !signedViaIntakeHandoff,
  );

  const shouldEnterSellFlow = useMemo(() => {
    if (!hydrated) return false;
    if (!signedIn) return true;
    if (
      role === "buyer" &&
      !partyRoles.some(isSellerPartyRole) &&
      !myDeals.some((d) => isSellerPartyRole(d.role))
    ) {
      return true;
    }
    return !hasSellerListing;
  }, [hydrated, signedIn, role, partyRoles, myDeals, hasSellerListing]);

  useEffect(() => {
    if (!hydrated) return;
    if (unsignedIntake) {
      router.replace("/sell?resume=1");
      return;
    }
    if (shouldEnterSellFlow) {
      router.replace("/sell");
      return;
    }
    if (signedViaIntakeHandoff && agreementSigned) {
      clearIntakeJustSigned();
    }
  }, [
    hydrated,
    unsignedIntake,
    shouldEnterSellFlow,
    signedViaIntakeHandoff,
    agreementSigned,
    router,
  ]);

  if (!hydrated || shouldEnterSellFlow || unsignedIntake) {
    return <div className="px-4 py-16 text-sm text-muted" />;
  }

  return children;
}

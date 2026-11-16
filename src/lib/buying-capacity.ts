/**
 * Single platform number for financed buyers:
 * AE-confirmed approved amount when present, else Buying Power estimate.
 * Cash path does not use this for funds verification — only for the gauge
 * surfaces listed in the lender-packet plan.
 */

import {
  computeBuyingPower,
  type BuyingPowerProfile,
} from "@/lib/buying-power";
import { formatPrice } from "@/lib/format";
import type { UserSession } from "@/lib/types";

export type BuyingCapacitySource = "preapproval" | "estimate";

export interface BuyingCapacity {
  amount: number;
  source: BuyingCapacitySource;
  /** Full label for Financing / Home cards. */
  label: string;
  /** Short label for marketplace badges. */
  shortLabel: string;
  lenderName: string | null;
}

export function resolveBuyingCapacity(input: {
  user: Pick<
    UserSession,
    | "preapprovalStatus"
    | "approvedAmount"
    | "preapprovalLenderName"
  >;
  buyingPower: BuyingPowerProfile | null | undefined;
}): BuyingCapacity | null {
  const approved = input.user.approvedAmount;
  const preVerified = input.user.preapprovalStatus === "verified";
  if (preVerified && approved != null && approved > 0) {
    const lender = input.user.preapprovalLenderName?.trim() || null;
    const money = formatPrice(approved);
    return {
      amount: approved,
      source: "preapproval",
      label: lender
        ? `Pre-approved up to ${money} — ${lender}`
        : `Pre-approved up to ${money}`,
      shortLabel: `Pre-approved up to ${money}`,
      lenderName: lender,
    };
  }

  if (!input.buyingPower) return null;
  const { maxHomePrice } = computeBuyingPower(input.buyingPower);
  const money = formatPrice(maxHomePrice);
  return {
    amount: maxHomePrice,
    source: "estimate",
    label: `Estimated buying power — our gauge, not a lender's number.`,
    shortLabel: `Est. buying power ${money}`,
    lenderName: null,
  };
}

export function withinBuyingCapacity(
  listingPrice: number,
  capacity: BuyingCapacity | null,
): boolean {
  if (!capacity) return false;
  return listingPrice <= capacity.amount;
}

import "server-only";
import { DealActionError } from "@/lib/actions/errors";
import { isStaff, type Actor } from "@/lib/actions/actor";
import type { Tables } from "@/lib/database.types";

export type DocumentVisibility = "shared" | "seller_side" | "buyer_side";

const SUPERVISORS: Tables<"deal_parties">["role"][] = ["broker_of_record", "agent_seller"];

export function isSupervisor(actor: Actor, parties: Tables<"deal_parties">[]): boolean {
  if (isStaff(actor)) return true;
  return parties.some((p) => p.user_id === actor.userId && SUPERVISORS.includes(p.role));
}

export function partySide(
  parties: Tables<"deal_parties">[],
  userId: string,
): "seller" | "buyer" | "neutral" | null {
  const mine = parties.filter((p) => p.user_id === userId);
  if (mine.some((p) => p.side === "seller")) return "seller";
  if (mine.some((p) => p.side === "buyer")) return "buyer";
  if (mine.some((p) => p.side === "neutral")) return "neutral";
  return null;
}

export function canAccessDocument(
  actor: Actor,
  parties: Tables<"deal_parties">[],
  visibility: DocumentVisibility,
): boolean {
  if (isSupervisor(actor, parties)) return true;
  const side = partySide(parties, actor.userId);
  if (!side) return false;
  if (visibility === "shared") return true;
  if (visibility === "seller_side") return side === "seller";
  if (visibility === "buyer_side") return side === "buyer";
  return false;
}

export function assertDocumentAccess(
  actor: Actor,
  parties: Tables<"deal_parties">[],
  visibility: DocumentVisibility,
): void {
  if (!canAccessDocument(actor, parties, visibility)) {
    throw new DealActionError("forbidden", "You cannot access this document.");
  }
}

export function defaultVisibilityFor(side: "seller" | "buyer" | "neutral" | null): DocumentVisibility {
  return "shared";
}

export function allowedUploadVisibilities(
  actor: Actor,
  parties: Tables<"deal_parties">[],
): DocumentVisibility[] {
  if (isSupervisor(actor, parties)) return ["shared", "seller_side", "buyer_side"];
  const side = partySide(parties, actor.userId);
  if (side === "seller") return ["shared", "seller_side"];
  if (side === "buyer") return ["shared", "buyer_side"];
  if (side) return ["shared"];
  return [];
}

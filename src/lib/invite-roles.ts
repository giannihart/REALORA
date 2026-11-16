export const INVITE_ROLES = [
  "attorney_seller",
  "attorney_buyer",
  "lender",
  "title",
  "inspector",
  "vendor",
] as const;

export type InviteRole = (typeof INVITE_ROLES)[number];

/** All deal_parties.role values that may appear in UI. */
export type PartyRoleLabelKey =
  | InviteRole
  | "seller"
  | "co_seller"
  | "buyer"
  | "co_buyer"
  | "broker_of_record"
  | "agent_seller"
  | "agent_buyer";

const ROLE_LABELS: Record<PartyRoleLabelKey, string> = {
  attorney_buyer: "Buyer's attorney",
  attorney_seller: "Seller's attorney",
  lender: "Lender",
  title: "Title company",
  inspector: "Inspector",
  vendor: "Vendor",
  seller: "Seller",
  co_seller: "Co-seller",
  buyer: "Buyer",
  co_buyer: "Co-buyer",
  broker_of_record: "Broker of record",
  agent_seller: "Seller's agent",
  agent_buyer: "Buyer's agent",
};

export function roleLabel(role: string): string {
  return ROLE_LABELS[role as PartyRoleLabelKey] ?? role;
}

export function sideLabel(side: string): string {
  if (side === "seller") return "Seller side";
  if (side === "buyer") return "Buyer side";
  if (side === "neutral") return "Deal";
  return side;
}

export function sideForInviteRole(role: InviteRole): "seller" | "buyer" | "neutral" {
  if (role === "attorney_seller" || role === "title") return "seller";
  if (role === "vendor") return "neutral";
  return "buyer";
}

export const INVITE_ROLE_GROUPS: {
  label: string;
  roles: InviteRole[];
}[] = [
  { label: "For the buyer", roles: ["attorney_buyer"] },
  { label: "For the seller", roles: ["attorney_seller"] },
  { label: "For the deal", roles: ["lender", "title", "inspector", "vendor"] },
];

export function inviteRoleOptions() {
  return INVITE_ROLE_GROUPS.flatMap((group) =>
    group.roles.map((role) => ({
      value: role,
      label: roleLabel(role),
      group: group.label,
    })),
  );
}

export function defaultInviteRoleForPortal(portalRole: "buyer" | "seller"): InviteRole {
  return portalRole === "seller" ? "attorney_seller" : "attorney_buyer";
}

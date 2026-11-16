import type { Actor } from "@/lib/actions/actor";
import { notify } from "@/lib/services/notifications";
import { siteUrl } from "@/lib/site";
import type { TemplateKey } from "@/lib/templates/notifications";
import type { Tables } from "@/lib/database.types";

type Admin = Actor["admin"];

const STATE_COPY: Record<string, { headline: string; what: string; next: string }> = {
  "deal.intake": {
    headline: "File opened",
    what: "The listing file is open.",
    next: "Prep photos and the listing agreement next.",
  },
  "deal.prep": {
    headline: "Listing in prep",
    what: "The listing moved into prep.",
    next: "Finish media and publish when ready.",
  },
  "deal.live": {
    headline: "Listing is live",
    what: "The listing is live.",
    next: "Offers will land in the portal.",
  },
  "deal.tours_offers": {
    headline: "Live — offers",
    what: "The listing is live and taking offers.",
    next: "Review new activity on Home.",
  },
  "offer.accepted": {
    headline: "Offer accepted",
    what: "An offer was accepted.",
    next: "Attorneys circulate the contract.",
  },
  "contract.executed": {
    headline: "Contract executed",
    what: "The contract of sale is executed.",
    next: "Confirm the earnest-money deposit.",
  },
  "deposit.confirmed": {
    headline: "Deposit confirmed",
    what: "Earnest money is confirmed (held by the seller's attorney, not the platform).",
    next: "Diligence tasks are open.",
  },
  "diligence.begun": {
    headline: "Diligence started",
    what: "Inspection, title, and appraisal work is underway.",
    next: "Complete your assigned items.",
  },
  "deal.clear_to_close": {
    headline: "Clear to close",
    what: "The file is clear to close.",
    next: "Closing logistics are next.",
  },
  "deal.closed": {
    headline: "Closed",
    what: "The deal is marked closed.",
    next: "Fee paperwork is in Documents. It is invoiced, not charged on card.",
  },
  "deal.fell_through": {
    headline: "Fell through",
    what: "This deal fell through.",
    next: "No further action on this file.",
  },
};

async function dealContext(admin: Admin, dealId: string) {
  const { data: deal } = await admin.from("deals").select("*").eq("id", dealId).maybeSingle();
  let address = "the property";
  if (deal) {
    const { data: listing } = await admin
      .from("listings")
      .select("*")
      .eq("id", deal.listing_id)
      .maybeSingle();
    if (listing) {
      const { data: property } = await admin
        .from("properties")
        .select("*")
        .eq("id", listing.property_id)
        .maybeSingle();
      address = property?.address_line ?? address;
    }
  }
  const { data: parties } = await admin.from("deal_parties").select("*").eq("deal_id", dealId);
  return { deal, address, parties: parties ?? [] };
}

function uniqueUserIds(ids: (string | null | undefined)[]): string[] {
  return [...new Set(ids.filter((id): id is string => Boolean(id)))];
}

function staffAndAe(parties: Tables<"deal_parties">[]): string[] {
  return uniqueUserIds(
    parties.filter((p) => p.role === "broker_of_record" || p.role === "agent_seller").map((p) => p.user_id),
  );
}

function sideUsers(parties: Tables<"deal_parties">[], side: "seller" | "buyer"): string[] {
  return uniqueUserIds(parties.filter((p) => p.side === side).map((p) => p.user_id));
}

async function sendMany(
  userIds: string[],
  key: TemplateKey,
  payload: Record<string, unknown>,
  dealId: string,
  skip?: string | null,
) {
  for (const id of userIds) {
    if (skip && id === skip) continue;
    await notify(id, key, payload, { dealId });
  }
}

function portalLink(dealId: string, roleHint: string): string {
  const path = roleHint === "seller" ? "/portal/seller" : "/portal/buyer";
  return `${siteUrl()}${path}?deal=${dealId}`;
}

function dollars(cents: unknown): string {
  const n = typeof cents === "number" ? cents : Number(cents ?? 0);
  if (!Number.isFinite(n)) return "an amount";
  return `$${(n / 100).toLocaleString("en-US")}`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function dispatchFromEvent(
  admin: Admin,
  dealId: string,
  actorId: string | null,
  type: string,
  payload: Record<string, unknown>,
): Promise<void> {
  // Embedded signing + recovery paths set notify:false; emails are sent explicitly when required.
  if (payload.notify === false) return;

  const ctx = await dealContext(admin, dealId);
  const link = portalLink(dealId, "buyer");
  const sellerLink = portalLink(dealId, "seller");
  const base = { address: ctx.address, date: today(), siteUrl: siteUrl(), dealId };

  if (type === "offer.submitted") {
    await sendMany(
      uniqueUserIds([...sideUsers(ctx.parties, "seller"), ...staffAndAe(ctx.parties)]),
      "offer.submitted",
      { ...base, price: dollars(payload.price_cents), link: sellerLink },
      dealId,
      actorId,
    );
    return;
  }

  if (type === "offer.accepted" || type === "offer.declined" || type === "offer.countered") {
    const { data: offer } = payload.offer_id
      ? await admin.from("offers").select("buyer_id").eq("id", String(payload.offer_id)).maybeSingle()
      : { data: null };
    const buyerId = offer?.buyer_id;
    if (buyerId) {
      const key =
        type === "offer.accepted"
          ? "offer.accepted"
          : type === "offer.declined"
            ? "offer.declined"
            : "offer.countered";
      await notify(buyerId, key, { ...base, link }, { dealId });
    }
    if (type === "offer.accepted") {
      const copy = STATE_COPY[type];
      await sendMany(
        uniqueUserIds(ctx.parties.map((p) => p.user_id)),
        "deal.state",
        { ...base, headline: copy.headline, what: copy.what, next: copy.next, link: sellerLink },
        dealId,
        buyerId,
      );
    }
    return;
  }

  if (STATE_COPY[type]) {
    const copy = STATE_COPY[type];
    await sendMany(
      uniqueUserIds(ctx.parties.map((p) => p.user_id)),
      "deal.state",
      { ...base, headline: copy.headline, what: copy.what, next: copy.next, link },
      dealId,
      actorId,
    );
    return;
  }

  if (type === "task.assigned") {
    let ownerId = typeof payload.owner_user_id === "string" ? payload.owner_user_id : null;
    if (!ownerId && typeof payload.owner_role === "string") {
      ownerId = ctx.parties.find((p) => p.role === payload.owner_role)?.user_id ?? null;
    }
    if (ownerId) {
      await notify(
        ownerId,
        "task.assigned",
        {
          ...base,
          title: payload.title,
          description: payload.description,
          date: payload.due_date,
          link,
        },
        { dealId },
      );
    }
    return;
  }

  if (type === "document.uploaded") {
    const visibility = String(payload.visibility ?? "shared");
    const name = typeof payload.name === "string" ? payload.name : "A document";
    let recipients: string[] = [];
    if (visibility === "shared") {
      recipients = uniqueUserIds([...ctx.parties.map((p) => p.user_id), ...staffAndAe(ctx.parties)]);
    } else if (visibility === "seller_side") {
      recipients = uniqueUserIds([...sideUsers(ctx.parties, "seller"), ...staffAndAe(ctx.parties)]);
    } else if (visibility === "buyer_side") {
      recipients = uniqueUserIds([...sideUsers(ctx.parties, "buyer"), ...staffAndAe(ctx.parties)]);
    }
    await sendMany(
      recipients,
      "document.uploaded",
      { ...base, name, link },
      dealId,
      actorId,
    );
    return;
  }

  if (type === "signature.requested" || type === "signature.declined" || type === "signature.signed") {
    const key = type as "signature.requested" | "signature.declined" | "signature.signed";
    const recipients = uniqueUserIds([
      ...staffAndAe(ctx.parties),
      ...ctx.parties.filter((p) => p.user_id !== actorId).map((p) => p.user_id),
    ]);
    await sendMany(
      recipients,
      key,
      { ...base, name: payload.name, link },
      dealId,
      actorId,
    );
    return;
  }

  if (type === "dropbox.event") {
    const eventType = String(payload.event_type ?? "");
    if (eventType.includes("complete") || eventType.includes("signed") || eventType.includes("all_signed")) {
      await dispatchFromEvent(admin, dealId, actorId, "signature.signed", payload);
    } else if (eventType.includes("declined")) {
      await dispatchFromEvent(admin, dealId, actorId, "signature.declined", payload);
    }
    return;
  }

  if (type === "message.sent") {
    const threadKey = String(payload.thread_key ?? "");
    const { data: latest } = await admin
      .from("messages")
      .select("sender_id")
      .eq("deal_id", dealId)
      .eq("thread_key", threadKey)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const sender = latest?.sender_id ?? actorId;
    const recipients = uniqueUserIds(ctx.parties.map((p) => p.user_id)).filter((id) => id !== sender);
    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    for (const id of recipients) {
      const { data: recent } = await admin
        .from("notifications")
        .select("id")
        .eq("user_id", id)
        .eq("deal_id", dealId)
        .eq("template_key", "message.new")
        .gte("created_at", since)
        .limit(5);
      const sameThread = (recent ?? []).length
        ? await admin
            .from("notifications")
            .select("id, payload")
            .eq("user_id", id)
            .eq("deal_id", dealId)
            .eq("template_key", "message.new")
            .gte("created_at", since)
        : { data: [] as { payload: unknown }[] };
      const throttled = (sameThread.data ?? []).some((row) => {
        const p = row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
          ? (row.payload as Record<string, unknown>)
          : {};
        return p.thread_key === threadKey;
      });
      if (throttled) continue;
      await notify(id, "message.new", { ...base, thread_key: threadKey, link }, { dealId });
    }
    return;
  }

  if (type === "party.invited") {
    const email = typeof payload.email === "string" ? payload.email : "";
    const { data: profile } = email
      ? await admin.from("profiles").select("id").eq("email", email).maybeSingle()
      : { data: null };
    await notify(profile?.id ?? null, "party.invited", {
      ...base,
      roleLabel: payload.role,
      inviter: payload.inviter,
      link: payload.invite_url ?? link,
    }, { dealId, email });
  }
}

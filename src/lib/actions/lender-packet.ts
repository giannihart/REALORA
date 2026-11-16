"use server";

import { requireActor, insertEvent, type Actor } from "@/lib/actions/actor";
import {
  DealActionError,
  wrapError,
  type ActionResult,
} from "@/lib/actions/errors";
import { BUYING_POWER_DEFAULTS, computeBuyingPower } from "@/lib/buying-power";
import { buildLenderPacketPdf } from "@/lib/lender-packet/pdf";
import {
  LENDER_PACKET_CONSENT_VERSION,
  buyerStatusFromDelivery,
  type LenderPacketBuyerStatus,
  type LenderPacketCreditBand,
  type LenderPacketDeliveryStatus,
  type LenderPacketDraft,
  type LenderPacketFundsTiming,
  type LenderPacketOccupancy,
  type LenderPacketPayload,
  type LenderPacketPropertyType,
  type LenderPacketRecord,
  type LenderPacketTimeline,
} from "@/lib/lender-packet/types";
import { deliverLenderPacketEmail } from "@/lib/services/notifications";
import type { Json } from "@/lib/database.types";

type PacketRow = {
  id: string;
  user_id: string;
  lender_id: string;
  lender_name: string;
  lender_email: string;
  payload: Json;
  pdf_storage_path: string | null;
  consent_version: string;
  delivery_status: LenderPacketDeliveryStatus;
  provider_id: string | null;
  created_at: string;
  sent_at: string | null;
};

function mapPacket(row: PacketRow): LenderPacketRecord {
  return {
    id: row.id,
    userId: row.user_id,
    lenderId: row.lender_id,
    lenderName: row.lender_name,
    lenderEmail: row.lender_email,
    payload: row.payload as unknown as LenderPacketPayload,
    pdfStoragePath: row.pdf_storage_path,
    consentVersion: row.consent_version,
    deliveryStatus: row.delivery_status,
    providerId: row.provider_id,
    createdAt: row.created_at,
    sentAt: row.sent_at,
  };
}

/** True when migration 0012 has not been applied on the linked project. */
function isMissingLenderPacketsTable(message: string | undefined): boolean {
  if (!message) return false;
  return (
    /lender_packets/i.test(message) &&
    /(schema cache|could not find the table|does not exist)/i.test(message)
  );
}

/** Fallback key in public.settings until migration 0012 lands. */
function settingsPacketKey(userId: string) {
  return `lender_packet:${userId}`;
}

async function readPacketRecordFromSettings(
  admin: Actor["admin"],
  userId: string,
): Promise<PacketRow | null> {
  const { data, error } = await admin
    .from("settings")
    .select("value")
    .eq("key", settingsPacketKey(userId))
    .maybeSingle();
  if (error || !data?.value) return null;
  try {
    const parsed = JSON.parse(data.value) as PacketRow;
    if (!parsed?.id || parsed.user_id !== userId) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writePacketRecordToSettings(
  admin: Actor["admin"],
  row: PacketRow,
): Promise<void> {
  const { error } = await admin.from("settings").upsert(
    {
      key: settingsPacketKey(row.user_id),
      value: JSON.stringify(row),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );
  if (error) throw new DealActionError("validation", error.message);
}

async function loadPacketRow(
  admin: Actor["admin"],
  userId: string,
): Promise<{ row: PacketRow | null; via: "table" | "settings" }> {
  const { data, error } = await admin
    .from("lender_packets")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (!error) return { row: (data as PacketRow | null) ?? null, via: "table" };
  if (!isMissingLenderPacketsTable(error.message)) {
    throw new DealActionError("validation", error.message);
  }
  return { row: await readPacketRecordFromSettings(admin, userId), via: "settings" };
}

async function persistPacketRow(
  admin: Actor["admin"],
  row: PacketRow,
  existing: PacketRow | null,
  via: "table" | "settings",
): Promise<"table" | "settings"> {
  if (via === "settings") {
    await writePacketRecordToSettings(admin, row);
    return "settings";
  }
  if (existing) {
    const { error } = await admin
      .from("lender_packets")
      .update({
        lender_id: row.lender_id,
        lender_name: row.lender_name,
        lender_email: row.lender_email,
        payload: row.payload,
        pdf_storage_path: row.pdf_storage_path,
        consent_version: row.consent_version,
        delivery_status: row.delivery_status,
        provider_id: row.provider_id,
        sent_at: row.sent_at,
      })
      .eq("id", existing.id)
      .eq("user_id", row.user_id);
    if (!error) return "table";
    if (!isMissingLenderPacketsTable(error.message)) {
      throw new DealActionError("validation", error.message);
    }
  } else {
    const { error } = await admin.from("lender_packets").insert(row);
    if (!error) return "table";
    if (!isMissingLenderPacketsTable(error.message)) {
      throw new DealActionError("validation", error.message);
    }
  }
  await writePacketRecordToSettings(admin, row);
  return "settings";
}

export async function getLenderPacketAction(): Promise<
  ActionResult<{
    packet: LenderPacketRecord | null;
    buyerStatus: LenderPacketBuyerStatus | null;
  }>
> {
  try {
    const actor = await requireActor();
    const { row } = await loadPacketRow(actor.admin, actor.userId);
    if (!row) return { ok: true, data: { packet: null, buyerStatus: null } };
    const packet = mapPacket(row);
    return {
      ok: true,
      data: {
        packet,
        buyerStatus: buyerStatusFromDelivery(packet.deliveryStatus),
      },
    };
  } catch (error) {
    return wrapError(error);
  }
}

function assertDraft(draft: LenderPacketDraft): {
  timeline: LenderPacketTimeline;
  area: string;
  propertyType: LenderPacketPropertyType;
  occupancy: LenderPacketOccupancy;
  targetPrice: number;
  comfortMonthlyPayment: number;
  downPayment: number;
  fundsTiming: LenderPacketFundsTiming;
  annualIncome: number;
  monthlyDebts: number;
  selfEmployed: boolean;
  ownedHomePast3Years: boolean;
  militaryAffiliation: boolean;
  bankruptcyOrShortSale: boolean;
  creditScoreBand: LenderPacketCreditBand;
  legalFirstName: string;
  legalLastName: string;
  phone: string;
  currentStreet: string;
  currentUnit: string;
  currentCity: string;
  currentState: string;
  currentZip: string;
  lenderId: string;
  lenderName: string;
  lenderEmail: string;
} {
  if (!draft.timeline) throw new DealActionError("validation", "Choose a timeline.");
  if (!draft.propertyType) {
    throw new DealActionError("validation", "Choose a property type.");
  }
  if (!draft.occupancy) throw new DealActionError("validation", "Choose how you will use the home.");
  if (!draft.area.trim()) throw new DealActionError("validation", "Enter a city or ZIP code.");
  if (!(draft.targetPrice > 0)) {
    throw new DealActionError("validation", "Enter a target price.");
  }
  if (!(draft.comfortMonthlyPayment > 0)) {
    throw new DealActionError("validation", "Enter a comfortable monthly payment.");
  }
  if (!(draft.downPayment >= 0)) {
    throw new DealActionError("validation", "Enter cash available up front.");
  }
  if (!draft.fundsTiming) throw new DealActionError("validation", "Choose when funds will be ready.");
  if (!(draft.annualIncome > 0)) {
    throw new DealActionError("validation", "Enter annual income.");
  }
  if (!(draft.monthlyDebts >= 0)) {
    throw new DealActionError("validation", "Enter monthly debts.");
  }
  if (draft.selfEmployed === null) {
    throw new DealActionError("validation", "Tell us whether any income is from self-employment.");
  }
  if (draft.ownedHomePast3Years === null) {
    throw new DealActionError("validation", "Tell us whether you owned a home in the past 3 years.");
  }
  if (draft.militaryAffiliation === null) {
    throw new DealActionError("validation", "Tell us about military affiliation.");
  }
  if (draft.bankruptcyOrShortSale === null) {
    throw new DealActionError("validation", "Answer the bankruptcy / foreclosure question.");
  }
  if (!draft.creditScoreBand) {
    throw new DealActionError("validation", "Choose a credit-score band.");
  }
  if (!draft.legalFirstName.trim() || !draft.legalLastName.trim()) {
    throw new DealActionError("validation", "Enter your legal first and last name.");
  }
  if (!draft.phone.trim()) {
    throw new DealActionError("validation", "Enter a phone number.");
  }
  if (!draft.currentStreet.trim() || !draft.currentCity.trim()) {
    throw new DealActionError("validation", "Enter your current address.");
  }
  if (!draft.currentState.trim() || !draft.currentZip.trim()) {
    throw new DealActionError("validation", "Enter state and ZIP for your current address.");
  }
  if (!draft.lenderName.trim() || !draft.lenderEmail.trim()) {
    throw new DealActionError("validation", "Choose a lender or enter name and email.");
  }
  const email = draft.lenderEmail.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new DealActionError("validation", "Enter a valid lender email.");
  }
  return {
    timeline: draft.timeline,
    area: draft.area.trim(),
    propertyType: draft.propertyType,
    occupancy: draft.occupancy,
    targetPrice: Math.round(draft.targetPrice),
    comfortMonthlyPayment: Math.round(draft.comfortMonthlyPayment),
    downPayment: Math.round(draft.downPayment),
    fundsTiming: draft.fundsTiming,
    annualIncome: Math.round(draft.annualIncome),
    monthlyDebts: Math.round(draft.monthlyDebts),
    selfEmployed: draft.selfEmployed,
    ownedHomePast3Years: draft.ownedHomePast3Years,
    militaryAffiliation: draft.militaryAffiliation,
    bankruptcyOrShortSale: draft.bankruptcyOrShortSale,
    creditScoreBand: draft.creditScoreBand,
    legalFirstName: draft.legalFirstName.trim(),
    legalLastName: draft.legalLastName.trim(),
    phone: draft.phone.trim(),
    currentStreet: draft.currentStreet.trim(),
    currentUnit: draft.currentUnit.trim(),
    currentCity: draft.currentCity.trim(),
    currentState: draft.currentState.trim(),
    currentZip: draft.currentZip.trim(),
    lenderId: draft.byo ? "byo" : draft.lenderId || "byo",
    lenderName: draft.lenderName.trim(),
    lenderEmail: email,
  };
}

export async function sendLenderPacketAction(input: {
  draft: LenderPacketDraft;
  consentVersion: string;
  consented: boolean;
}): Promise<
  ActionResult<{
    packetId: string;
    buyerStatus: LenderPacketBuyerStatus;
  }>
> {
  try {
    if (!input.consented) {
      throw new DealActionError(
        "validation",
        "Consent is required before Realora can send your packet.",
      );
    }
    if (input.consentVersion !== LENDER_PACKET_CONSENT_VERSION) {
      throw new DealActionError("validation", "Consent version is out of date. Refresh and try again.");
    }

    const actor = await requireActor();
    const fields = assertDraft(input.draft);

    const { row: existing, via: loadVia } = await loadPacketRow(
      actor.admin,
      actor.userId,
    );

    if (existing?.delivery_status === "sent") {
      return {
        ok: true,
        data: {
          packetId: existing.id,
          buyerStatus: "sent",
        },
      };
    }

    const estimate = computeBuyingPower({
      annualIncome: fields.annualIncome,
      monthlyDebts: fields.monthlyDebts,
      downPayment: fields.downPayment,
      creditBand: BUYING_POWER_DEFAULTS.creditBand,
      annualRatePct: BUYING_POWER_DEFAULTS.annualRatePct,
      termYears: BUYING_POWER_DEFAULTS.termYears,
    }).maxHomePrice;

    const buyerName = `${fields.legalFirstName} ${fields.legalLastName}`.trim();

    const payload: LenderPacketPayload = {
      buyerName,
      buyerEmail: actor.profile?.email ?? "",
      buyerPhone: fields.phone,
      legalFirstName: fields.legalFirstName,
      legalLastName: fields.legalLastName,
      timeline: fields.timeline,
      area: fields.area,
      propertyType: fields.propertyType,
      occupancy: fields.occupancy,
      targetPrice: fields.targetPrice,
      comfortMonthlyPayment: fields.comfortMonthlyPayment,
      comfortMonthlyPaymentLabel: "buyer-stated",
      downPayment: fields.downPayment,
      fundsTiming: fields.fundsTiming,
      annualIncome: fields.annualIncome,
      monthlyDebts: fields.monthlyDebts,
      estimatedBuyingPower: estimate,
      selfEmployed: fields.selfEmployed,
      ownedHomePast3Years: fields.ownedHomePast3Years,
      militaryAffiliation: fields.militaryAffiliation,
      bankruptcyOrShortSale: fields.bankruptcyOrShortSale,
      creditScoreBand: fields.creditScoreBand,
      creditScoreBandLabel: `${fields.creditScoreBand} (self-reported)`,
      currentAddress: {
        street: fields.currentStreet,
        unit: fields.currentUnit,
        city: fields.currentCity,
        state: fields.currentState,
        zip: fields.currentZip,
      },
      lenderName: fields.lenderName,
      lenderEmail: fields.lenderEmail,
      preparedAt: new Date().toISOString(),
    };

    const pdfBytes = await buildLenderPacketPdf(payload);
    const packetId = existing?.id ?? crypto.randomUUID();
    const pdfPath = `lender-packets/${actor.userId}/${packetId}.pdf`;

    const { error: upErr } = await actor.admin.storage
      .from("deal-documents")
      .upload(pdfPath, pdfBytes, {
        contentType: "application/pdf",
        upsert: true,
      });
    if (upErr) throw new DealActionError("validation", upErr.message);

    const now = new Date().toISOString();
    const preparedRow: PacketRow = {
      id: packetId,
      user_id: actor.userId,
      lender_id: fields.lenderId,
      lender_name: fields.lenderName,
      lender_email: fields.lenderEmail,
      payload: payload as unknown as Json,
      pdf_storage_path: pdfPath,
      consent_version: LENDER_PACKET_CONSENT_VERSION,
      delivery_status: "prepared",
      provider_id: null,
      created_at: existing?.created_at ?? now,
      sent_at: null,
    };

    const storeVia = await persistPacketRow(
      actor.admin,
      preparedRow,
      existing,
      loadVia,
    );

    const delivery = await deliverLenderPacketEmail({
      userId: actor.userId,
      to: fields.lenderEmail,
      subject: `Buyer introduction from Realora — ${payload.buyerName}`,
      body: [
        `A buyer on Realora asked us to share their introduction packet with ${fields.lenderName}.`,
        "",
        `Buyer: ${payload.buyerName}`,
        `Email: ${payload.buyerEmail}`,
        `Phone: ${payload.buyerPhone ?? "—"}`,
        `Target: ${fields.area} · ${fields.propertyType} · $${fields.targetPrice.toLocaleString()}`,
        "",
        "The attached one-page PDF is the full packet.",
        "",
        "Prepared by the buyer on Realora and sent at their direction. Realora is not a lender, made no credit decision, and charges no fee for this introduction.",
      ].join("\n"),
      pdfBytes,
      filename: `realora-lender-packet-${packetId.slice(0, 8)}.pdf`,
      packetId,
    });

    const nextStatus: LenderPacketDeliveryStatus =
      delivery.status === "sent" ? "sent" : "prepared";
    const finalRow: PacketRow = {
      ...preparedRow,
      delivery_status: nextStatus,
      provider_id: delivery.providerId,
      sent_at: nextStatus === "sent" ? new Date().toISOString() : null,
    };
    await persistPacketRow(actor.admin, finalRow, preparedRow, storeVia);

    if (!existing) {
      try {
        await insertEvent(actor.admin, null, actor.userId, "lender_packet.sent", {
          packet_id: packetId,
          lender_id: fields.lenderId,
          lender_name: fields.lenderName,
          lender_email: fields.lenderEmail,
          consent_version: LENDER_PACKET_CONSENT_VERSION,
          delivery_status: nextStatus,
          via: storeVia,
          at: new Date().toISOString(),
        });
      } catch (eventErr) {
        // deal_id may still be NOT NULL until 0012 is applied — packet row is already durable.
        console.error("lender_packet.sent event skipped", eventErr);
      }
    }

    return {
      ok: true,
      data: {
        packetId,
        buyerStatus: buyerStatusFromDelivery(nextStatus),
      },
    };
  } catch (error) {
    return wrapError(error);
  }
}

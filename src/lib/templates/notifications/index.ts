export type TemplateKey =
  | "offer.submitted"
  | "offer.accepted"
  | "offer.declined"
  | "offer.countered"
  | "deal.state"
  | "task.assigned"
  | "document.uploaded"
  | "signature.requested"
  | "signature.signed"
  | "signature.declined"
  | "agreement.executed_copy"
  | "message.new"
  | "reminder.48h"
  | "reminder.24h"
  | "reminder.due"
  | "party.invited";

export type RenderedTemplate = {
  subject: string;
  body: string;
  sms: string;
  critical: boolean;
};

function str(payload: Record<string, unknown>, key: string, fallback = ""): string {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value : fallback;
}

export function renderNotification(
  key: TemplateKey,
  payload: Record<string, unknown>,
): RenderedTemplate {
  const address = str(payload, "address", "the property");
  const date = str(payload, "date");
  const link = str(payload, "link", `${payload.siteUrl ?? ""}/portal`);
  const action = `Open: ${link}`;

  switch (key) {
    case "offer.submitted":
      return {
        subject: `New offer on ${address}`,
        body: `A buyer submitted an offer of ${str(payload, "price", "an amount")} on ${address}${date ? ` on ${date}` : ""}. Review the terms and respond.\n\n${action}`,
        sms: `New offer on ${address}. Review it in REALORA.`,
        critical: false,
      };
    case "offer.accepted":
      return {
        subject: `Your offer on ${address} was accepted`,
        body: `The seller accepted your offer on ${address}${date ? ` on ${date}` : ""}. Attorneys will circulate the contract next.\n\n${action}`,
        sms: `Offer accepted on ${address}. Next: contract.`,
        critical: true,
      };
    case "offer.declined":
      return {
        subject: `Your offer on ${address} was not selected`,
        body: `The seller declined your offer on ${address}. No further action is needed on this file.\n\n${action}`,
        sms: `Offer on ${address} was not selected.`,
        critical: false,
      };
    case "offer.countered":
      return {
        subject: `Counter-offer on ${address}`,
        body: `The seller sent a counter on ${address}${date ? ` dated ${date}` : ""}. Review the new terms and respond.\n\n${action}`,
        sms: `Counter-offer on ${address}. Review in REALORA.`,
        critical: false,
      };
    case "deal.state":
      return {
        subject: `${address}: ${str(payload, "headline", "update")}`,
        body: `${str(payload, "what", "The deal changed.")} ${str(payload, "next", "Open the portal for the next step.")}\n\n${action}`,
        sms: `${str(payload, "headline", "Deal update")} on ${address}.`,
        critical: false,
      };
    case "task.assigned":
      return {
        subject: `Assigned: ${str(payload, "title", "a task")} — ${address}`,
        body: `${str(payload, "title", "A task")} on ${address} is assigned to you${date ? ` (due ${date})` : ""}. ${str(payload, "description", "")}\n\n${action}`,
        sms: `Task assigned on ${address}: ${str(payload, "title", "open REALORA")}.`,
        critical: false,
      };
    case "document.uploaded":
      return {
        subject: `New document on ${address}`,
        body: `${str(payload, "name", "A document")} was added to ${address}. Open Documents to review it.\n\n${action}`,
        sms: `New document on ${address}.`,
        critical: false,
      };
    case "signature.requested":
      return {
        subject: `Signature needed: ${str(payload, "name", "document")} — ${address}`,
        body: `Please sign ${str(payload, "name", "the document")} for ${address}${date ? ` by ${date}` : ""}.\n\n${action}`,
        sms: `Signature needed on ${address}.`,
        critical: true,
      };
    case "signature.signed":
      return {
        subject: `${str(payload, "name", "Document")} signed — ${address}`,
        body: `${str(payload, "name", "The document")} for ${address} is signed. The file is in Documents.\n\n${action}`,
        sms: `Document signed on ${address}.`,
        critical: false,
      };
    case "signature.declined":
      return {
        subject: `Signature declined — ${address}`,
        body: `${str(payload, "name", "A document")} for ${address} was declined. The listing broker can re-send it.\n\n${action}`,
        sms: `Signature declined on ${address}.`,
        critical: false,
      };
    case "agreement.executed_copy":
      return {
        subject: `Your executed listing agreement — ${address}`,
        body: `Your listing agreement for ${address} is fully executed. A copy is in your Documents vault for your records.\n\n${action}`,
        sms: `Your listing agreement for ${address} is fully executed.`,
        critical: false,
      };
    case "message.new":
      return {
        subject: `New message on ${address}`,
        body: `You have a new message on ${address}. Open Messages to reply.\n\n${action}`,
        sms: `New message on ${address}.`,
        critical: false,
      };
    case "reminder.48h":
      return {
        subject: `Due in 48 hours: ${str(payload, "title", "task")} — ${address}`,
        body: `${str(payload, "title", "A task")} on ${address} is due ${str(payload, "due", "in 48 hours")}. Complete it from Home.\n\n${action}`,
        sms: `Due in 48h on ${address}: ${str(payload, "title", "task")}.`,
        critical: true,
      };
    case "reminder.24h":
      return {
        subject: `Due tomorrow: ${str(payload, "title", "task")} — ${address}`,
        body: `${str(payload, "title", "A task")} on ${address} is due ${str(payload, "due", "tomorrow")}. Complete it from Home.\n\n${action}`,
        sms: `Due tomorrow on ${address}: ${str(payload, "title", "task")}.`,
        critical: true,
      };
    case "reminder.due":
      return {
        subject: `Due today: ${str(payload, "title", "task")} — ${address}`,
        body: `${str(payload, "title", "A task")} on ${address} is due today (${str(payload, "due", "")}). Complete it from Home.\n\n${action}`,
        sms: `Due today on ${address}: ${str(payload, "title", "task")}.`,
        critical: true,
      };
    case "party.invited":
      return {
        subject: `You're invited to ${address} as ${str(payload, "roleLabel", "a professional")}`,
        body: `${str(payload, "inviter", "A party")} invited you to the ${address} transaction as ${str(payload, "roleLabel", "a professional")}. Accept the invite to join the file.\n\n${action}`,
        sms: `REALORA invite for ${address}. Open the link to join.`,
        critical: false,
      };
    default:
      return {
        subject: `Update on ${address}`,
        body: `There is an update on ${address}.\n\n${action}`,
        sms: `Update on ${address}.`,
        critical: false,
      };
  }
}

export const TEMPLATE_VERSION = "v1";

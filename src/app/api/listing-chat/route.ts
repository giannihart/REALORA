import { NextResponse } from "next/server";
import { listings } from "@/data/seed";
import { getPublicListingAction } from "@/lib/actions/listing";
import { isSupabaseDataMode } from "@/lib/data/mode";
import {
  LISTING_CHAT_SYSTEM,
  answerListingQuestion,
  listingFactText,
  type ChatTurn,
} from "@/lib/listing-chat";
import type { Listing } from "@/lib/types";

export const dynamic = "force-dynamic";

const MAX_MESSAGE = 500;
const MAX_HISTORY = 8;

function asTurns(value: unknown): ChatTurn[] {
  if (!Array.isArray(value)) return [];
  const turns: ChatTurn[] = [];
  for (const row of value.slice(-MAX_HISTORY)) {
    if (!row || typeof row !== "object") continue;
    const role = (row as { role?: unknown }).role;
    const content = (row as { content?: unknown }).content;
    if ((role === "user" || role === "assistant") && typeof content === "string") {
      const text = content.trim().slice(0, MAX_MESSAGE);
      if (text) turns.push({ role, content: text });
    }
  }
  while (turns.length && turns[0].role !== "user") turns.shift();
  return turns;
}

async function loadListing(id: string): Promise<Listing | null> {
  if (isSupabaseDataMode()) {
    const result = await getPublicListingAction(id);
    if (result.ok && result.data) return result.data;
  }
  return listings.find((row) => row.id === id) ?? null;
}

async function modelReply(listing: Listing, message: string, history: ChatTurn[]) {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) return answerListingQuestion(listing, message, history);

  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey: key });
    const prior = history.map((turn) => ({
      role: turn.role,
      content: turn.content,
    }));
    const response = await client.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 400,
      system: `${LISTING_CHAT_SYSTEM}\n\nListing facts:\n${listingFactText(listing)}`,
      messages: [...prior, { role: "user", content: message }],
    });
    const block = response.content.find((part) => part.type === "text");
    const text = block && "text" in block ? block.text.trim() : "";
    return text || answerListingQuestion(listing, message, history);
  } catch {
    return answerListingQuestion(listing, message, history);
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const listingId =
    body && typeof body === "object" && typeof (body as { listingId?: unknown }).listingId === "string"
      ? (body as { listingId: string }).listingId.trim()
      : "";
  const message =
    body && typeof body === "object" && typeof (body as { message?: unknown }).message === "string"
      ? (body as { message: string }).message.trim()
      : "";
  const history =
    body && typeof body === "object"
      ? asTurns((body as { history?: unknown }).history)
      : [];

  if (!listingId) {
    return NextResponse.json({ error: "listingId is required" }, { status: 400 });
  }
  if (!message) {
    return NextResponse.json({ error: "Ask a question about this home." }, { status: 400 });
  }
  if (message.length > MAX_MESSAGE) {
    return NextResponse.json({ error: "Keep questions under 500 characters." }, { status: 400 });
  }

  const listing = await loadListing(listingId);
  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  const reply = await modelReply(listing, message, history);
  return NextResponse.json(
    { reply },
    { headers: { "Cache-Control": "no-store" } },
  );
}

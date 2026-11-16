"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Send } from "lucide-react";
import { cn } from "@/lib/format";
import { answerListingQuestion, type ChatTurn } from "@/lib/listing-chat";
import type { Listing } from "@/lib/types";

type Bubble = ChatTurn & { id: string };

function chipsFor(listing: Listing) {
  const hoa = listing.type === "Condo" || listing.type === "Loft";
  return [
    "How many bedrooms?",
    "What are the taxes?",
    hoa ? "What's the HOA?" : listing.lotSqft > 0 ? "Is there outdoor space?" : "When was it built?",
    "What's the monthly payment?",
  ];
}

export function PropertyChat({ listing }: { listing: Listing }) {
  const welcome = useMemo(
    () =>
      `Ask me anything in this listing file for ${listing.address} — price, rooms, taxes, year built, heating, or the description.`,
    [listing.address],
  );
  const [messages, setMessages] = useState<Bubble[]>([
    { id: "welcome", role: "assistant", content: welcome },
  ]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const asked = messages.some((row) => row.role === "user");

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages, pending]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || pending) return;
    const user: Bubble = {
      id: `u-${Date.now()}`,
      role: "user",
      content: message,
    };
    const history = messages
      .filter((row) => row.id !== "welcome")
      .map(({ role, content }) => ({ role, content }));
    setMessages((rows) => [...rows, user]);
    setDraft("");
    setPending(true);
    try {
      const response = await fetch("/api/listing-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId: listing.id,
          message,
          history,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { reply?: string; error?: string }
        | null;
      const reply =
        response.ok && payload?.reply
          ? payload.reply
          : answerListingQuestion(listing, message, history.slice(0, -1));
      setMessages((rows) => [
        ...rows,
        { id: `a-${Date.now()}`, role: "assistant", content: reply },
      ]);
    } catch {
      setMessages((rows) => [
        ...rows,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: answerListingQuestion(listing, message, history.slice(0, -1)),
        },
      ]);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-3 flex min-h-0 flex-col rounded-2xl border border-line bg-white p-5 shadow-sm">
      <h3 className="text-base font-semibold tracking-tight text-forest">
        Ask about this home
      </h3>
      <p className="mt-1 text-xs leading-5 text-muted">
        Answers come from this listing file — not advice.
      </p>

      <div
        className="mt-4 flex max-h-56 min-h-[11rem] flex-col gap-2 overflow-y-auto rounded-xl bg-warm px-3 py-3"
        aria-live="polite"
      >
        {messages.map((row) => (
          <div
            key={row.id}
            className={cn("flex", row.role === "user" ? "justify-end" : "justify-start")}
          >
            <p
              className={cn(
                "max-w-[92%] rounded-2xl px-3 py-2 text-[13px] leading-5",
                row.role === "user"
                  ? "rounded-br-md bg-forest text-cream"
                  : "rounded-bl-md border border-line bg-white text-forest",
              )}
            >
              {row.content}
            </p>
          </div>
        ))}
        {pending ? (
          <div className="flex justify-start">
            <p className="rounded-2xl rounded-bl-md border border-line bg-white px-3 py-2 text-[13px] text-muted">
              Thinking…
            </p>
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      {!asked ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {chipsFor(listing).map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => void send(chip)}
              className="rounded-full border border-line bg-white px-2.5 py-1 text-xs font-medium text-forest hover:bg-warm"
            >
              {chip}
            </button>
          ))}
        </div>
      ) : null}

      <form
        className="mt-3 flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void send(draft);
        }}
      >
        <label className="sr-only" htmlFor={`listing-chat-${listing.id}`}>
          Ask a question about this home
        </label>
        <textarea
          id={`listing-chat-${listing.id}`}
          value={draft}
          rows={1}
          disabled={pending}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send(draft);
            }
          }}
          placeholder="Ask anything about this home"
          className="max-h-24 min-h-[44px] flex-1 resize-none rounded-xl border border-line bg-cream px-3.5 py-3 text-sm text-forest outline-none placeholder:text-muted/80 focus:border-forest/30"
        />
        <button
          type="submit"
          disabled={pending || !draft.trim()}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-forest text-cream transition hover:bg-forest-deep disabled:opacity-40"
          aria-label="Send question"
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}

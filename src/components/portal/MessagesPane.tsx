"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Search, Send } from "lucide-react";
import { cn } from "@/lib/format";
import { useAppData } from "@/lib/data/use-app-data";
import type { ChatMessage, MessageThread, Role } from "@/lib/types";
import { ActionFailure } from "@/lib/actions/errors";
import { acknowledgeAgencyDisclosureAction } from "@/lib/actions/disclosure";
import { toast } from "sonner";

type HubFilter = "all" | "unread";

export function MessagesPane({ role }: { role: Role }) {
  const router = useRouter();
  const threads = useAppData((s) => s.threads);
  const messages = useAppData((s) => s.messages);
  const sendMessage = useAppData((s) => s.sendMessage);
  const appendCannedReply = useAppData((s) => s.appendCannedReply);
  const markThreadRead = useAppData((s) => s.markThreadRead);

  const mine = useMemo(
    () => threads.filter((t) => t.role === role || t.role === "both"),
    [threads, role],
  );
  const [activeId, setActiveId] = useState(
    () => mine.find((t) => t.unread)?.id ?? mine[0]?.id ?? "",
  );
  const [filter, setFilter] = useState<HubFilter>("all");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const active = mine.find((t) => t.id === activeId) ?? mine[0];
  const unreadCount = mine.filter((t) => t.unread > 0).length;
  const convo = messages.filter((m) => m.threadId === active?.id);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return mine.filter((t) => {
      if (filter === "unread" && t.unread <= 0) return false;
      if (!q) return true;
      return t.name.toLowerCase().includes(q) || t.preview.toLowerCase().includes(q);
    });
  }, [mine, filter, query]);

  useEffect(() => {
    if (!mine.find((t) => t.id === activeId) && mine[0]) setActiveId(mine[0].id);
  }, [mine, activeId]);

  useEffect(() => {
    if (activeId) markThreadRead(activeId);
  }, [activeId, markThreadRead]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [active?.id, convo.length]);

  function selectThread(id: string) {
    setActiveId(id);
    setMobileChatOpen(true);
    setDraft("");
  }

  function send() {
    const text = draft.trim();
    if (!text || !active) return;
    void Promise.resolve(sendMessage(active.id, text))
      .then(() => {
        setDraft("");
        window.setTimeout(() => appendCannedReply(active.id), 1000);
      })
      .catch((err: unknown) => {
        if (err instanceof ActionFailure && err.code === "disclosure_required") {
          void acknowledgeAgencyDisclosureAction({}).then((res) => {
            if (!res.ok) {
              toast(res.message);
              return;
            }
            toast("Agency Disclosure acknowledged. Send again to continue.");
          });
          return;
        }
      });
  }

  return (
    <div className="-mx-4 -mb-6 flex h-[calc(100vh-8.5rem)] min-h-[520px] flex-col overflow-hidden border-y border-line bg-cream md:mx-0 md:mb-0 md:rounded-2xl md:border">
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside
          className={cn(
            "flex w-full shrink-0 flex-col border-line bg-white md:w-[320px] md:border-r lg:w-[340px]",
            mobileChatOpen ? "hidden md:flex" : "flex",
          )}
        >
          <div className="border-b border-line px-4 py-4">
            <div className="flex items-baseline justify-between gap-2">
              <h1 className="font-sans text-2xl font-medium tracking-tight text-forest">Messages</h1>
              {mine.length === 0 ? (
                <span className="text-xs text-muted"></span>
              ) : unreadCount ? (
                <span className="text-xs text-muted">{unreadCount} unread</span>
              ) : (
                <span className="text-xs text-muted">All caught up</span>
              )}
            </div>
            <div className="relative mt-3">
              <Search
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search conversations"
                className="w-full rounded-xl border border-line bg-cream py-2 pl-9 pr-3 text-sm outline-none placeholder:text-muted/80 focus:border-forest/30"
              />
            </div>
            <div className="mt-3 flex gap-1 overflow-x-auto">
              {(
                [
                  ["all", "All"],
                  ["unread", "Unread"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFilter(id)}
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1 text-xs font-medium transition",
                    filter === id
                      ? "bg-forest text-cream"
                      : "bg-warm text-forest/80 hover:bg-sand",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {mine.length === 0 ? (
              <p className="px-4 py-10 text-sm leading-6 text-muted text-center">
                No threads yet.
              </p>
            ) : null}
            {filtered.map((t) => {
              const selected = t.id === active?.id;
              const unread = t.unread > 0;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => selectThread(t.id)}
                  className={cn(
                    "flex w-full gap-3 border-b border-line/70 px-4 py-3.5 text-left transition",
                    selected ? "bg-cream" : "bg-white hover:bg-warm/50",
                  )}
                >
                  <Avatar thread={t} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p
                        className={cn(
                          "truncate text-sm",
                          unread || selected ? "font-semibold" : "font-medium",
                        )}
                      >
                        {t.name}
                      </p>
                    </div>
                    <p
                      className={cn(
                        "mt-1 line-clamp-1 text-sm",
                        unread ? "text-forest" : "text-forest/65",
                      )}
                    >
                      {t.preview}
                    </p>
                  </div>
                  {unread ? (
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-forest" />
                  ) : null}
                </button>
              );
            })}
            {mine.length > 0 && filtered.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-muted">
                No conversations match.
              </p>
            ) : null}
          </div>
        </aside>

        <section
          className={cn(
            "min-h-0 min-w-0 flex-1 flex-col bg-cream",
            mobileChatOpen ? "flex" : "hidden md:flex",
          )}
        >
          {active ? (
            <>
              <header className="flex items-center gap-3 border-b border-line bg-white px-4 py-3.5 sm:px-6">
                <button
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full text-forest hover:bg-warm md:hidden"
                  onClick={() => setMobileChatOpen(false)}
                  aria-label="Back to conversations"
                >
                  <ArrowLeft size={16} />
                </button>
                <Avatar thread={active} large />
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-sm font-semibold">{active.name}</h2>
                  <p className="truncate text-xs text-muted">{active.preview}</p>
                </div>
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
                <div className="mx-auto flex max-w-2xl flex-col gap-3">
                  {convo.map((m) => (
                    <Bubble
                      key={m.id}
                      message={m}
                      onNavigate={(href) => router.push(href)}
                    />
                  ))}
                  <div ref={endRef} />
                </div>
              </div>

              <footer className="border-t border-line bg-white px-4 py-3 sm:px-6">
                <div className="mx-auto flex max-w-2xl items-end gap-2">
                  <textarea
                    ref={inputRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        send();
                      }
                    }}
                    rows={1}
                    placeholder={`Message ${active.name.split(" ")[0]}…`}
                    className="max-h-28 min-h-[44px] flex-1 resize-none rounded-xl border border-line bg-cream px-3.5 py-3 text-sm outline-none placeholder:text-muted/80 focus:border-forest/30"
                  />
                  <button
                    type="button"
                    onClick={send}
                    disabled={!draft.trim()}
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-forest text-cream transition hover:bg-forest-deep disabled:opacity-40"
                    aria-label="Send"
                  >
                    <Send size={16} />
                  </button>
                </div>
                <p className="mx-auto mt-2 max-w-2xl text-[11px] text-muted">
                  Offline messaging — replies stay on this device and are not delivered.
                </p>
              </footer>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
              <p className="text-sm font-medium text-forest">
                {mine.length === 0 ? "Messages will land here" : "Select a conversation"}
              </p>
              <p className="max-w-sm text-sm text-muted">
                {mine.length === 0
                  ? "Deal parties and vendors appear in the list once your transaction is underway."
                  : "Pick a thread from the list to read and reply."}
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Avatar({ thread, large }: { thread: MessageThread; large?: boolean }) {
  const size = large ? "h-10 w-10 text-sm" : "h-9 w-9 text-xs";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-forest text-cream font-medium",
        size,
      )}
    >
      {thread.name.slice(0, 2).toUpperCase()}
    </span>
  );
}

function Bubble({
  message,
}: {
  message: ChatMessage;
  onNavigate: (href: string) => void;
}) {
  const isYou = message.fromUser;

  return (
    <div className={cn("flex", isYou ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3.5 py-2.5 sm:max-w-[75%]",
          isYou
            ? "rounded-br-md bg-forest text-cream"
            : "rounded-bl-md bg-white border border-line",
        )}
      >
        {!isYou ? (
          <p className="mb-1 text-xs font-medium text-muted">{message.sender}</p>
        ) : null}
        <p className="whitespace-pre-wrap text-sm leading-6">{message.body}</p>
        <p className={cn("mt-1.5 text-[10px]", isYou ? "text-cream/65" : "text-muted")}>
          {message.at}
        </p>
      </div>
    </div>
  );
}

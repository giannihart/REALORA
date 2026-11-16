"use client";

import { useState } from "react";
import { Check, Plus, Star } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { cn, formatPrice } from "@/lib/format";
import {
  ownVendorId,
  type ServicePhase,
  type ServiceSnapshot,
} from "@/lib/services/service-state";
import type {
  OwnProviderDetails,
  ServiceVendor,
  VendorCategory,
} from "@/lib/types";

function PhaseChip({ phase }: { phase: ServicePhase }) {
  if (phase === "none") return null;
  if (phase === "chosen") {
    return (
      <Badge tone="lime">
        <Check size={12} strokeWidth={2.5} />
        Chosen
      </Badge>
    );
  }
  if (phase === "scheduled") {
    return <Badge tone="neutral">Scheduled</Badge>;
  }
  return (
    <Badge tone="neutral">
      <Check size={12} strokeWidth={2.5} />
      Completed
    </Badge>
  );
}

function formatWhen(date?: string, time?: string) {
  if (!date || !time) return null;
  try {
    const weekday = new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
      weekday: "long",
    });
    return `${weekday}, ${time}`;
  } catch {
    return `${date} · ${time}`;
  }
}

export function ServiceGroup({
  category,
  when,
  vendors,
  snapshot,
  interactive,
  showFee,
  onChoose,
  onSaveOwn,
  onSchedule,
  setupBlocked,
}: {
  category: VendorCategory;
  when: string;
  vendors: ServiceVendor[];
  snapshot: ServiceSnapshot;
  interactive: boolean;
  showFee?: boolean;
  onChoose?: (vendorId: string) => void;
  onSaveOwn?: (input: OwnProviderDetails) => void;
  onSchedule?: (vendorId: string, date: string, time: string) => void;
  setupBlocked?: (vendor: ServiceVendor) => boolean;
}) {
  const recommended =
    vendors.find((v) => v.recommended) ?? vendors[0] ?? null;
  const others = vendors.filter((v) => v.id !== recommended?.id);
  const [byoOpen, setByoOpen] = useState(false);
  const [name, setName] = useState(snapshot.own?.name ?? "");
  const [contact, setContact] = useState(snapshot.own?.contact ?? "");
  const [note, setNote] = useState(snapshot.own?.note ?? "");
  const [quotedPrice, setQuotedPrice] = useState(
    snapshot.own?.quotedPrice != null ? String(snapshot.own.quotedPrice) : "",
  );
  const [date, setDate] = useState("2026-10-24");
  const [time, setTime] = useState("10:00");

  const selectedId = snapshot.vendorId;
  const phase = snapshot.phase;
  const terminal = phase === "completed";
  const needsTime = category === "Inspector";
  const isInspector = category === "Inspector";
  const quotedPriceNum = Number(quotedPrice.replace(/[^0-9.]/g, ""));
  const quotedPriceValid =
    !isInspector || (Number.isFinite(quotedPriceNum) && quotedPriceNum > 0);

  function cardSelected(id: string) {
    if (!selectedId) return false;
    if (id === "own") {
      return snapshot.isOwn || selectedId === ownVendorId(category) || selectedId === "own-inspector";
    }
    return selectedId === id && !snapshot.isOwn;
  }

  function renderProviderCard(v: ServiceVendor, suggested: boolean) {
    const selected = cardSelected(v.id);
    const muted = Boolean(selectedId) && !selected && phase !== "none";
    const blocked = setupBlocked?.(v) ?? false;
    return (
      <div
        key={v.id}
        className={cn(
          "flex flex-col rounded-2xl border bg-white p-4 transition",
          selected && !terminal && "border-lime",
          selected && terminal && "border-line opacity-70",
          !selected && "border-line",
          muted && "opacity-50",
        )}
      >
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-forest">{v.name}</p>
            <p className="mt-0.5 flex items-center gap-1 text-xs leading-5 text-forest">
              <Star size={12} strokeWidth={2} className="fill-current text-forest" />
              <span className="inline-flex items-center gap-1">
                {v.rating}/5 on
                <img
                  src="/brands/google-wordmark.png"
                  alt="Google"
                  className="relative top-px h-3.5 w-auto"
                />
              </span>
            </p>
            {showFee ? (
              <p className="mt-1.5 text-sm font-medium text-forest">
                {formatPrice(v.price)}
              </p>
            ) : null}
          </div>
          {suggested ? <Badge tone="lime">Realora&apos;s pick</Badge> : null}
          {selected && phase === "chosen" ? (
            <Badge tone="lime">
              <Check size={12} strokeWidth={2.5} />
              Chosen
            </Badge>
          ) : null}
        </div>

        {selected && phase === "scheduled" ? (
          <p className="mt-3 text-sm font-medium text-forest">
            {formatWhen(snapshot.date, snapshot.time)}
          </p>
        ) : null}
        {selected && phase === "completed" ? (
          <p className="mt-3 text-xs text-muted">{snapshot.outcome}</p>
        ) : null}

        {blocked && interactive && !terminal ? (
          <p className="mt-3 text-xs text-muted">
            Vendor setup required — this vendor cannot take paid bookings yet.
          </p>
        ) : null}

        {interactive && !terminal ? (
          <div className="mt-3">
            {selected && phase === "chosen" && needsTime && onSchedule && !blocked ? (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="h-9 rounded-xl border border-line px-2 text-xs"
                  />
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="h-9 rounded-xl border border-line px-2 text-xs"
                  />
                </div>
                <Button
                  variant="lime"
                  className="h-8 w-full rounded-full text-xs"
                  onClick={() => onSchedule(v.id, date, time)}
                >
                  Confirm time
                </Button>
              </div>
            ) : !selected && phase !== "scheduled" ? (
              <Button
                variant="outline"
                className="h-8 rounded-full px-3 text-xs"
                onClick={() => onChoose?.(v.id)}
              >
                Choose
              </Button>
            ) : selected && phase === "chosen" && !needsTime && !blocked ? (
              <Button
                variant="lime"
                className="h-8 rounded-full px-3 text-xs"
                onClick={() => onSchedule?.(v.id, date, time)}
              >
                Book
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  const ownSelected = cardSelected("own");

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-sm font-semibold text-forest">Choose {category}</h4>
          {interactive ? <PhaseChip phase={phase} /> : null}
        </div>
        <p className="text-xs text-muted">{when}</p>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {recommended ? renderProviderCard(recommended, true) : null}
        {others.map((v) => renderProviderCard(v, false))}

        <div
          className={cn(
            "flex flex-col rounded-2xl border p-4 transition sm:col-span-2 lg:col-span-3",
            ownSelected && !terminal ? "border-lime bg-white" : "border-line bg-transparent",
            Boolean(selectedId) && !ownSelected && "opacity-50",
            terminal && ownSelected && "opacity-70",
          )}
        >
          {ownSelected && snapshot.own ? (
            <>
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-forest">{snapshot.own.name}</p>
                  <p className="mt-0.5 text-xs text-muted">{snapshot.own.contact}</p>
                  {snapshot.own.quotedPrice != null ? (
                    <p className="mt-1 text-xs text-forest">
                      Quoted {formatPrice(snapshot.own.quotedPrice)}
                      <span className="text-muted"> · Realora does not mark up</span>
                    </p>
                  ) : null}
                  {snapshot.own.note ? (
                    <p className="mt-1 text-xs text-muted">{snapshot.own.note}</p>
                  ) : null}
                </div>
                <Badge tone="neutral">Your own</Badge>
                {phase === "chosen" ? (
                  <Badge tone="lime">
                    <Check size={12} strokeWidth={2.5} />
                    Chosen
                  </Badge>
                ) : null}
              </div>
              {phase === "scheduled" ? (
                <p className="mt-3 text-sm font-medium text-forest">
                  {formatWhen(snapshot.date, snapshot.time)}
                </p>
              ) : null}
              {phase === "completed" ? (
                <p className="mt-3 text-xs text-muted">{snapshot.outcome}</p>
              ) : null}
              {interactive && phase === "chosen" && needsTime && onSchedule ? (
                <div className="mt-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="h-9 rounded-xl border border-line px-2 text-xs"
                    />
                    <input
                      type="time"
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                      className="h-9 rounded-xl border border-line px-2 text-xs"
                    />
                  </div>
                  <Button
                    variant="lime"
                    className="h-8 w-full rounded-full text-xs"
                    onClick={() =>
                      onSchedule(ownVendorId(category), date, time)
                    }
                  >
                    Confirm time
                  </Button>
                </div>
              ) : null}
              {interactive && phase === "chosen" && !needsTime && onSchedule ? (
                <Button
                  variant="lime"
                  className="mt-3 h-8 rounded-full px-3 text-xs"
                  onClick={() => onSchedule(ownVendorId(category), date, time)}
                >
                  Book
                </Button>
              ) : null}
            </>
          ) : (
            <>
              <div className="flex items-start gap-2">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line text-forest">
                  <Plus size={14} strokeWidth={2} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-forest">Bring my own</p>
                  <p className="mt-0.5 text-xs leading-5 text-muted">
                    {isInspector
                      ? "Enter your inspector's contact and the fee they quoted you. Realora coordinates only — we never mark up their price."
                      : "Add their name, how to reach them, and any notes. We'll handle scheduling and coordination."}
                  </p>
                </div>
              </div>
              {interactive && !terminal ? (
                byoOpen ? (
                  <div className="mt-3 space-y-2">
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={isInspector ? "Inspector name" : "Name"}
                      className="h-9 w-full rounded-xl border border-line px-3 text-xs"
                    />
                    <input
                      value={contact}
                      onChange={(e) => setContact(e.target.value)}
                      placeholder="Phone or email"
                      className="h-9 w-full rounded-xl border border-line px-3 text-xs"
                    />
                    {isInspector ? (
                      <>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-forest">
                            Fee they quoted you
                          </label>
                          <div className="relative">
                            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted">
                              $
                            </span>
                            <input
                              inputMode="decimal"
                              value={quotedPrice}
                              onChange={(e) => setQuotedPrice(e.target.value)}
                              placeholder="e.g. $750"
                              className="h-9 w-full rounded-xl border border-line py-0 pl-7 pr-3 text-xs"
                            />
                          </div>
                        </div>
                        <p className="text-[11px] leading-4 text-muted">
                          Confirm this is the price they quoted. Realora will not
                          upcharge or add a markup — you pay them directly at this
                          amount.
                        </p>
                      </>
                    ) : null}
                    <input
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder={
                        isInspector
                          ? "License #, preferred day, or other notes (optional)"
                          : "Note (optional)"
                      }
                      className="h-9 w-full rounded-xl border border-line px-3 text-xs"
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="lime"
                        className="h-8 rounded-full px-3 text-xs"
                        disabled={!name.trim() || !contact.trim() || !quotedPriceValid}
                        onClick={() => {
                          if (!name.trim() || !contact.trim() || !quotedPriceValid) return;
                          onSaveOwn?.({
                            name: name.trim(),
                            contact: contact.trim(),
                            note: note.trim() || undefined,
                            ...(isInspector
                              ? { quotedPrice: quotedPriceNum }
                              : {}),
                          });
                          setByoOpen(false);
                        }}
                      >
                        Save
                      </Button>
                      <Button
                        variant="ghost"
                        className="h-8 rounded-full px-3 text-xs"
                        onClick={() => setByoOpen(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    className="mt-3 h-8 rounded-full px-3 text-xs"
                    onClick={() => setByoOpen(true)}
                  >
                    Add details
                  </Button>
                )
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}


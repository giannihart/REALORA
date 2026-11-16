"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/format";

export interface TimelineStage {
  id: string;
  order: number;
  title: string;
  status: "Complete" | "In Progress" | "Upcoming" | "Action Required";
  date?: string;
  targetDate?: string;
  description?: string;
  responsibleParty?: string;
  nextAction?: string;
  relatedTaskIds?: string[];
  relatedDocumentIds?: string[];
  /** Optional CTA shown under the row (used for seller blockers in read-only timelines). */
  ctaLabel?: string;
  ctaHref?: string;
}

function statusLabel(
  status: TimelineStage["status"],
  upcomingIndex?: number,
  opts?: { pendingStyle?: boolean; hasActive?: boolean },
) {
  if (status === "In Progress") return opts?.pendingStyle ? "Pending" : "Now";
  if (status === "Action Required")
    return opts?.pendingStyle ? "Waiting on you" : "Needs you";
  if (status === "Complete") return "Done";
  if (upcomingIndex == null || upcomingIndex < 0) return "Up next";
  // No in-progress step yet: first upcoming is Now, second is Up next.
  if (!opts?.hasActive) {
    if (upcomingIndex === 0) return opts?.pendingStyle ? "Pending" : "Now";
    if (upcomingIndex === 1) return "Up next";
    return `In ${upcomingIndex + 1} steps`;
  }
  if (upcomingIndex === 0) return "Up next";
  return `In ${upcomingIndex + 1} steps`;
}

function stageSubheader(stage: TimelineStage, opts: { open: boolean; readOnly: boolean }) {
  if (opts.readOnly && stage.description) return stage.description;
  if (stage.date) return `Completed ${stage.date}`;
  if (stage.targetDate) return `Target ${stage.targetDate}`;
  const parts = [
    stage.responsibleParty,
    !opts.open ? stage.nextAction : undefined,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : stage.description;
}

export function Timeline({
  stages,
  onOpenTasks,
  onOpenDocuments,
  focusId,
  readOnly = false,
}: {
  stages: TimelineStage[];
  onOpenTasks?: (taskIds?: string[]) => void;
  onOpenDocuments?: (docIds?: string[]) => void;
  focusId?: string;
  /** Non-interactive rows — no expand, description shown as one-line subheader. */
  readOnly?: boolean;
}) {
  const [openId, setOpenId] = useState(
    readOnly
      ? undefined
      : (focusId ??
          stages.find((s) => s.status === "In Progress" || s.status === "Action Required")
            ?.id),
  );

  const done = stages.filter((s) => s.status === "Complete").length;
  const upcomingIds = stages
    .filter((s) => s.status === "Upcoming")
    .map((s) => s.id);
  const hasActive = stages.some(
    (s) => s.status === "In Progress" || s.status === "Action Required",
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4 rounded-2xl bg-forest px-4 py-3">
        <p className="text-sm font-medium text-cream">
          <span className="text-lime">{done}</span>
          {" of "}
          {stages.length} complete
        </p>
        <div
          className="h-1.5 w-24 overflow-hidden rounded-full bg-cream/25 sm:w-32"
          aria-hidden
        >
          <div
            className="h-full rounded-full bg-lime transition-[width]"
            style={{
              width: `${stages.length ? Math.round((done / stages.length) * 100) : 0}%`,
            }}
          />
        </div>
      </div>

      <ol className="space-y-2.5">
        {stages.map((stage) => {
          const open = !readOnly && openId === stage.id;
          const current =
            stage.status === "In Progress" || stage.status === "Action Required";
          const complete = stage.status === "Complete";
          const upcoming = stage.status === "Upcoming";
          const upcomingIndex = upcoming ? upcomingIds.indexOf(stage.id) : -1;
          const leadUpcoming = upcoming && !hasActive && upcomingIndex === 0;
          const subheader = stageSubheader(stage, { open, readOnly });

          const rowClass =
            "grid w-full grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3.5 text-left";

          const rowBody = (
            <>
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-warm text-xs font-medium text-forest",
                  complete && "text-forest/45",
                )}
                aria-hidden
              >
                {stage.order}
              </span>

              <span className="min-w-0">
                <span
                  className={cn(
                    "block text-sm font-medium leading-snug text-forest",
                    complete && "text-forest/55",
                  )}
                >
                  {stage.title}
                </span>
                {subheader ? (
                  <span className="mt-1 block truncate text-xs text-muted">
                    {subheader}
                  </span>
                ) : null}
              </span>

              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
                  complete && "bg-warm text-forest",
                  (stage.status === "In Progress" || leadUpcoming) &&
                    (readOnly ? "bg-[#F6E2C3] text-forest" : "bg-forest text-cream"),
                  stage.status === "Action Required" && "bg-[#E2A03A] text-forest",
                  upcoming && !leadUpcoming && "bg-lime text-forest",
                )}
              >
                {complete ? <Check size={12} strokeWidth={2.5} /> : null}
                {statusLabel(
                  stage.status,
                  upcomingIndex >= 0 ? upcomingIndex : undefined,
                  { pendingStyle: readOnly, hasActive },
                )}
              </span>
            </>
          );

          return (
            <li
              key={stage.id}
              className={cn(
                "overflow-hidden rounded-2xl border border-line bg-white",
                current && "border-forest/15 bg-lime/20",
                focusId === stage.id && "bg-lime/35",
              )}
            >
              {readOnly ? (
                <div className={rowClass}>{rowBody}</div>
              ) : (
                <button
                  type="button"
                  onClick={() => setOpenId(open ? undefined : stage.id)}
                  className={cn(rowClass, "transition hover:bg-warm/50")}
                >
                  {rowBody}
                </button>
              )}

              {readOnly && stage.ctaLabel && stage.ctaHref ? (
                <div className="border-t border-line px-4 pb-3.5 pt-2.5">
                  <Button
                    href={stage.ctaHref}
                    variant="lime"
                    className="h-8 rounded-xl px-3 text-xs"
                  >
                    {stage.ctaLabel}
                  </Button>
                </div>
              ) : null}

              {open ? (
                <div className="border-t border-line px-4 pb-4 pl-[calc(1.75rem+0.75rem+1rem)] pt-3 text-sm leading-6 text-forest/80">
                  <p>{stage.description}</p>
                  <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                    <div>
                      <dt className="text-muted">Responsible</dt>
                      <dd className="font-medium text-forest">
                        {stage.responsibleParty ?? "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">Date</dt>
                      <dd className="font-medium text-forest">
                        {stage.date
                          ? `Completed ${stage.date}`
                          : stage.targetDate
                            ? `Target ${stage.targetDate}`
                            : "TBD"}
                      </dd>
                    </div>
                  </dl>
                  {stage.nextAction ? (
                    <p className="mt-2 text-xs font-medium text-forest">
                      Next: {stage.nextAction}
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {stage.relatedTaskIds?.length && onOpenTasks ? (
                      <Button
                        className="h-8 rounded-xl text-xs"
                        variant="outline"
                        onClick={() => onOpenTasks(stage.relatedTaskIds)}
                      >
                        View related tasks
                      </Button>
                    ) : null}
                    {stage.relatedDocumentIds?.length && onOpenDocuments ? (
                      <Button
                        className="h-8 rounded-xl text-xs"
                        variant="outline"
                        onClick={() => onOpenDocuments(stage.relatedDocumentIds)}
                      >
                        View documents
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export { Timeline as TransactionTimeline };

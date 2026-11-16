"use client";

import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

export type PortalSection =
  | "overview"
  | "transaction"
  | "tasks"
  | "documents"
  | "financing"
  | "listing"
  | "offers"
  | "providers"
  | "messages";

export interface NextStepView {
  id: string;
  title: string;
  why: string;
  due?: string;
  /** ISO date (YYYY-MM-DD) for countdown formatting. */
  dueDate?: string;
  ctaLabel: string;
  section: PortalSection;
  targetId?: string;
  afterComplete: string;
}

function formatExpiresIn(isoDate: string) {
  const target = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const days = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  const onDate = target.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  if (days < 0) return `Expired on ${onDate}`;
  if (days === 0) return `Expires today on ${onDate}`;
  if (days === 1) return `Expires in 1 day on ${onDate}`;
  return `Expires in ${days} days on ${onDate}`;
}

export interface HandlingItem {
  id: string;
  title: string;
  detail: string;
  state: "In progress" | "Pending";
  actionLabel?: string;
  actionId?: string;
}

export interface MilestoneView {
  id: string;
  title: string;
  detail?: string;
  date?: string;
  /** Same order number as Progress / Timeline for this milestone. */
  order?: number;
}

export interface HomeViewModel {
  addressLine: string;
  stageLabel: string;
  overallStatus: string;
  deadline?: { label: string; date: string };
  nextStep: NextStepView | null;
  handling: HandlingItem[];
  comingUp: MilestoneView[];
  completed: MilestoneView[];
  completedCount: number;
  totalMilestones: number;
  assignments?: HandlingItem[];
  deals?: HandlingItem[];
}

export function NextActionHome({
  image,
  propertyId,
  view,
  onNavigate,
  onHandlingAction,
  overviewExtra,
}: {
  image?: string;
  propertyId?: string;
  view: HomeViewModel;
  onNavigate: (section: PortalSection, targetId?: string) => void;
  onHandlingAction?: (item: HandlingItem) => void;
  overviewExtra?: ReactNode;
}) {
  const next = view.nextStep;

  const progressPct = Math.round(
    (view.completedCount / Math.max(view.totalMilestones, 1)) * 100,
  );
  const statusLooksLikeStage =
    view.overallStatus.toLowerCase().includes(view.stageLabel.toLowerCase()) ||
    view.stageLabel.toLowerCase().includes(
      view.overallStatus.split("·")[0]?.trim().toLowerCase() ?? "___",
    );

  return (
    <div className="space-y-5">
      {/* A. Transaction summary */}
      <header className="overflow-hidden rounded-2xl border border-line bg-white">
        <div className="flex items-center gap-3 p-3 sm:gap-4 sm:p-4">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image}
              alt=""
              className="h-14 w-14 shrink-0 rounded-xl object-cover sm:h-16 sm:w-16"
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold tracking-tight text-forest sm:text-xl">
              {view.addressLine}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <Badge tone="dark">{view.stageLabel}</Badge>
              {!statusLooksLikeStage ? (
                <span className="text-xs text-muted">{view.overallStatus}</span>
              ) : null}
            </div>
          </div>
          {propertyId ? (
            <div className="shrink-0 self-start">
              <Button
                variant="outline"
                href={`/listing/${propertyId}`}
                className="rounded-full px-3 py-1.5 text-xs sm:px-3.5"
              >
                View property details
              </Button>
            </div>
          ) : null}
        </div>

        <div
          className={`grid gap-px border-t border-line bg-line ${
            view.deadline ? "sm:grid-cols-2" : ""
          }`}
        >
          {view.deadline ? (
            <div className="bg-white px-4 py-2.5">
              <p className="text-xs font-medium text-muted">
                Next deadline
              </p>
              <p className="mt-0.5 text-sm font-medium text-forest">
                {view.deadline.label}
                <span className="font-normal text-muted"> · {view.deadline.date}</span>
              </p>
            </div>
          ) : null}
          <div className="bg-white px-4 py-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-xs font-medium text-muted">
                Progress
              </p>
              <p className="text-xs text-muted">
                {view.completedCount}/{view.totalMilestones}
              </p>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-warm">
              <div
                className="h-full rounded-full bg-forest"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </div>
        {overviewExtra ? (
          <div className="border-t border-line bg-white px-4 py-2.5">{overviewExtra}</div>
        ) : null}
      </header>

      {/* B. Your next step — dominant (or green all-clear when nothing is due) */}
      <section className="rounded-2xl border border-forest bg-forest px-5 py-5 text-cream sm:px-6">
        <p className="text-xs font-medium text-lime">
          {next ? "Your next step" : "Status"}
        </p>
        {next ? (
          <>
            <h2 className="mt-2 font-sans text-2xl font-semibold tracking-tight sm:text-3xl">
              {next.title}
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-cream/85">{next.why}</p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button
                variant="lime"
                className="rounded-full px-5"
                onClick={() => onNavigate(next.section, next.targetId)}
              >
                {next.ctaLabel}
              </Button>
              {(() => {
                const label =
                  (next.dueDate ? formatExpiresIn(next.dueDate) : null) ||
                  next.due?.replace(/^Due\s+/i, "") ||
                  null;
                if (!label) return null;
                return <span className="text-xs text-lime">{label}</span>;
              })()}
            </div>
            {next.afterComplete ? (
              <p className="mt-3 text-xs leading-5 text-cream/55">{next.afterComplete}</p>
            ) : null}
          </>
        ) : (
          <>
            <h2 className="mt-2 font-sans text-2xl font-semibold tracking-tight sm:text-3xl">
              You&apos;re all up to date
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-cream/85">
              Nothing needed from you right now. Realora is moving things forward —
              we&apos;ll surface the next action here when something needs you.
            </p>
            <Button
              variant="lime"
              className="mt-4 rounded-full px-5"
              onClick={() => onNavigate("transaction")}
            >
              View progress
            </Button>
          </>
        )}
      </section>

      {view.deals?.length ? (
        <section>
          <h2 className="text-sm font-semibold text-forest">Your deals</h2>
          <ul className="mt-3 space-y-1.5">
            {view.deals.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-line bg-white px-3.5 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="mt-0.5 text-xs leading-5 text-muted">{item.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {view.assignments?.length ? (
        <section>
          <h2 className="text-sm font-semibold text-forest">My assignments</h2>
          <ul className="mt-3 space-y-1.5">
            {view.assignments.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-line bg-white px-3.5 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="mt-0.5 text-xs leading-5 text-muted">{item.detail}</p>
                </div>
                {item.actionLabel ? (
                  <Button
                    variant="outline"
                    className="h-8 shrink-0 rounded-xl px-3 text-xs"
                    onClick={() => onHandlingAction?.(item)}
                  >
                    {item.actionLabel}
                  </Button>
                ) : (
                  <Badge tone="neutral">{item.state}</Badge>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* C. Realora is handling it */}
      <section>
        <h2 className="text-sm font-semibold text-forest">Realora is handling it</h2>
        <p className="mt-1 text-xs text-muted">
          No action needed from you on these items.
        </p>
        {view.handling.length ? (
          <ul className="mt-3 space-y-1.5">
            {view.handling.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-line bg-white px-3.5 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="mt-0.5 text-xs leading-5 text-muted">{item.detail}</p>
                </div>
                {item.actionLabel ? (
                  <Button
                    variant="outline"
                    className="h-8 shrink-0 rounded-xl px-3 text-xs"
                    onClick={() => onHandlingAction?.(item)}
                  >
                    {item.actionLabel}
                  </Button>
                ) : (
                  <Badge tone={item.state === "Pending" ? "warn" : "neutral"}>
                    {item.state}
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 rounded-2xl border border-dashed border-line bg-white px-4 py-6 text-sm text-muted">
            No active coordination items at the moment.
          </p>
        )}
      </section>

      {/* D. Coming up */}
      <section>
        <h2 className="text-sm font-semibold text-forest">Coming up</h2>
        <p className="mt-1 text-xs text-muted">The next milestones after your current work.</p>
        {view.comingUp.length ? (
          <ol className="mt-3 space-y-1.5">
            {view.comingUp.map((m, i) => (
              <li
                key={m.id}
                className="flex items-center gap-3 rounded-xl border border-line bg-white px-3.5 py-2.5"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-warm text-xs font-medium text-forest">
                  {m.order ?? i + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{m.title}</p>
                  {m.detail ? (
                    <p className="mt-0.5 text-xs leading-5 text-muted line-clamp-2">
                      {m.detail}
                    </p>
                  ) : null}
                  {m.date ? (
                    <p className="mt-1 text-[11px] text-muted">Target {m.date}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-4 text-sm text-muted">No upcoming milestones listed.</p>
        )}
        <button
          type="button"
          onClick={() => onNavigate("transaction")}
          className="mt-3 text-xs font-medium text-forest underline-offset-2 hover:underline"
        >
          Full timeline
        </button>
      </section>

      {/* E. Completed */}
      <section>
        <h2 className="text-sm font-semibold text-forest">Completed</h2>
        <p className="mt-1 text-xs text-muted">
          {view.completedCount} milestone{view.completedCount === 1 ? "" : "s"} done
        </p>
        <ul className="mt-3 space-y-1.5">
          {view.completed.map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-line bg-white px-3.5 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{m.title}</p>
                {m.date ? (
                  <p className="mt-0.5 text-xs text-muted">{m.date}</p>
                ) : null}
              </div>
              <Badge tone="neutral">
                <Check size={12} strokeWidth={2.5} />
                Done
              </Badge>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

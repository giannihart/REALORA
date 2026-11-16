"use client";

import { useMemo } from "react";
import { ServiceGroup } from "@/components/portal/services/ServiceGroup";
import { useAppData } from "@/lib/data/use-app-data";
import { isSupabaseDataMode } from "@/lib/data/mode";
import {
  SERVICE_WHEN,
  nextServiceDecision,
  type ConsumerServiceCategory,
  type ServiceSnapshot,
} from "@/lib/services/service-state";
import type { Role, ServiceVendor, VendorCategory } from "@/lib/types";
import { toast } from "sonner";
import { Badge } from "@/components/ui/Badge";

const CONSUMER_CATEGORIES = new Set<VendorCategory>([
  "Inspector",
  "Movers",
  "Cleaners",
  "Locksmith",
]);

const IDLE_CATEGORIES: ConsumerServiceCategory[] = [
  "Inspector",
  "Movers",
  "Cleaners",
  "Locksmith",
];

export function ServicesGrid({ role }: { role: Role }) {
  void role;
  const deal = useAppData((s) => s.deal);
  const bookings = useAppData((s) => s.bookings);
  const user = useAppData((s) => s.user);
  const liveVendors = useAppData((s) => s.vendors);
  const selectServiceProvider = useAppData((s) => s.selectServiceProvider);
  const saveOwnProvider = useAppData((s) => s.saveOwnProvider);
  const bookVendor = useAppData((s) => s.bookVendor);
  const dismissConcierge = useAppData((s) => s.dismissConcierge);

  const vendors = useMemo(() => {
    const raw =
      isSupabaseDataMode() && liveVendors?.length
        ? liveVendors
        : liveVendors?.length
          ? liveVendors
          : [];
    return raw.filter((v) => CONSUMER_CATEGORIES.has(v.category));
  }, [liveVendors]);

  const signedIn = Boolean(user.signedIn);

  const due = useMemo(
    () => (signedIn ? nextServiceDecision(deal, bookings, vendors) : null),
    [signedIn, deal, bookings, vendors],
  );

  const panel = useMemo(() => {
    if (!due) return [];
    return vendors.filter((v) => v.category === due.category);
  }, [due, vendors]);

  function onSchedule(category: VendorCategory, vendorId: string, date: string, time: string) {
    void Promise.resolve(bookVendor(vendorId, date, time))
      .then(() => toast("Scheduled."))
      .catch((err: unknown) =>
        toast(err instanceof Error ? err.message : "Could not schedule."),
      );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-sans text-2xl font-medium tracking-tight text-forest">
          Services
        </h1>
      </div>

      <section className="rounded-2xl border border-line bg-white px-4 py-4 sm:px-5">
        {due ? (
          <>
            {due.tier === "concierge" ? (
              <div className="mb-1 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    dismissConcierge(due.category as "Movers" | "Cleaners" | "Locksmith");
                    toast("Skipped.");
                  }}
                  className="text-xs font-medium text-muted underline-offset-2 hover:text-forest hover:underline"
                >
                  Skip for now
                </button>
              </div>
            ) : null}
            {panel.length ? (
              <ServicePick
                category={due.category}
                vendors={panel}
                snapshot={due.snapshot}
                interactive={signedIn}
                setupBlocked={(v) => Boolean(isSupabaseDataMode() && v.setupRequired)}
                onChoose={(vendorId) => {
                  selectServiceProvider(due.category, vendorId);
                  toast("Provider chosen.");
                }}
                onSaveOwn={(input) => {
                  saveOwnProvider(due.category, input);
                  toast("We'll coordinate with them.");
                }}
                onSchedule={(vendorId, date, time) => {
                  onSchedule(due.category, vendorId, date, time);
                }}
              />
            ) : (
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-forest">Choose {due.category}</h4>
                  <p className="text-xs text-muted">{SERVICE_WHEN[due.category]}</p>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="rounded-2xl border border-line bg-white p-4 sm:col-span-2 lg:col-span-3">
                    <p className="text-sm font-medium text-forest">Providers coming online</p>
                    <p className="mt-0.5 text-xs leading-5 text-muted">
                      This step is due. Curated providers will appear here as soon as they&apos;re
                      available.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-forest">You&apos;re all set</h4>
              <p className="text-xs text-muted">Surfaces when your deal needs it</p>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {IDLE_CATEGORIES.map((category) => (
                <div
                  key={category}
                  className="flex flex-col rounded-2xl border border-line bg-white p-4 opacity-60"
                >
                  <div className="flex flex-wrap items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-forest">{category}</p>
                      <p className="mt-0.5 text-xs leading-5 text-muted">
                        {SERVICE_WHEN[category]}
                      </p>
                    </div>
                    <Badge tone="neutral">Later</Badge>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-muted">
                    No action from you right now. We&apos;ll unlock choose / book here when this
                    service is due.
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <div className="border-t border-line pt-4">
        <p className="max-w-xl text-[11px] leading-5 text-muted">
          <span className="font-medium text-forest/70">How vendors are paid. </span>
          Vendors set their own fees and are paid directly through the platform. Realora takes
          no cut of vendor bookings and no referral fees — the panel is simply who we&apos;d
          hire ourselves.
        </p>
      </div>
    </div>
  );
}

function ServicePick({
  category,
  vendors,
  snapshot,
  interactive,
  setupBlocked,
  onChoose,
  onSaveOwn,
  onSchedule,
}: {
  category: ConsumerServiceCategory;
  vendors: ServiceVendor[];
  snapshot: ServiceSnapshot;
  interactive: boolean;
  setupBlocked: (v: ServiceVendor) => boolean;
  onChoose: (vendorId: string) => void;
  onSaveOwn: (input: import("@/lib/types").OwnProviderDetails) => void;
  onSchedule: (vendorId: string, date: string, time: string) => void;
}) {
  return (
    <ServiceGroup
      category={category}
      when={SERVICE_WHEN[category]}
      vendors={vendors}
      snapshot={snapshot}
      interactive={interactive}
      showFee={category === "Inspector"}
      setupBlocked={setupBlocked}
      onChoose={onChoose}
      onSaveOwn={onSaveOwn}
      onSchedule={onSchedule}
    />
  );
}

"use client";

import { useMemo } from "react";
import { vendors as seedVendors } from "@/data/seed";
import { ServiceGroup } from "@/components/portal/services/ServiceGroup";
import { useAppData } from "@/lib/data/use-app-data";
import { isSupabaseDataMode } from "@/lib/data/mode";
import {
  SERVICE_WHEN,
  serviceSnapshot,
} from "@/lib/services/service-state";
import { toast } from "sonner";

export function InspectionBookingCard({
  className,
}: {
  className?: string;
} = {}) {
  const deal = useAppData((s) => s.deal);
  const bookings = useAppData((s) => s.bookings);
  const liveVendors = useAppData((s) => s.vendors);
  const bookVendor = useAppData((s) => s.bookVendor);
  const selectServiceProvider = useAppData((s) => s.selectServiceProvider);
  const saveOwnProvider = useAppData((s) => s.saveOwnProvider);
  const vendors =
    isSupabaseDataMode() && liveVendors?.length
      ? (() => {
          const byId = new Map(liveVendors.map((v) => [v.id, v]));
          for (const v of seedVendors) {
            if (!byId.has(v.id) && v.category === "Inspector") {
              byId.set(v.id, { ...v, setupRequired: true });
            }
          }
          return [...byId.values()];
        })()
      : seedVendors;

  const inspectors = useMemo(
    () => vendors.filter((v) => v.category === "Inspector"),
    [vendors],
  );

  if (deal.state !== "DILIGENCE" && !deal.inspectionBooked) return null;

  const snapshot = serviceSnapshot("Inspector", deal, bookings, vendors);

  return (
    <section className={`rounded-2xl border border-line bg-white px-5 py-5 ${className ?? ""}`}>
      <p className="text-xs font-medium text-muted">
        Inspection
      </p>
      <h2 className="mt-2 text-lg font-semibold text-forest">
        {snapshot.phase === "completed"
          ? "Completed"
          : snapshot.phase === "scheduled"
            ? "Scheduled"
            : "Book your inspection"}
      </h2>
      <ServiceGroup
        category="Inspector"
        when={SERVICE_WHEN.Inspector}
        vendors={inspectors}
        snapshot={snapshot}
        interactive
        showFee
        setupBlocked={(v) => Boolean(isSupabaseDataMode() && v.setupRequired)}
        onChoose={(vendorId) => {
          selectServiceProvider("Inspector", vendorId);
          toast("Provider chosen.");
        }}
        onSaveOwn={(input) => {
          saveOwnProvider("Inspector", input);
          toast("We'll coordinate with them.");
        }}
        onSchedule={(vendorId, date, time) => {
          void Promise.resolve(bookVendor(vendorId, date, time))
            .then(() => toast("Scheduled."))
            .catch((err: unknown) =>
              toast(err instanceof Error ? err.message : "Could not schedule."),
            );
        }}
      />
    </section>
  );
}

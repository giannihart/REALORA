"use client";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useAppData } from "@/lib/data/use-app-data";
import type { Role } from "@/lib/types";

export function PortalProfileView({ role }: { role: Role | "broker" }) {
  const setRole = useAppData((s) => s.setRole);
  const user = useAppData((s) => s.user);

  const roleLabel =
    role === "broker" ? "Broker" : role === "buyer" ? "Buyer" : "Seller";
  const showSwitch = role !== "broker";
  const switchTo = role === "buyer" ? "seller" : "buyer";
  const switchHref = role === "buyer" ? "/sell" : "/portal/buyer";
  const switchLabel =
    role === "buyer" ? "Switch to seller portal" : "Switch to buyer portal";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-sans text-2xl font-medium tracking-tight text-forest">
          Profile
        </h1>
      </div>

      <section className="rounded-2xl border border-line bg-white p-5 sm:p-6">
        <dl className="space-y-4 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <dt className="text-muted">Name</dt>
            <dd className="font-medium text-forest">{user.name || "—"}</dd>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <dt className="text-muted">Email</dt>
            <dd className="font-medium text-forest">{user.email || "—"}</dd>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <dt className="text-muted">Portal</dt>
            <dd>
              <Badge tone="dark">{roleLabel}</Badge>
            </dd>
          </div>
          {role !== "broker" ? (
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <dt className="text-muted">Identity</dt>
              <dd className="font-medium text-forest">
                {user.verifiedId ? "Verified" : "Not verified"}
              </dd>
            </div>
          ) : null}
          {role === "seller" ? (
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <dt className="text-muted">Ownership</dt>
              <dd className="font-medium text-forest">
                {user.verifiedOwnership ? "Verified" : "Not verified"}
              </dd>
            </div>
          ) : null}
        </dl>
      </section>

      {showSwitch ? (
        <div className="flex flex-wrap gap-3">
          <Button
            href={switchHref}
            variant="outline"
            className="rounded-full px-5"
            onClick={() => setRole(switchTo)}
          >
            {switchLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

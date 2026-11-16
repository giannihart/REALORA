"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { NycSkylineMark } from "@/components/brand/NycSkylineMark";
import { Button } from "@/components/ui/Button";
import { useAppData } from "@/lib/data/use-app-data";
import { cn } from "@/lib/format";

const PORTALS = [
  {
    key: "buyer" as const,
    title: "Buyer Portal",
    href: "/portal/buyer",
    intent: "buying" as const,
  },
  {
    key: "seller" as const,
    title: "Seller Portal",
    href: "/portal/seller",
    intent: "selling" as const,
  },
] as const;

export default function PortalOverview() {
  const setRole = useAppData((s) => s.setRole);
  const isBroker = useAppData((s) => s.isBroker);
  const signedIn = useAppData((s) => s.user.signedIn);
  const currentRole = useAppData((s) => s.user.role);
  const deal = useAppData((s) => s.deal);
  const listings = useAppData((s) => s.listings);
  const myDeals = useAppData((s) => s.myDeals ?? []);
  const partyRoles = useAppData((s) => s.partyRoles ?? []);
  const router = useRouter();
  const [choice, setChoice] = useState<"buyer" | "seller">(
    currentRole === "seller" ? "seller" : "buyer",
  );

  const selected = PORTALS.find((p) => p.key === choice) ?? PORTALS[0];

  function sellerDestination() {
    const hasSellerListing =
      Boolean(listings.find((l) => l.id === deal.listingId)) &&
      (currentRole === "seller" ||
        partyRoles.some((r) => r === "seller" || r.includes("seller")) ||
        myDeals.some((d) => d.role === "seller" || d.role.includes("seller")));
    return hasSellerListing ? "/portal/seller" : "/sell";
  }

  function continueToPortal() {
    setRole(choice);
    if (choice === "seller") {
      const dest = sellerDestination();
      if (!signedIn) {
        const q = new URLSearchParams({
          intent: "selling",
          next: dest,
        });
        router.push(`/auth?${q.toString()}`);
        return;
      }
      router.push(dest);
      return;
    }
    if (!signedIn) {
      const q = new URLSearchParams({
        intent: selected.intent,
        next: selected.href,
      });
      router.push(`/auth?${q.toString()}`);
      return;
    }
    router.push(selected.href);
  }

  return (
    <div className="min-h-[calc(100svh-3.5rem)]">
      <div className="mx-auto max-w-xl px-4 pb-12 pt-12">
        <h1 className="font-sans text-2xl font-medium tracking-tight text-forest">
          Choose your portal
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          Track the deal, people, documents, and deadlines from listing to closing.
        </p>

        <div className="mt-8 space-y-4 rounded-3xl border border-line bg-white p-6">
          <div className="space-y-2">
            {PORTALS.map((portal) => {
              const active = choice === portal.key;
              return (
                <button
                  key={portal.key}
                  type="button"
                  onClick={() => setChoice(portal.key)}
                  className={cn(
                    "relative flex min-h-[6.5rem] w-full items-start overflow-hidden rounded-2xl border px-4 pb-12 pt-4 text-left transition",
                    active
                      ? "border-forest bg-forest text-cream"
                      : "border-line bg-white text-forest hover:bg-warm",
                  )}
                >
                  {active ? (
                    <NycSkylineMark className="pointer-events-none absolute bottom-0 left-0 aspect-[1850/332] w-full text-cream/20" />
                  ) : null}
                  <span className="relative z-[1] block text-sm font-semibold">
                    {portal.title}
                  </span>
                </button>
              );
            })}
          </div>

          <Button variant="lime" className="w-full" onClick={continueToPortal}>
            Continue to {choice === "buyer" ? "buyer" : "seller"} portal
          </Button>

          {isBroker ? (
            <p className="text-center text-sm text-muted">
              Broker of record?{" "}
              <Link
                href="/portal/broker"
                className="font-medium text-forest underline-offset-2 hover:underline"
              >
                Open console
              </Link>
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

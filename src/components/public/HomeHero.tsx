"use client";

import { useEffect, useRef, useState } from "react";
import { PropertyCard } from "@/components/marketplace/PropertyCard";
import { HomeSearchBar } from "@/components/public/HomeSearchBar";
import { cn } from "@/lib/format";
import type { Listing } from "@/lib/types";

const photo = (id: string) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1600&q=70`;

/** Homepage fan only — not marketplace inventory; cards are display-only. */
export const HOMEPAGE_SHOWCASE: Listing[] = [
  {
    id: "homepage-showcase-1",
    title: "Park Slope Brownstone",
    address: "9841 Prospect Place",
    neighborhood: "Park Slope",
    borough: "Brooklyn",
    city: "New York",
    state: "NY",
    zip: "11238",
    price: 2_450_000,
    beds: 4,
    baths: 3,
    sqft: 2_400,
    type: "Townhouse",
    yearBuilt: 1899,
    lotSqft: 1_800,
    heating: "Radiator",
    taxes: 12_400,
    badge: "New Listing",
    photos: [
      photo("1600585154340-be6161a56a0c"),
      photo("1600566753086-00f18fb6b3ea"),
    ],
    about: [],
    pin: { x: 42, y: 58 },
    pinLabel: "Park Slope",
    isDemoDeal: false,
    marketplace: false,
    status: "live",
    offerBuyerAgentPercent: 0,
    stagingLabels: [],
    syndication: [],
  },
  {
    id: "homepage-showcase-2",
    title: "West Village Loft",
    address: "402 Perry Street",
    neighborhood: "West Village",
    borough: "Manhattan",
    city: "New York",
    state: "NY",
    zip: "10014",
    price: 3_875_000,
    beds: 3,
    baths: 2.5,
    sqft: 2_100,
    type: "Loft",
    yearBuilt: 1920,
    lotSqft: 0,
    heating: "Central",
    taxes: 28_000,
    photos: [
      photo("1600210492486-724fe5c67fb0"),
      photo("1600573472550-32a5323d4f19"),
    ],
    about: [],
    pin: { x: 38, y: 48 },
    pinLabel: "West Village",
    isDemoDeal: false,
    marketplace: false,
    status: "live",
    offerBuyerAgentPercent: 0,
    stagingLabels: [],
    syndication: [],
  },
  {
    id: "homepage-showcase-3",
    title: "Brooklyn Heights Condo",
    address: "871 Pierrepont Street",
    neighborhood: "Brooklyn Heights",
    borough: "Brooklyn",
    city: "New York",
    state: "NY",
    zip: "11201",
    price: 1_695_000,
    beds: 2,
    baths: 2,
    sqft: 1_250,
    type: "Condo",
    yearBuilt: 1986,
    lotSqft: 0,
    heating: "Central",
    taxes: 9_800,
    badge: "Price Cut",
    photos: [
      photo("1600607687939-ce8a6c25118c"),
      photo("1560448204-e02f11c3d0e2"),
    ],
    about: [],
    pin: { x: 40, y: 52 },
    pinLabel: "Brooklyn Heights",
    isDemoDeal: false,
    marketplace: false,
    status: "live",
    offerBuyerAgentPercent: 0,
    stagingLabels: [],
    syndication: [],
  },
  {
    id: "homepage-showcase-4",
    title: "Cobble Hill Townhouse",
    address: "918 Warren Street",
    neighborhood: "Cobble Hill",
    borough: "Brooklyn",
    city: "New York",
    state: "NY",
    zip: "11201",
    price: 4_250_000,
    beds: 5,
    baths: 4,
    sqft: 3_200,
    type: "Townhouse",
    yearBuilt: 1872,
    lotSqft: 2_000,
    heating: "Radiator",
    taxes: 18_600,
    badge: "New Listing",
    photos: [
      photo("1600585154526-990dced4db0d"),
      photo("1613490493576-7fde63acd811"),
    ],
    about: [],
    pin: { x: 41, y: 55 },
    pinLabel: "Cobble Hill",
    isDemoDeal: false,
    marketplace: false,
    status: "live",
    offerBuyerAgentPercent: 0,
    stagingLabels: [],
    syndication: [],
  },
  {
    id: "homepage-showcase-5",
    title: "Upper West Side Classic",
    address: "9802 West 78th Street",
    neighborhood: "Upper West Side",
    borough: "Manhattan",
    city: "New York",
    state: "NY",
    zip: "10024",
    price: 2_950_000,
    beds: 3,
    baths: 2,
    sqft: 1_850,
    type: "Condo",
    yearBuilt: 1910,
    lotSqft: 0,
    heating: "Radiator",
    taxes: 22_400,
    photos: [
      photo("1502672260266-1c1ef2d93688"),
      photo("1600566752355-35792bedcfea"),
    ],
    about: [],
    pin: { x: 36, y: 42 },
    pinLabel: "Upper West Side",
    isDemoDeal: false,
    marketplace: false,
    status: "live",
    offerBuyerAgentPercent: 0,
    stagingLabels: [],
    syndication: [],
  },
  {
    id: "homepage-showcase-6",
    title: "Fort Greene Townhouse",
    address: "604 South Portland Avenue",
    neighborhood: "Fort Greene",
    borough: "Brooklyn",
    city: "New York",
    state: "NY",
    zip: "11217",
    price: 3_150_000,
    beds: 4,
    baths: 3.5,
    sqft: 2_800,
    type: "Townhouse",
    yearBuilt: 1885,
    lotSqft: 1_900,
    heating: "Radiator",
    taxes: 14_200,
    badge: "Price Cut",
    photos: [
      photo("1600047509807-ba8f99d2cdde"),
      photo("1600585154340-be6161a56a0c"),
    ],
    about: [],
    pin: { x: 44, y: 54 },
    pinLabel: "Fort Greene",
    isDemoDeal: false,
    marketplace: false,
    status: "live",
    offerBuyerAgentPercent: 0,
    stagingLabels: [],
    syndication: [],
  },
  {
    id: "homepage-showcase-7",
    title: "SoHo Loft",
    address: "812 Mercer Street",
    neighborhood: "SoHo",
    borough: "Manhattan",
    city: "New York",
    state: "NY",
    zip: "10012",
    price: 5_400_000,
    beds: 3,
    baths: 3,
    sqft: 2_650,
    type: "Loft",
    yearBuilt: 1890,
    lotSqft: 0,
    heating: "Central",
    taxes: 36_000,
    photos: [
      photo("1493809842364-78817add7ffb"),
      photo("1600210492486-724fe5c67fb0"),
    ],
    about: [],
    pin: { x: 39, y: 46 },
    pinLabel: "SoHo",
    isDemoDeal: false,
    marketplace: false,
    status: "live",
    offerBuyerAgentPercent: 0,
    stagingLabels: [],
    syndication: [],
  },
  {
    id: "homepage-showcase-8",
    title: "Carroll Gardens Garden Duplex",
    address: "1904 President Street",
    neighborhood: "Carroll Gardens",
    borough: "Brooklyn",
    city: "New York",
    state: "NY",
    zip: "11231",
    price: 2_185_000,
    beds: 3,
    baths: 2,
    sqft: 1_720,
    type: "Condo",
    yearBuilt: 2008,
    lotSqft: 0,
    heating: "Central",
    taxes: 8_900,
    badge: "New Listing",
    photos: [
      photo("1605276374104-dee2a0ed3cd6"),
      photo("1600566753086-00f18fb6b3ea"),
    ],
    about: [],
    pin: { x: 43, y: 57 },
    pinLabel: "Carroll Gardens",
    isDemoDeal: false,
    marketplace: false,
    status: "live",
    offerBuyerAgentPercent: 0,
    stagingLabels: [],
    syndication: [],
  },
  {
    id: "homepage-showcase-9",
    title: "Chelsea High-Floor Condo",
    address: "8801 West 28th Street",
    neighborhood: "Chelsea",
    borough: "Manhattan",
    city: "New York",
    state: "NY",
    zip: "10001",
    price: 3_650_000,
    beds: 2,
    baths: 2.5,
    sqft: 1_480,
    type: "Condo",
    yearBuilt: 2017,
    lotSqft: 0,
    heating: "Central",
    taxes: 24_800,
    badge: "Price Cut",
    photos: [
      photo("1512917774080-9991f1c4c750"),
      photo("1600607687939-ce8a6c25118c"),
    ],
    about: [],
    pin: { x: 37, y: 45 },
    pinLabel: "Chelsea",
    isDemoDeal: false,
    marketplace: false,
    status: "live",
    offerBuyerAgentPercent: 0,
    stagingLabels: [],
    syndication: [],
  },
  {
    id: "homepage-showcase-10",
    title: "Ditmas Park Victorian",
    address: "7420 Rugby Road",
    neighborhood: "Ditmas Park",
    borough: "Brooklyn",
    city: "New York",
    state: "NY",
    zip: "11226",
    price: 1_895_000,
    beds: 5,
    baths: 3,
    sqft: 3_050,
    type: "House",
    yearBuilt: 1905,
    lotSqft: 4_000,
    heating: "Radiator",
    taxes: 11_200,
    photos: [
      photo("1570129477492-45c003edd2be"),
      photo("1600585154526-990dced4db0d"),
    ],
    about: [],
    pin: { x: 46, y: 62 },
    pinLabel: "Ditmas Park",
    isDemoDeal: false,
    marketplace: false,
    status: "live",
    offerBuyerAgentPercent: 0,
    stagingLabels: [],
    syndication: [],
  },
];

export function HomeHero() {
  const featured = HOMEPAGE_SHOWCASE;
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [fade, setFade] = useState({ left: false, right: true });

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;

    function pose() {
      if (!el) return;
      const mid = el.getBoundingClientRect().left + el.clientWidth / 2;
      el.querySelectorAll<HTMLElement>("[data-fan-card]").forEach((card) => {
        if (reduced) {
          card.style.transform = "";
          card.style.zIndex = "";
          return;
        }
        const box = card.getBoundingClientRect();
        const dx = (box.left + box.width / 2 - mid) / (box.width || 1);
        const rotate = Math.max(-12, Math.min(12, dx * 7));
        const y = Math.min(28, Math.abs(dx) * 18);
        card.style.transform = `rotate(${rotate}deg) translateY(${y}px)`;
        card.style.zIndex = String(Math.round(12 - Math.abs(dx) * 3));
      });
    }

    function update() {
      if (!el) return;
      const max = el.scrollWidth - el.clientWidth;
      setFade({
        left: el.scrollLeft > 4,
        right: max > 4 && el.scrollLeft < max - 4,
      });
      pose();
    }

    function onScroll() {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        update();
      });
    }

    function onWheel(event: WheelEvent) {
      if (!el) return;
      // Native horizontal pans keep their own behavior.
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;

      const max = el.scrollWidth - el.clientWidth;
      if (max <= 4) return;

      const atStart = el.scrollLeft <= 1;
      const atEnd = el.scrollLeft >= max - 1;
      const scrollingDown = event.deltaY > 0;
      const scrollingUp = event.deltaY < 0;

      // At the end of the fan in this direction → page scroll.
      // Otherwise vertical wheel always moves / reverses the cards.
      if ((scrollingDown && atEnd) || (scrollingUp && atStart)) return;

      event.preventDefault();
      el.scrollLeft += event.deltaY;
    }

    update();
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("resize", onScroll);
    const observer = new ResizeObserver(onScroll);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("wheel", onWheel);
      window.removeEventListener("resize", onScroll);
      observer.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [featured.length]);

  const hasFan = featured.length > 0;

  return (
    <section className="bg-cream">
      <div className="flex min-h-[calc(100svh-3.5rem)] flex-col justify-center pb-14 pt-11 lg:pb-16 lg:pt-14">
        <h1 className="sr-only">The modern way to buy & sell a home</h1>
        <p
          aria-hidden="true"
          className="relative z-30 px-4 text-center font-sans text-[2.75rem] font-semibold leading-[0.88] tracking-[-0.04em] text-forest pointer-events-none sm:text-6xl lg:px-8 lg:text-[7.25rem]"
        >
          The modern way to
        </p>

        {hasFan ? (
          <div className="relative z-20 mt-1 sm:-mt-1 lg:-mt-2">
            <div
              ref={scrollerRef}
              className="hide-scrollbar overflow-x-auto overscroll-x-contain touch-pan-x px-16 lg:px-24"
            >
              {/* Extra bottom padding so fanned rotate/translateY cards are not clipped. */}
              <div className="flex snap-x snap-mandatory items-end gap-3 pb-24 pt-7 sm:pb-28">
                {featured.map((home) => (
                  <div
                    key={home.id}
                    data-fan-card
                    className="w-[16.5rem] shrink-0 origin-bottom snap-center sm:w-[18rem]"
                  >
                    <PropertyCard listing={home} linked={false} />
                  </div>
                ))}
              </div>
            </div>
            <div
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-cream to-transparent transition-opacity duration-200 sm:w-24",
                fade.left ? "opacity-100" : "opacity-0",
              )}
            />
            <div
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-cream to-transparent transition-opacity duration-200 sm:w-24",
                fade.right ? "opacity-100" : "opacity-0",
              )}
            />
          </div>
        ) : null}

        <p
          aria-hidden="true"
          className={cn(
            "relative z-30 px-4 text-center font-sans text-[2.75rem] font-semibold leading-[0.88] tracking-[-0.04em] text-forest pointer-events-none sm:text-6xl lg:px-8 lg:text-[7.25rem]",
            hasFan ? "-mt-14 sm:-mt-16 lg:-mt-20" : "mt-1 sm:mt-2",
          )}
        >
          buy & sell a home
        </p>

        <div className="mt-8 flex justify-center px-4 lg:mt-10">
          <HomeSearchBar />
        </div>
      </div>
    </section>
  );
}

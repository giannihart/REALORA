"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { NycSkylineMark } from "@/components/brand/NycSkylineMark";
import { NetSheetCalculator } from "@/components/sell/NetSheetCalculator";
import { cn, formatPrice } from "@/lib/format";

type FooterLink = { href: string; label: string };
type SocialLink = FooterLink & { src: string };

const SOCIAL_LINKS: SocialLink[] = [
  { href: "https://www.instagram.com/realora", label: "Instagram", src: "/social-instagram.png?v=3" },
  { href: "https://www.linkedin.com/company/realora", label: "LinkedIn", src: "/social-linkedin.png?v=2" },
  { href: "https://www.facebook.com/realora", label: "Facebook", src: "/social-facebook.png?v=2" },
];

const FOOTER_NAV: FooterLink[] = [
  { href: "/buy", label: "Buy" },
  { href: "/sell", label: "Sell" },
  { href: "/savings", label: "Calculate savings" },
  { href: "/mortgage", label: "Get a mortgage" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/portal", label: "Portal" },
  { href: "/auth?mode=signup", label: "Sign up" },
];

const LEGAL_LINKS: FooterLink[] = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/fair-housing", label: "Fair Housing" },
  { href: "/accessibility", label: "Accessibility" },
];

const LICENSING =
  "REALORA is in formation and is not yet a licensed New York real estate broker. Brokerage services, if any, will be provided only once licensed or through a licensed broker partner.";

const ESTIMATES =
  "Listing information and any home-value or savings figures shown on this site are estimates provided for illustration. They are not an appraisal, a guarantee of sale price, or a guarantee that an offer will be made or accepted.";

const FAIR_HOUSING =
  "REALORA supports Equal Housing Opportunity. We encourage and support an affirmative advertising and marketing program in which there are no barriers to obtaining housing because of race, color, religion, sex, handicap, familial status, or national origin.";

const BENEFIT_PHOTO = "/footer-west-village.jpg";

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime";

export function SiteFooter({ inColumn = false }: { inColumn?: boolean }) {
  const pathname = usePathname();
  const [price, setPrice] = useState(5_600_000);
  if (pathname.startsWith("/portal") || pathname.startsWith("/auth")) return null;
  if (!inColumn && pathname === "/buy") return null;

  const keep = Math.round(price * 0.045);
  const showBenefits = pathname === "/";
  const navLink = cn(
    "inline-flex items-center rounded-full px-3 py-1.5 text-sm font-medium text-cream transition hover:bg-warm hover:text-forest",
    focusRing,
  );

  return (
    <footer
      className={
        inColumn
          ? "overflow-x-hidden bg-cream pt-6"
          : "overflow-x-hidden bg-cream px-3 pb-3 pt-8 sm:px-5 sm:pb-5 md:px-6 md:pb-6 md:pt-10"
      }
    >
      <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-3">
        {showBenefits ? (
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="relative flex min-h-[22rem] flex-col justify-start overflow-hidden rounded-[28px] bg-lime p-6 pt-12 sm:min-h-[26rem] sm:p-8 sm:pt-16 md:p-10 md:pt-20">
              <NycSkylineMark className="pointer-events-none absolute bottom-0 left-0 aspect-[1850/332] w-full text-forest/20" />
              <div className="relative z-[1] max-w-md">
                <h2 className="text-[2rem] font-semibold leading-[1.1] tracking-tight text-forest sm:text-[2.35rem] md:text-[2.5rem]">
                  <span className="whitespace-nowrap">
                    Sell for 1%. Keep {formatPrice(keep)}
                  </span>{" "}
                  more with Realora.
                </h2>
                <p className="mt-4 text-[15px] leading-6 text-forest/80">
                  A traditional brokerage takes about 5.5%. REALORA is only 1%, handling the sale from listing to close.
                </p>
                <Link
                  href="/sell"
                  className={cn(
                    "mt-8 inline-flex h-12 items-center gap-1.5 rounded-full bg-forest py-0 pl-5 pr-1.5 text-sm font-medium text-cream transition hover:bg-forest-deep",
                    focusRing,
                  )}
                >
                  Sell with Realora today
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-lime text-forest">
                    <ArrowUpRight size={14} strokeWidth={2.2} />
                  </span>
                </Link>
              </div>
            </div>

            <div className="relative flex min-h-[22rem] flex-col justify-end overflow-hidden rounded-[28px] sm:min-h-[26rem]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={BENEFIT_PHOTO}
                alt="West Village townhouses on a tree-lined street"
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-forest/10" />
              <p className="absolute left-5 top-5 z-[2] inline-flex rounded-full bg-lime px-3 py-1 text-xs font-medium tracking-[0.04em] text-forest sm:left-8 sm:top-8">
                Estimate your Net Sheet
              </p>
              <div className="relative z-[1] p-5 sm:p-8">
                <div className="rounded-[24px] bg-cream/95 p-4 shadow-xl backdrop-blur-md sm:p-5">
                  <NetSheetCalculator
                    compact
                    price={price}
                    onPriceChange={setPrice}
                    showAskingPrice={false}
                    showPlusOne={false}
                    showKeepLine={false}
                  />
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <div className="overflow-hidden rounded-[28px] bg-forest-deep text-cream">
          <div className="px-6 pt-8 sm:px-8 sm:pt-10 md:px-12 md:pt-12">
            <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <nav aria-label="Footer">
                  <ul className="flex flex-wrap items-center gap-x-1 gap-y-2">
                    {FOOTER_NAV.map((item) => (
                      <li key={`${item.href}-${item.label}`}>
                        <Link href={item.href} className={navLink}>
                          {item.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </nav>
              </div>
              <nav aria-label="Social" className="lg:pt-1">
                <ul className="flex items-center gap-2">
                  {SOCIAL_LINKS.map((item) => (
                    <li key={item.href}>
                      <a
                        href={item.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={item.label}
                        className={cn(
                          "flex h-10 w-10 items-center justify-center text-cream transition hover:text-lime",
                          focusRing,
                        )}
                      >
                        <span
                          aria-hidden
                          className="block h-6 w-6 bg-current"
                          style={{
                            maskImage: `url(${item.src})`,
                            WebkitMaskImage: `url(${item.src})`,
                            maskSize: "contain",
                            WebkitMaskSize: "contain",
                            maskRepeat: "no-repeat",
                            WebkitMaskRepeat: "no-repeat",
                            maskPosition: "center",
                            WebkitMaskPosition: "center",
                          }}
                        />
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            </div>

            <div className="mt-8 border-t border-white/[0.12] pt-8">
              <div className="space-y-3 text-[13px] leading-[1.6] text-cream/60">
                <p>{LICENSING}</p>
                <p>{ESTIMATES}</p>
                <p>{FAIR_HOUSING}</p>
              </div>
            </div>

            <div className="mt-8 flex flex-col gap-3 border-t border-white/[0.12] pt-6 text-[13px] text-cream/50 sm:flex-row sm:items-center sm:justify-between">
              <p>© 2026 REALORA. All rights reserved.</p>
              <nav aria-label="Legal">
                <ul className="flex flex-wrap gap-x-4 gap-y-2">
                  {LEGAL_LINKS.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={cn("text-cream/70 transition hover:text-cream", focusRing)}
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            </div>
          </div>

          {/* Oversized neon wordmark, clipped at mid-letter. */}
          <div className="relative mt-10 aspect-[10/1] w-full overflow-hidden" aria-hidden>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/realoralogo-lime.svg"
              alt=""
              className={cn(
                "pointer-events-none absolute top-0 h-[200%] w-auto max-w-none -translate-x-1/2 origin-top select-none",
                inColumn ? "left-[50.5%] scale-[1.01]" : "left-1/2 scale-[0.97]",
              )}
            />
          </div>
        </div>
      </div>
    </footer>
  );
}

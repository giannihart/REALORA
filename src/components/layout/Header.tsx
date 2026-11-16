"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAppData } from "@/lib/data/use-app-data";
import { cn } from "@/lib/format";

const links = [
  { href: "/buy", label: "Buy" },
  { href: "/sell", label: "Sell" },
  { href: "/savings", label: "Calculate savings" },
  { href: "/mortgage", label: "Get a mortgage" },
  { href: "/how-it-works", label: "How it works" },
];

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const signedIn = useAppData((s) => s.user.signedIn);

  function openPortal() {
    if (signedIn) {
      router.push("/portal");
      return;
    }
    router.push(`/auth?next=${encodeURIComponent("/portal")}`);
  }

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-cream/95 backdrop-blur">
      <div className="flex h-14 items-center justify-between gap-4 px-4 lg:px-6">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center" aria-label="Realora home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/realoralogo.svg"
              alt="Realora"
              className="h-7 w-auto sm:h-8"
            />
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {links.map((l) => {
              const active =
                l.href === "/buy"
                  ? pathname === "/buy" || pathname.startsWith("/listing")
                  : pathname.startsWith(l.href);
              const hoverIcon =
                l.href === "/buy"
                  ? "/buy-house.png"
                  : l.href === "/sell"
                    ? "/sell-sign-icon.png"
                    : l.href === "/mortgage"
                      ? "/mortgage-bank-v8.png"
                      : l.href === "/savings"
                        ? "/savings-calculator.png"
                        : l.href === "/how-it-works"
                          ? "/how-it-works-magnifier-v3.png"
                          : null;
              return (
                <button
                  key={l.href}
                  onClick={() => {
                    router.push(l.href);
                  }}
                  className={cn(
                    "group inline-flex items-center rounded-full px-3 py-1.5 text-sm font-medium",
                    active
                      ? "bg-lime text-forest"
                      : "text-forest hover:bg-warm",
                  )}
                >
                  {l.label}
                  {hoverIcon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={hoverIcon}
                      alt=""
                      aria-hidden
                      className="ml-0 h-6 w-0 object-contain opacity-0 transition-[margin,width,opacity] duration-200 group-hover:ml-1.5 group-hover:w-6 group-hover:opacity-100"
                    />
                  ) : null}
                </button>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={openPortal} className="h-9 gap-1.5 py-0 pl-3.5 pr-1">
            Portal
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-lime text-forest">
              <ArrowUpRight size={13} />
            </span>
          </Button>
          <Button href="/auth?mode=signup" variant="ghost" className="h-9 py-0">
            Sign up
          </Button>
        </div>
      </div>
    </header>
  );
}

"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ClipboardList,
  FileText,
  Home,
  LayoutDashboard,
  ListChecks,
  LogOut,
  MessageSquare,
  Scale,
  Tag,
  Users,
  Wallet,
} from "lucide-react";
import { resolveFinancingPath } from "@/lib/buyer-readiness";
import { documentRequestsFor } from "@/lib/documents/requests";
import { cn } from "@/lib/format";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/ui/Button";
import { useAppData } from "@/lib/data/use-app-data";
import type { Role } from "@/lib/types";

const buyerNav = [
  { href: "/portal/buyer", label: "Home", icon: LayoutDashboard },
  { href: "/portal/buyer/services", label: "Services", icon: Users },
  { href: "/portal/buyer/documents", label: "Documents", icon: FileText },
  { href: "/portal/buyer/financing", label: "Financing", icon: Wallet },
  { href: "/portal/buyer/progress", label: "Progress", icon: ClipboardList },
  { href: "/portal/buyer/messages", label: "Messages", icon: MessageSquare },
];

const brokerNav = [
  { href: "/portal/broker", label: "Overview", icon: LayoutDashboard },
  { href: "/portal/broker/approvals", label: "Approvals", icon: ListChecks },
  { href: "/portal/broker/deals", label: "Deals", icon: Scale },
  { href: "/portal/broker/scorecard", label: "Scorecard", icon: ClipboardList },
];

const sellerNav = [
  { href: "/portal/seller", label: "Home", icon: LayoutDashboard },
  { href: "/portal/seller/listing", label: "Listing", icon: Home },
  { href: "/portal/seller/offers", label: "Offers", icon: Tag },
  { href: "/portal/seller/services", label: "Services", icon: Users },
  { href: "/portal/seller/documents", label: "Documents", icon: FileText },
  { href: "/portal/seller/progress", label: "Progress", icon: ClipboardList },
  { href: "/portal/seller/messages", label: "Messages", icon: MessageSquare },
];

export function PortalShell({
  role,
  chrome,
  children,
}: {
  role: Role;
  chrome?: "buyer" | "seller" | "broker";
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const setRole = useAppData((s) => s.setRole);
  const canSwitchRoles = useAppData((s) => s.canSwitchRoles !== false);
  const signOut = useAppData((s) => s.signOut);
  const deal = useAppData((s) => s.deal);
  const dealId = useAppData((s) => s.dealId);
  const documents = useAppData((s) => s.documents);
  const financingPathPref = useAppData((s) => s.user.financingPath);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const mode = chrome ?? role;
  const links = mode === "broker" ? brokerNav : mode === "buyer" ? buyerNav : sellerNav;
  const homeHref = mode === "broker" ? "/portal/broker" : `/portal/${role}`;
  const profileHref =
    mode === "broker" ? "/portal/broker/profile" : `/portal/${role}/profile`;
  const label =
    mode === "broker"
      ? "Broker Portal"
      : role === "buyer"
        ? "Buyer Portal"
        : "Seller Portal";
  const documentsHref =
    mode === "broker" ? null : `/portal/${role === "buyer" ? "buyer" : "seller"}/documents`;
  const profileActive =
    pathname === profileHref || pathname.startsWith(`${profileHref}/`);

  async function onLogout() {
    setLogoutBusy(true);
    try {
      await signOut();
      router.push("/");
      router.refresh();
    } finally {
      setLogoutBusy(false);
    }
  }

  // Match DocumentVault: badge = docs that show the "Needed" label (current next only).
  const neededDocs = useMemo(() => {
    if (mode === "broker") return 0;
    const portalRole = role === "buyer" ? "buyer" : "seller";
    const base = documentRequestsFor(portalRole, deal, documents);
    if (portalRole !== "buyer" || dealId) return base.next ? 1 : 0;
    const path = resolveFinancingPath({
      prefsPath: financingPathPref,
      documents,
    });
    const open = [base.next, ...base.upcoming].filter(Boolean);
    const financing = open.filter((r) => {
      if (!r || (r.id !== "proof-of-funds" && r.id !== "pre-approval")) return false;
      if (!path) return true;
      return path === "cash" ? r.id === "proof-of-funds" : r.id === "pre-approval";
    });
    return financing[0] ? 1 : 0;
  }, [mode, role, deal, documents, dealId, financingPathPref]);

  return (
    <div className="min-h-[calc(100vh-56px)] bg-cream md:h-[calc(100vh-56px)] md:overflow-hidden">
      <div className="flex md:h-full">
        <aside className="hidden h-full w-[220px] shrink-0 flex-col gap-1 overflow-y-auto border-r border-line p-4 md:flex">
          <p className="px-3 pb-3 text-xs font-medium tracking-[0.04em] text-muted">
            {label}
          </p>
          {links.map((l) => {
            const Icon = l.icon;
            const active =
              pathname === l.href ||
              (l.href !== homeHref && pathname.startsWith(l.href));
            const showBadge = documentsHref === l.href && neededDocs > 0;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition",
                  active
                    ? "bg-forest text-cream"
                    : "text-forest hover:bg-warm",
                )}
              >
                <Icon size={16} className="shrink-0 opacity-100" />
                <span className="min-w-0 flex-1">{l.label}</span>
                {showBadge ? (
                  <span
                    className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-lime px-1.5 text-xs font-medium tabular-nums text-forest"
                    aria-label={`${neededDocs} document${neededDocs === 1 ? "" : "s"} needed`}
                  >
                    {neededDocs > 9 ? "9+" : neededDocs}
                  </span>
                ) : null}
              </Link>
            );
          })}
          <div className="mt-auto pt-4">
            <div className="flex items-center gap-1">
              <Link
                href={profileHref}
                className={cn(
                  "flex min-w-0 flex-1 items-center rounded-xl px-3 py-2.5 text-sm font-medium transition",
                  profileActive
                    ? "bg-forest text-cream"
                    : "text-forest hover:bg-warm",
                )}
              >
                Profile
              </Link>
              <button
                type="button"
                disabled={logoutBusy}
                onClick={() => setLogoutOpen(true)}
                aria-label={logoutBusy ? "Signing out" : "Log out"}
                title="Log out"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-forest transition hover:bg-warm disabled:opacity-50"
              >
                <LogOut size={16} />
              </button>
            </div>
            {mode !== "broker" && canSwitchRoles ? (
              <Button
                href={role === "buyer" ? "/sell" : "/portal/buyer"}
                variant="outline"
                className="mt-2 w-full rounded-xl"
                onClick={() => setRole(role === "buyer" ? "seller" : "buyer")}
              >
                Switch to {role === "buyer" ? "seller" : "buyer"}
              </Button>
            ) : null}
          </div>
        </aside>

        <div className="min-w-0 flex-1 md:min-h-0 md:overflow-y-auto">
          <div className="flex gap-1 overflow-x-auto border-b border-line bg-cream px-3 py-2 md:hidden">
            {links.map((l) => {
              const active = pathname === l.href;
              const showBadge = documentsHref === l.href && neededDocs > 0;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium",
                    active ? "bg-forest text-cream" : "bg-warm text-forest",
                  )}
                >
                  {l.label}
                  {showBadge ? (
                    <span
                      className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-lime px-1 text-xs font-medium tabular-nums text-forest"
                      aria-label={`${neededDocs} document${neededDocs === 1 ? "" : "s"} needed`}
                    >
                      {neededDocs > 9 ? "9+" : neededDocs}
                    </span>
                  ) : null}
                </Link>
              );
            })}
            <Link
              href={profileHref}
              className={cn(
                "inline-flex shrink-0 items-center rounded-full px-3 py-1.5 text-xs font-medium",
                profileActive ? "bg-forest text-cream" : "bg-warm text-forest",
              )}
            >
              Profile
            </Link>
          </div>
          <div className="px-4 py-6 lg:px-8">{children}</div>
        </div>
      </div>

      <ConfirmDialog
        open={logoutOpen}
        onOpenChange={setLogoutOpen}
        title="Log out?"
        body="You’ll need to sign in again to get back to your portal."
        confirmLabel={logoutBusy ? "Signing out…" : "Log out"}
        onConfirm={() => {
          void onLogout();
        }}
      />
    </div>
  );
}

export function PortalSidebar({ role }: { role: Role }) {
  void role;
  return null;
}

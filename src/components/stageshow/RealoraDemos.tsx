"use client";

import type { ReactNode } from "react";
import {
  Avatar,
  Bar,
  Badge,
  Row,
  Stage,
  Text,
  Window,
} from "@/components/stageshow/kit";
import "@/components/stageshow/kit/stageshow.css";
import "@/components/stageshow/realora.css";

const BUYER_NAV = ["Home", "Services", "Documents", "Financing", "Progress", "Messages"];
const SELLER_NAV = ["Home", "Listing", "Offers", "Documents", "Progress", "Messages"];

function PortalChrome({
  nav,
  active,
  children,
  title = "Buyer Portal",
}: {
  nav: string[];
  active: number;
  children: ReactNode;
  title?: string;
}) {
  return (
    <Window
      className="rr-window"
      title={title}
      sidebarWidth={118}
      sidebar={
        <>
          <Bar w={56} h={8} r={4} tone={4} style={{ marginBottom: 10, marginLeft: 6 }} />
          {nav.map((label, i) => (
            <div key={label} className="rr-nav" data-on={i === active || undefined}>
              <Bar w={10} h={10} r={3} tone={i === active ? 5 : 3} />
              <Text className="rr-nav__label">{label}</Text>
            </div>
          ))}
        </>
      }
    >
      <div className="rr-main">{children}</div>
    </Window>
  );
}

function Frame({
  children,
  width = 420,
  height = 300,
  className,
}: {
  children: ReactNode;
  width?: number;
  height?: number;
  className?: string;
}) {
  return (
    <Stage
      width={width}
      height={height}
      compact={{ below: 400, width: 358, height: height - 10 }}
      className={`look-realora rr-stage ${className ?? ""}`}
      theme="light"
      palette="accent"
      fidelity="standard"
    >
      {() => children}
    </Stage>
  );
}

/** Buyer portal — next step card (identity / financing). */
export function PortalHomeDemo() {
  return (
    <Frame>
      <PortalChrome nav={BUYER_NAV} active={0}>
        <Text className="rr-title">Get offer-ready</Text>
        <div className="rr-card rr-card-dark">
          <Text className="rr-eyebrow">Your next step</Text>
          <Text className="rr-card-title">Verify your identity</Text>
          <Text className="rr-card-body">
            Sellers see verified buyers first — this is part of your offer.
          </Text>
          <span className="rr-pill">Verify identity</span>
        </div>
        <div className="rr-list">
          <Row
            pad={0}
            className="rr-row"
            lead={<Bar w={18} h={18} r={9} tone={2} />}
            title={<Text className="rr-name">Prove your financing</Text>}
          >
            <Bar w={52} tone={2} />
          </Row>
          <Row
            pad={0}
            className="rr-row"
            lead={<Bar w={18} h={18} r={9} tone={2} />}
            title={<Bar w={88} tone={3} />}
          >
            <Bar w={40} tone={2} />
          </Row>
        </div>
      </PortalChrome>
    </Frame>
  );
}

/** Documents vault. */
export function DocumentsDemo() {
  return (
    <Frame>
      <PortalChrome nav={BUYER_NAV} active={2}>
        <Text className="rr-title">Documents</Text>
        <div className="rr-card" style={{ marginTop: 12 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            <span className="rr-chip" data-on>
              All
            </span>
            <span className="rr-chip">Contract</span>
            <span className="rr-chip">Closing</span>
          </div>
          <div className="rr-list" style={{ marginTop: 0 }}>
            <Row
              pad={0}
              className="rr-row"
              selected
              lead={<Bar w={18} h={18} r={4} tone={4} />}
              title={<Text className="rr-name">Pre-approval letter</Text>}
            >
              <span className="rr-badge">Needed</span>
            </Row>
            <Row
              pad={0}
              className="rr-row"
              lead={<Bar w={18} h={18} r={4} tone={2} />}
              title={<Text className="rr-meta">ID verification</Text>}
            >
              <Bar w={44} tone={2} />
            </Row>
            <Row
              pad={0}
              className="rr-row"
              lead={<Bar w={18} h={18} r={4} tone={2} />}
              title={<Bar w={96} tone={3} />}
            >
              <Bar w={36} tone={2} />
            </Row>
          </div>
        </div>
      </PortalChrome>
    </Frame>
  );
}

/** Offer comparison. */
export function OffersDemo() {
  return (
    <Frame>
      <PortalChrome nav={SELLER_NAV} active={2} title="Seller Portal">
        <Text className="rr-title">Offers</Text>
        <Text className="rr-sub">3 live · ranked by net</Text>
        <div className="rr-list">
          <Row
            pad={0}
            className="rr-row"
            selected
            lead={<Avatar name="Verified Buyer" tone="accent" size={18} />}
            title={
              <div>
                <Text className="rr-name">Verified cash</Text>
                <Text className="rr-meta">ID · funds verified</Text>
              </div>
            }
          >
            <div style={{ textAlign: "right" }}>
              <Text className="rr-amount">$4.15M</Text>
              <div style={{ marginTop: 4 }}>
                <span className="rr-badge">Strongest</span>
              </div>
            </div>
          </Row>
          <Row
            pad={0}
            className="rr-row"
            lead={<Avatar name="Pre-approved" tone="ink" size={18} />}
            title={
              <div>
                <Text className="rr-name">Pre-approved</Text>
                <Text className="rr-meta">Conventional · 20%</Text>
              </div>
            }
          >
            <Text className="rr-amount">$4.08M</Text>
          </Row>
          <Row
            pad={0}
            className="rr-row"
            lead={<Bar w={18} h={18} r={9} tone={2} />}
            title={<Bar w={72} tone={3} />}
          >
            <Bar w={48} tone={2} />
          </Row>
        </div>
      </PortalChrome>
    </Frame>
  );
}

/** Net sheet / keep number. */
export function NetSheetDemo() {
  return (
    <Frame width={400} height={280}>
      <div
        className="rr-window"
        style={{
          left: 28,
          top: 24,
          width: 340,
          height: 240,
          padding: 20,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Text className="rr-sub">Estimate your Net Sheet</Text>
        <Text className="rr-stat" style={{ marginTop: 12 }}>
          $188,550
        </Text>
        <Text className="rr-stat-label">You keep more with Realora 1%</Text>
        <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <Text className="rr-meta">Traditional ~5.5%</Text>
            <Text className="rr-meta">$230,450</Text>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <Text className="rr-name">REALORA 1%</Text>
            <Text className="rr-amount">$41,900</Text>
          </div>
        </div>
        <span className="rr-pill" style={{ marginTop: "auto", alignSelf: "flex-start" }}>
          Sell with Realora
        </span>
      </div>
    </Frame>
  );
}

/** Buying power. */
export function BuyingPowerDemo() {
  return (
    <Frame width={400} height={260}>
      <div
        className="rr-window"
        style={{
          left: 28,
          top: 24,
          width: 340,
          height: 220,
          padding: 20,
        }}
      >
        <Text className="rr-sub">Estimated buying power</Text>
        <Text className="rr-stat" style={{ marginTop: 10 }}>
          $2.4M
        </Text>
        <Text className="rr-stat-label">Homes in range are marked for you</Text>
        <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
          <Bar w={90} h={8} r={4} tone={3} />
          <Bar w={64} h={8} r={4} tone={2} />
        </div>
        <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
          <Bar w={72} h={8} r={4} tone={2} />
          <Bar w={110} h={8} r={4} tone={3} />
        </div>
      </div>
    </Frame>
  );
}

/** Identity verification. */
export function VerifyDemo() {
  return (
    <Frame>
      <PortalChrome nav={BUYER_NAV} active={0}>
        <Text className="rr-title">Verification</Text>
        <div className="rr-card rr-card-dark">
          <Text className="rr-eyebrow">Platform confirmed</Text>
          <Text className="rr-card-title">Identity verified</Text>
          <Text className="rr-card-body">
            Confirmed through Realora — never a self-attested checkbox.
          </Text>
        </div>
        <div className="rr-list">
          <Row
            pad={0}
            className="rr-row"
            lead={<Bar w={18} h={18} r={9} tone={4} />}
            title={<Text className="rr-name">Funds</Text>}
          >
            <Badge>In review</Badge>
          </Row>
          <Row
            pad={0}
            className="rr-row"
            lead={<Bar w={18} h={18} r={9} tone={2} />}
            title={<Bar w={70} tone={3} />}
          >
            <Bar w={40} tone={2} />
          </Row>
        </div>
      </PortalChrome>
    </Frame>
  );
}

/** Financing milestones. */
export function FinancingDemo() {
  return (
    <Frame>
      <PortalChrome nav={BUYER_NAV} active={3}>
        <Text className="rr-title">Financing</Text>
        <Text className="rr-sub">How you&apos;re paying — and what sellers can see</Text>
        <div className="rr-list">
          {[
            { title: "Application", badge: "Now", on: true },
            { title: "Appraisal", badge: "Up next", on: false },
            { title: "Underwriting", badge: "In 3 steps", on: false },
            { title: "Clear to close", badge: "In 5 steps", on: false },
          ].map((row) => (
            <Row
              key={row.title}
              pad={0}
              className="rr-row"
              selected={row.on}
              lead={
                <div
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 9,
                    background: row.on ? "#102c25" : "var(--ss-well)",
                    color: row.on ? "#fbf6f3" : "var(--ss-text)",
                    fontSize: 9,
                    fontWeight: 600,
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  {row.on ? "1" : ""}
                </div>
              }
              title={<Text className="rr-name">{row.title}</Text>}
            >
              {row.on ? (
                <span
                  className="rr-badge"
                  style={{ background: "#102c25", color: "#fbf6f3" }}
                >
                  Now
                </span>
              ) : (
                <span className="rr-chip">{row.badge}</span>
              )}
            </Row>
          ))}
        </div>
      </PortalChrome>
    </Frame>
  );
}

/** Marketplace / listing live. */
export function MarketplaceDemo() {
  return (
    <Frame width={440} height={300}>
      <div
        className="rr-window"
        style={{
          left: 24,
          top: 20,
          width: 480,
          height: 300,
          padding: 16,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Text className="rr-title">Brooklyn</Text>
          <Bar w={72} h={24} r={12} tone={2} />
        </div>
        <div style={{ marginTop: 14, display: "flex", gap: 12 }}>
          <div
            style={{
              width: 148,
              borderRadius: 14,
              border: "1px solid var(--ss-line)",
              overflow: "hidden",
              background: "var(--ss-surface)",
            }}
          >
            <Bar w={148} h={90} r={0} tone={3} />
            <div style={{ padding: "10px 12px" }}>
              <Text className="rr-amount">$3.2M</Text>
              <Text className="rr-meta">3 bd · 2 ba</Text>
            </div>
          </div>
          <div
            style={{
              width: 148,
              borderRadius: 14,
              border: "1px solid var(--ss-line)",
              overflow: "hidden",
              background: "var(--ss-surface)",
            }}
          >
            <Bar w={148} h={90} r={0} tone={2} />
            <div style={{ padding: "10px 12px" }}>
              <Text className="rr-name">In your range</Text>
              <Text className="rr-meta">Carroll Gardens</Text>
            </div>
          </div>
          <div style={{ width: 100, opacity: 0.55 }}>
            <Bar w={100} h={90} r={12} tone={2} />
            <div style={{ marginTop: 10 }}>
              <Bar w={64} tone={3} />
            </div>
          </div>
        </div>
      </div>
    </Frame>
  );
}

/** Attorney escrow / contract. */
export function EscrowDemo() {
  return (
    <Frame width={400} height={270}>
      <div
        className="rr-window"
        style={{
          left: 28,
          top: 24,
          width: 340,
          height: 230,
          padding: 20,
        }}
      >
        <Text className="rr-sub">Contract coordination</Text>
        <Text className="rr-title" style={{ marginTop: 8 }}>
          Deposit with seller&apos;s attorney
        </Text>
        <Text className="rr-stat-label" style={{ marginTop: 8, maxWidth: 260 }}>
          Realora coordinates both sides. Escrow never sits on the platform.
        </Text>
        <div className="rr-list">
          <Row
            pad={0}
            className="rr-row"
            lead={<Bar w={18} h={18} r={9} tone={4} />}
            title={<Text className="rr-name">Terms approved</Text>}
          >
            <span className="rr-badge">Done</span>
          </Row>
          <Row
            pad={0}
            className="rr-row"
            selected
            lead={<Bar w={18} h={18} r={9} tone={4} />}
            title={<Text className="rr-name">Attorney escrow</Text>}
          >
            <span
              className="rr-badge"
              style={{ background: "#102c25", color: "#fbf6f3" }}
            >
              Now
            </span>
          </Row>
        </div>
      </div>
    </Frame>
  );
}

/** Progress timeline. */
export function ProgressDemo() {
  return (
    <Frame>
      <PortalChrome nav={SELLER_NAV} active={4} title="Seller Portal">
        <Text className="rr-title">My progress</Text>
        <div className="rr-list">
          {[
            { title: "Listed", status: "Done", done: true },
            { title: "Offer accepted", status: "Done", done: true },
            { title: "Contract", status: "Now", now: true },
            { title: "Closing", status: "Up next", done: false },
          ].map((row) => (
            <Row
              key={row.title}
              pad={0}
              className="rr-row"
              selected={row.now}
              lead={<Bar w={18} h={18} r={9} tone={row.done || row.now ? 4 : 2} />}
              title={<Text className="rr-name">{row.title}</Text>}
            >
              {row.now ? (
                <span
                  className="rr-badge"
                  style={{ background: "#102c25", color: "#fbf6f3" }}
                >
                  Now
                </span>
              ) : row.done ? (
                <span className="rr-chip">Done</span>
              ) : (
                <span className="rr-chip">{row.status}</span>
              )}
            </Row>
          ))}
        </div>
      </PortalChrome>
    </Frame>
  );
}

/** Sell intake. */
export function IntakeDemo() {
  return (
    <Frame width={400} height={280}>
      <div
        className="rr-window"
        style={{
          left: 28,
          top: 24,
          width: 340,
          height: 240,
          padding: 20,
        }}
      >
        <Text className="rr-title">Sell with Realora</Text>
        <Text className="rr-sub">Step 1 of 4 · Address</Text>
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <div
            style={{
              height: 36,
              borderRadius: 12,
              border: "1px solid var(--ss-line)",
              background: "var(--ss-canvas)",
              display: "flex",
              alignItems: "center",
              padding: "0 12px",
            }}
          >
            <Text className="rr-meta">402 Perry Street</Text>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Bar w={70} h={36} r={12} tone={2} />
            <Bar w={120} h={36} r={12} tone={2} />
          </div>
        </div>
        <span className="rr-pill" style={{ marginTop: 18 }}>
          Continue
        </span>
      </div>
    </Frame>
  );
}

export const REALORA_DEMOS = [
  { id: "portal-home", label: "Buyer portal", Page: "Portal", Demo: PortalHomeDemo },
  { id: "documents", label: "Documents", Page: "Portal", Demo: DocumentsDemo },
  { id: "offers", label: "Offers", Page: "Portal", Demo: OffersDemo },
  { id: "financing", label: "Financing", Page: "Portal", Demo: FinancingDemo },
  { id: "progress", label: "Progress", Page: "Portal", Demo: ProgressDemo },
  { id: "verify", label: "Verification", Page: "Portal", Demo: VerifyDemo },
  { id: "intake", label: "Sell intake", Page: "Website", Demo: IntakeDemo },
  { id: "net-sheet", label: "Net sheet", Page: "Website", Demo: NetSheetDemo },
  { id: "buying-power", label: "Buying power", Page: "Website", Demo: BuyingPowerDemo },
  { id: "marketplace", label: "Marketplace", Page: "Website", Demo: MarketplaceDemo },
  { id: "escrow", label: "Attorney escrow", Page: "Website", Demo: EscrowDemo },
] as const;

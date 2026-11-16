"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { acknowledgeDesignatedAgencyAction } from "@/lib/actions/disclosure";
import { useAppData } from "@/lib/data/use-app-data";
import type { DesignatedAgencyView } from "@/lib/types";

export function DesignatedAgencyCard({
  dealId,
  agency,
  onOpenDocument,
}: {
  dealId: string;
  agency: DesignatedAgencyView;
  onOpenDocument?: (documentId: string) => void;
}) {
  const applySnapshot = useAppData((s) => s.applySnapshot);
  if (!agency.required || !agency.needsMyAck) return null;

  return (
    <div className="mt-5 rounded-2xl border border-line bg-white p-5">
      <p className="text-xs font-medium text-muted">
        Designated agency
      </p>
      <h3 className="mt-2 text-lg font-semibold text-forest">One brokerage, both sides.</h3>
      <p className="mt-3 text-sm leading-6 text-forest/80">
        Realora represents both sides of this transaction. Under New York&apos;s designated agency
        rules, the broker assigns a different licensed agent to each side, and your agent works
        only for you. What you share stays on your side — the platform enforces that separation,
        and every step is on the record. The full consent document is in your vault; acknowledging
        here confirms you&apos;ve seen it and consent to this arrangement.
      </p>
      {agency.consentDocumentId ? (
        <button
          type="button"
          className="mt-3 text-sm font-medium text-forest underline-offset-2 hover:underline"
          onClick={() => onOpenDocument?.(agency.consentDocumentId!)}
        >
          {agency.consentDocumentName ?? "Open consent document"}
        </button>
      ) : (
        <p className="mt-3 text-xs text-muted">
          The consent document will appear in your vault after you acknowledge, and remains on the
          record for this deal.
        </p>
      )}
      <Button
        variant="lime"
        className="mt-4 rounded-xl"
        onClick={() => {
          void acknowledgeDesignatedAgencyAction(dealId).then((r) => {
            if (!r.ok) {
              toast(r.message);
              return;
            }
            applySnapshot(r.data);
            toast("Designated-agency consent acknowledged.");
          });
        }}
      >
        I understand and consent
      </Button>
    </div>
  );
}

export function ConsentsOverviewLine({ agency }: { agency: DesignatedAgencyView | null }) {
  if (!agency?.required) return null;

  const complete = agency.sellerAck && agency.buyerAck && agency.agentsAssigned;
  if (complete) {
    return (
      <p className="text-xs text-muted">
        <span className="font-medium text-forest/70">Consents</span>
        {" — "}
        complete
      </p>
    );
  }

  const seller = agency.sellerAck ? "Seller ✓" : "Seller · awaiting acknowledgment";
  const buyer = agency.buyerAck ? "Buyer ✓" : "Buyer · awaiting acknowledgment";
  const agents = agency.agentsAssigned
    ? "Designated agents: assigned ✓"
    : "Designated agents · awaiting assignment";

  return (
    <p className="text-xs leading-5 text-muted">
      <span className="font-medium text-forest/70">Consents</span>
      {" — "}
      <span className={agency.sellerAck ? "text-forest/70" : undefined}>{seller}</span>
      {" · "}
      <span className={agency.buyerAck ? "text-forest/70" : undefined}>{buyer}</span>
      {" · "}
      <span className={agency.agentsAssigned ? "text-forest/70" : undefined}>{agents}</span>
    </p>
  );
}

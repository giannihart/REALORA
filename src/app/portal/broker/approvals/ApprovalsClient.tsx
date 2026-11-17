"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { SignatureCapture } from "@/components/esign/SignatureCapture";
import { decideApprovalAction } from "@/lib/actions/approvals";
import {
  executeNativeSignatureAction,
  startListingAgreementCountersignAction,
} from "@/lib/actions/documents";
import type { ApprovalPacket } from "@/lib/actions/broker";

export function ApprovalsClient({
  packets,
  users,
}: {
  packets: ApprovalPacket[];
  users: { id: string; name: string; email: string | null }[];
}) {
  const router = useRouter();
  const [note, setNote] = useState<Record<string, string>>({});
  const [agentSeller, setAgentSeller] = useState<Record<string, string>>({});
  const [agentBuyer, setAgentBuyer] = useState<Record<string, string>>({});
  const [countersignBusy, setCountersignBusy] = useState(false);
  const [capture, setCapture] = useState<{
    documentId: string;
    signerName: string;
  } | null>(null);

  async function decide(
    id: string,
    decision: "approved" | "rejected" | "changes_requested",
    kind: ApprovalPacket["approval"]["kind"],
  ) {
    if (kind === "listing_agreement_countersign" && decision === "approved") {
      toast("Open Countersign to complete the brokerage signature.");
      return;
    }
    const context =
      kind === "designated_agency"
        ? { agent_seller: agentSeller[id], agent_buyer: agentBuyer[id] }
        : undefined;
    const result = await decideApprovalAction(id, decision, {
      note: note[id],
      context,
    });
    if (!result.ok) {
      toast(result.message);
      return;
    }
    toast(
      decision === "approved" ? "Approved." : decision === "rejected" ? "Rejected." : "Changes requested.",
    );
    router.refresh();
  }

  async function openCountersign(packet: ApprovalPacket) {
    const ctx = packet.approval.context;
    const documentId =
      ctx && typeof ctx === "object" && !Array.isArray(ctx) && typeof (ctx as { document_id?: unknown }).document_id === "string"
        ? (ctx as { document_id: string }).document_id
        : packet.documents.find((d) => /listing agreement/i.test(d.name))?.id;
    if (!documentId) {
      toast("Listing agreement document not found.");
      return;
    }
    setCountersignBusy(true);
    try {
      const started = await startListingAgreementCountersignAction(documentId);
      if (!started.ok) {
        toast(started.message);
        return;
      }
      setCapture({
        documentId: started.data.documentId,
        signerName: started.data.signerName,
      });
    } finally {
      setCountersignBusy(false);
    }
  }

  async function submitCountersign(result: {
    pngDataUrl: string;
    method: "draw";
  }) {
    if (!capture) return;
    setCountersignBusy(true);
    try {
      const executed = await executeNativeSignatureAction({
        documentId: capture.documentId,
        roleKey: "brokerage",
        method: result.method,
        pngDataUrl: result.pngDataUrl,
      });
      if (!executed.ok) {
        toast(executed.message);
        return;
      }
      setCapture(null);
      toast("Countersignature recorded.");
      router.refresh();
    } finally {
      setCountersignBusy(false);
    }
  }

  if (!packets.length) {
    return <p className="text-sm text-muted">No pending approvals.</p>;
  }

  return (
    <div className="space-y-5">
      {packets.map((packet) => {
        const a = packet.approval;
        const isCountersign = a.kind === "listing_agreement_countersign";
        return (
          <article key={a.id} className="rounded-2xl border border-line bg-white p-5">
            <p className="text-xs text-muted">{a.kind.replaceAll("_", " ")}</p>
            <h2 className="mt-1 text-lg font-semibold">{packet.address}</h2>
            <p className="mt-1 text-sm text-muted">
              Deal {a.deal_id.slice(0, 8)} · requested by {packet.requestedByName ?? "system"} · {a.status}
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-sm font-medium">Context packet</p>
                <ul className="mt-2 space-y-1 text-sm text-forest/80">
                  <li>State: {packet.deal.state}</li>
                  <li>List: ${(packet.listingPriceCents / 100).toLocaleString()}</li>
                  <li>
                    Trigger: {packet.triggeringEvent?.type ?? "—"}{" "}
                    {packet.triggeringEvent?.created_at
                      ? `at ${packet.triggeringEvent.created_at}`
                      : ""}
                  </li>
                </ul>
                <p className="mt-3 text-sm font-medium">Documents</p>
                <ul className="mt-1 space-y-1 text-sm">
                  {packet.documents.map((doc) => (
                    <li key={doc.id}>
                      {doc.name} · {doc.status}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-sm font-medium">System recommendation</p>
                <pre className="mt-2 overflow-auto rounded-xl bg-warm p-3 text-xs">
                  {packet.recommendation ? JSON.stringify(packet.recommendation, null, 2) : "None"}
                </pre>
                {a.kind === "designated_agency" ? (
                  <div className="mt-3 grid gap-2">
                    <MenuSelect
                      label="Agent seller"
                      value={agentSeller[a.id] ?? ""}
                      placeholder="Select"
                      options={users.map((u) => ({ value: u.id, label: u.name }))}
                      onChange={(id) => setAgentSeller((s) => ({ ...s, [a.id]: id }))}
                    />
                    <MenuSelect
                      label="Agent buyer"
                      value={agentBuyer[a.id] ?? ""}
                      placeholder="Select"
                      options={users.map((u) => ({ value: u.id, label: u.name }))}
                      onChange={(id) => setAgentBuyer((s) => ({ ...s, [a.id]: id }))}
                    />
                  </div>
                ) : null}
                <label className="mt-3 block text-sm">
                  Note
                  <textarea
                    className="mt-1 w-full rounded-xl border border-line px-3 py-2"
                    rows={2}
                    value={note[a.id] ?? ""}
                    onChange={(e) => setNote((s) => ({ ...s, [a.id]: e.target.value }))}
                  />
                </label>
                <div className="mt-3 flex flex-wrap gap-2">
                  {isCountersign ? (
                    <Button
                      className="rounded-xl"
                      disabled={countersignBusy}
                      onClick={() => void openCountersign(packet)}
                    >
                      {countersignBusy ? "Opening…" : "Countersign"}
                    </Button>
                  ) : (
                    <Button className="rounded-xl" onClick={() => void decide(a.id, "approved", a.kind)}>
                      Approve
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    className="rounded-xl"
                    onClick={() => void decide(a.id, "rejected", a.kind)}
                  >
                    Reject
                  </Button>
                  <Button
                    variant="ghost"
                    className="rounded-xl"
                    onClick={() => void decide(a.id, "changes_requested", a.kind)}
                  >
                    Request changes
                  </Button>
                </div>
              </div>
            </div>
          </article>
        );
      })}

      <SignatureCapture
        open={Boolean(capture)}
        title="Brokerage countersignature"
        signerName={capture?.signerName ?? "Broker of record"}
        busy={countersignBusy}
        onClose={() => setCapture(null)}
        onSign={(result) => void submitCountersign(result)}
      />
    </div>
  );
}

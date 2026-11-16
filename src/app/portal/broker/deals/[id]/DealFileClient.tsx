"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BrokerListingEditor } from "@/components/portal/BrokerListingEditor";
import { Button } from "@/components/ui/Button";
import {
  addSupervisionNoteAction,
  pauseDealAction,
  unpauseDealAction,
  type SupervisionFile,
} from "@/lib/actions/broker";

export function DealFileClient({ file }: { file: SupervisionFile }) {
  const router = useRouter();
  const [reason, setReason] = useState(file.pausedReason ?? "");
  const [note, setNote] = useState("");

  async function pause() {
    const result = await pauseDealAction(file.deal.id, reason);
    if (!result.ok) {
      toast(result.message);
      return;
    }
    toast("Deal paused.");
    router.refresh();
  }

  async function unpause() {
    const result = await unpauseDealAction(file.deal.id);
    if (!result.ok) {
      toast(result.message);
      return;
    }
    toast("Deal unpaused.");
    router.refresh();
  }

  async function saveNote() {
    const result = await addSupervisionNoteAction(file.deal.id, note);
    if (!result.ok) {
      toast(result.message);
      return;
    }
    setNote("");
    toast("Supervision note recorded.");
    router.refresh();
  }

  return (
    <div className="print-file space-y-6">
      <div className="no-print flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-sans text-2xl font-medium tracking-tight text-forest">{file.address}</h1>
          <p className="mt-1 text-sm text-muted">
            {file.deal.state.replaceAll("_", " ")}
            {file.paused ? ` · paused: ${file.pausedReason}` : ""}
          </p>
        </div>
        <Button variant="outline" className="rounded-xl" onClick={() => window.print()}>
          Print file
        </Button>
      </div>

      <section className="no-print rounded-2xl border border-line bg-white p-5">
        <h2 className="text-lg font-semibold">Interventions</h2>
        {file.paused ? (
          <Button className="mt-3 rounded-xl" onClick={() => void unpause()}>
            Unpause deal
          </Button>
        ) : (
          <div className="mt-3 space-y-2">
            <textarea
              className="w-full rounded-xl border border-line px-3 py-2 text-sm"
              rows={2}
              placeholder="Pause reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <Button className="rounded-xl" onClick={() => void pause()}>
              Pause deal
            </Button>
          </div>
        )}
        <div className="mt-4 space-y-2">
          <textarea
            className="w-full rounded-xl border border-line px-3 py-2 text-sm"
            rows={2}
            placeholder="Supervision note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button variant="outline" className="rounded-xl" onClick={() => void saveNote()}>
            Add note
          </Button>
        </div>
      </section>

      {file.listing ? (
        <BrokerListingEditor listingId={file.listing.id} listing={file.listing} />
      ) : null}

      <section className="rounded-2xl border border-line bg-white p-5">
        <h2 className="text-lg font-semibold">Parties</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {file.parties.map((p) => (
            <li key={`${p.user_id}-${p.role}`}>
              {p.name || p.email} · {p.role} ({p.side})
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-line bg-white p-5">
        <h2 className="text-lg font-semibold">Events</h2>
        <ol className="mt-3 space-y-2 text-sm">
          {file.events.map((ev) => (
            <li key={ev.id}>
              <span className="text-muted">{ev.created_at}</span> · {ev.type}
              {Object.keys(ev.payload ?? {}).length ? (
                <pre className="mt-1 overflow-auto rounded-lg bg-warm p-2 text-xs">
                  {JSON.stringify(ev.payload, null, 2)}
                </pre>
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-2xl border border-line bg-white p-5">
        <h2 className="text-lg font-semibold">Documents</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {file.documents.map((doc) => (
            <li key={doc.id}>
              {doc.name} · {doc.status} · {doc.kind}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-line bg-white p-5">
        <h2 className="text-lg font-semibold">Messages</h2>
        <ul className="mt-2 space-y-2 text-sm">
          {file.messages.map((m) => (
            <li key={m.id}>
              <span className="text-muted">{m.created_at}</span> · {m.thread_key}: {m.body}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

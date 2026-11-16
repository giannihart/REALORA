"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/format";
import { isSupabaseDataMode } from "@/lib/data/mode";
import { useAppData } from "@/lib/data/use-app-data";
import type { DocumentGroup, DocumentItem, DocumentStatus, Role } from "@/lib/types";
import type { ContractExtraction } from "@/lib/services/extraction-types";
import { EMPTY_EXTRACTION } from "@/lib/services/extraction-types";
import { documentRequestsFor, type DocumentRequest } from "@/lib/documents/requests";
import type { AppSnapshot } from "@/lib/actions/snapshot";
import {
  confirmExtractionAction,
  extractContractAction,
  getDocumentUrlAction,
  getSigningConfigAction,
  saveManualDeadlinesAction,
  startSignatureAction,
  uploadDealDocumentAction,
  uploadBuyerFinancingDocumentAction,
} from "@/lib/actions/documents";
import { resolveFinancingPath } from "@/lib/buyer-readiness";
import { toast } from "sonner";

const categories: DocumentGroup[] = [
  "Contract",
  "Inspection report",
  "Title",
  "Disclosures",
  "Closing",
  "Listing",
];

const tone: Record<DocumentStatus, "good" | "lime" | "warn" | "neutral" | "sold" | "dark"> = {
  Signed: "dark",
  Pending: "warn",
  "For review": "warn",
};

export function DocumentVault({ role }: { role: Role }) {
  const documents = useAppData((s) => s.documents);
  const uploadDocument = useAppData((s) => s.uploadDocument);
  const applySnapshot = useAppData((s) => s.applySnapshot);
  const deal = useAppData((s) => s.deal);
  const dealId = useAppData((s) => s.dealId);
  const user = useAppData((s) => s.user);
  const isBroker = useAppData((s) => s.isBroker);
  const partyRoles = useAppData((s) => s.partyRoles ?? []);
  const [category, setCategory] = useState<DocumentGroup | "All">("All");
  const [preview, setPreview] = useState<DocumentItem | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [extractionOn, setExtractionOn] = useState(false);
  const [draft, setDraft] = useState<ContractExtraction>(EMPTY_EXTRACTION);
  const [manual, setManual] = useState({ commitmentDeadline: "", closingTarget: "" });
  const fileRef = useRef<HTMLInputElement>(null);
  const searchParams = useSearchParams();
  const live = isSupabaseDataMode();
  const canConfirm =
    isBroker || partyRoles.includes("agent_seller") || partyRoles.includes("broker_of_record");

  useEffect(() => {
    if (!live) return;
    void getSigningConfigAction().then((r) => {
      if (r.ok) setExtractionOn(r.data.extraction);
    });
  }, [live]);

  useEffect(() => {
    const extracted = documents.find((d) => d.id === preview?.id)?.extracted;
    if (extracted?.proposed) setDraft(extracted.confirmed ?? extracted.proposed);
  }, [documents, preview?.id]);

  const rows = useMemo(
    () => documents.filter((d) => d.role === role || d.role === "both"),
    [documents, role],
  );
  const filtered = useMemo(() => {
    const rank = (status: DocumentStatus) => {
      if (status === "For review") return 0;
      if (status === "Pending") return 1;
      return 2; // Signed last
    };
    return rows
      .filter((d) => (category === "All" ? true : d.group === category))
      .slice()
      .sort((a, b) => rank(a.status) - rank(b.status));
  }, [rows, category]);
  const financingPath = useMemo(
    () =>
      resolveFinancingPath({
        prefsPath: user.financingPath,
        documents: rows,
      }),
    [user.financingPath, rows],
  );

  const requests = useMemo(() => {
    const base = documentRequestsFor(role, deal, rows);
    if (dealId || role !== "buyer") return base;
    // Pre-offer: only the financing request for the chosen path (or both until chosen).
    const open = [base.next, ...base.upcoming].filter((r): r is DocumentRequest => Boolean(r));
    const financing = open.filter((r) => {
      if (r.id !== "proof-of-funds" && r.id !== "pre-approval") return false;
      if (!financingPath) return true;
      return financingPath === "cash"
        ? r.id === "proof-of-funds"
        : r.id === "pre-approval";
    });
    return {
      next: financing[0] ?? null,
      upcoming: financing.slice(1),
      complete: base.complete.filter(
        (r) => r.id === "proof-of-funds" || r.id === "pre-approval",
      ),
    };
  }, [role, deal, rows, dealId, financingPath]);
  const nextReq = requests.next;

  const livePreview = preview ? (documents.find((d) => d.id === preview.id) ?? preview) : null;

  async function onUpload(file: File, req: DocumentRequest) {
    const financingKind =
      req.id === "proof-of-funds"
        ? "proof_of_funds"
        : req.id === "pre-approval"
          ? "pre_approval"
          : null;
    setBusy(true);
    const form = new FormData();
    form.set("visibility", req.visibility);
    form.set("kind", financingKind ?? req.kind);
    form.set("label", req.title);
    form.set("file", file);

    let result: Awaited<ReturnType<typeof uploadDealDocumentAction>>;
    if (!dealId) {
      if (!financingKind) {
        setBusy(false);
        toast("No deal is attached yet.");
        return;
      }
      result = await uploadBuyerFinancingDocumentAction(form);
    } else {
      form.set("dealId", dealId);
      result = await uploadDealDocumentAction(form);
    }
    setBusy(false);
    if (!result.ok) {
      toast(result.message);
      return;
    }
    applySnapshot(result.data);
    toast(`${req.title} added to the vault.`);
  }

  async function openPreview(doc: DocumentItem) {
    setPreview(doc);
    setFileUrl(null);
    if (doc.extracted?.proposed) setDraft(doc.extracted.confirmed ?? doc.extracted.proposed);
    if (!live || !doc.storagePath || doc.storagePath.startsWith("seed:")) return;
    const result = await getDocumentUrlAction(doc.id, "preview");
    if (result.ok) setFileUrl(result.data.url);
  }

  useEffect(() => {
    const id = searchParams.get("preview");
    if (!id || preview?.id === id) return;
    const doc = documents.find((d) => d.id === id);
    if (doc) void openPreview(doc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documents, searchParams]);

  async function download(doc: DocumentItem) {
    const result = await getDocumentUrlAction(doc.id, "download");
    if (!result.ok) {
      toast(result.message);
      return;
    }
    window.open(result.data.url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-sans text-2xl font-medium tracking-tight text-forest">Documents</h1>
      </div>

      <div className="rounded-2xl border border-line bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold">Document hub</h3>
            <p className="mt-1 text-xs text-muted">
              Needed uploads appear at the top. Visibility is set by the workflow.
            </p>
          </div>
          {live ? (
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/heic,image/heif,.pdf,.png,.jpg,.jpeg,.heic,.heif"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file && nextReq) void onUpload(file, nextReq);
              }}
            />
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap gap-1">
          <FilterChip
            active={category === "All"}
            onClick={() => setCategory("All")}
            label="All"
          />
          {categories.map((c) => (
            <FilterChip
              key={c}
              active={category === c}
              onClick={() => setCategory(c)}
              label={c}
            />
          ))}
        </div>

        <ul className="mt-4 divide-y divide-line">
          {nextReq && (category === "All" || category === nextReq.kind) ? (
            <li className="flex flex-wrap items-center gap-2 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{nextReq.title}</p>
                <p className="text-xs text-muted">
                  {nextReq.kind} · Needed · {nextReq.audience}
                </p>
              </div>
              <Badge tone="warn">Needed</Badge>
              <Button
                variant="lime"
                className="h-8 rounded-xl px-3 text-xs"
                disabled={busy}
                onClick={() => {
                  if (live) {
                    fileRef.current?.click();
                    return;
                  }
                  uploadDocument(nextReq.title, nextReq.kind);
                  toast(`${nextReq.title} added to the vault.`);
                }}
              >
                {busy ? "Uploading…" : "Upload"}
              </Button>
            </li>
          ) : null}
          {filtered.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-2 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{d.name}</p>
                <p className="text-xs text-muted">
                  {d.group} · {d.uploadedBy} · {d.date}
                </p>
              </div>
              <Badge tone={tone[d.status] ?? "neutral"}>{d.status}</Badge>
              {live && (d.signStatus === "declined" || d.signStatus === "expired") ? (
                <Badge tone="warn">{d.signStatus}</Badge>
              ) : null}
              <Button
                variant="ghost"
                className="h-8 rounded-xl px-3 text-xs"
                onClick={() => void openPreview(d)}
              >
                Preview
              </Button>
            </li>
          ))}
          {!nextReq && filtered.length === 0 ? (
            <li className="py-8 text-center text-sm text-muted">
              No documents in this category.
            </li>
          ) : null}
        </ul>
      </div>

      <Modal
        open={!!preview}
        title={preview?.name ?? "Document"}
        size="xl"
        showClose
        onClose={() => {
          setPreview(null);
          setFileUrl(null);
        }}
        footer={
          <div className="flex flex-wrap gap-2">
            {live && preview?.storagePath && !preview.storagePath.startsWith("seed:") ? (
              <Button variant="outline" onClick={() => preview && void download(preview)}>
                Download
              </Button>
            ) : null}
            {live &&
            preview &&
            /listing agreement/i.test(preview.name) &&
            preview.storagePath &&
            !preview.storagePath.startsWith("seed:") &&
            preview.signStatus !== "completed" &&
            preview.signStatus !== "Signed" ? (
              <Button
                variant="outline"
                onClick={() => {
                  void (async () => {
                    const started = await startSignatureAction(preview.id);
                    if (!started.ok) {
                      toast(started.message);
                      return;
                    }
                    toast("Open Tap to sign on the listing agreement to complete this request.");
                  })();
                }}
              >
                Sign
              </Button>
            ) : null}
            <Button
              variant="outline"
              onClick={() => {
                setPreview(null);
                setFileUrl(null);
              }}
            >
              Close
            </Button>
          </div>
        }
      >
        {fileUrl ? (
          <div className="overflow-hidden rounded-xl border border-line bg-white">
            {preview?.name.toLowerCase().match(/\.(png|jpe?g|heic|heif)$/) ||
            fileUrl.includes("image") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={fileUrl}
                alt=""
                className="max-h-[min(640px,calc(100vh-14rem))] w-full object-contain"
              />
            ) : (
              <iframe
                title={preview?.name}
                src={fileUrl}
                className="h-[min(640px,calc(100vh-14rem))] w-full"
              />
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-line bg-white p-5 text-sm leading-6">
            <p className="text-xs font-medium text-muted">
              Document preview
            </p>
            <p className="mt-3">{preview?.body}</p>
            <p className="mt-4 text-xs text-muted">
              Status: {preview?.status}
              {preview?.uploadedBy ? ` · Provided by ${preview.uploadedBy}` : ""}.
              Not a filed legal instrument.
            </p>
          </div>
        )}
        {live && livePreview && (livePreview.group === "Contract" || livePreview.extracted) ? (
          <ExtractionPanel
            doc={livePreview}
            canConfirm={canConfirm}
            extractionOn={extractionOn}
            draft={draft}
            setDraft={setDraft}
            manual={manual}
            setManual={setManual}
            dealId={dealId}
            applySnapshot={applySnapshot}
          />
        ) : null}
      </Modal>
    </div>
  );
}

function ExtractionPanel({
  doc,
  canConfirm,
  extractionOn,
  draft,
  setDraft,
  manual,
  setManual,
  dealId,
  applySnapshot,
}: {
  doc: DocumentItem;
  canConfirm: boolean;
  extractionOn: boolean;
  draft: ContractExtraction;
  setDraft: (next: ContractExtraction) => void;
  manual: { commitmentDeadline: string; closingTarget: string };
  setManual: (next: { commitmentDeadline: string; closingTarget: string }) => void;
  dealId: string | null;
  applySnapshot: (snap: AppSnapshot) => void;
}) {
  const proposed = doc.extracted?.status === "proposed";
  const confirmed = doc.extracted?.status === "confirmed";
  if (!canConfirm) return null;
  if (!extractionOn && !proposed && !confirmed) {
    return (
      <div className="mt-4 space-y-2 rounded-xl border border-line bg-warm/40 p-4">
        <p className="text-sm font-medium">Manual deadline entry</p>
        <p className="text-xs text-muted">Contract extraction is unavailable. Enter dates by hand.</p>
        <label className="block text-xs">
          Mortgage commitment deadline
          <input
            type="date"
            className="mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm"
            value={manual.commitmentDeadline}
            onChange={(e) => setManual({ ...manual, commitmentDeadline: e.target.value })}
          />
        </label>
        <label className="block text-xs">
          Closing target
          <input
            type="date"
            className="mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm"
            value={manual.closingTarget}
            onChange={(e) => setManual({ ...manual, closingTarget: e.target.value })}
          />
        </label>
        <Button
          className="rounded-xl"
          onClick={() => {
            if (!dealId) return;
            void saveManualDeadlinesAction(dealId, manual).then((r) => {
              if (!r.ok) toast(r.message);
              else {
                applySnapshot(r.data);
                toast("Deadlines saved.");
              }
            });
          }}
        >
          Save deadlines
        </Button>
      </div>
    );
  }
  return (
    <div className="mt-4 space-y-2 rounded-xl border border-line bg-warm/40 p-4">
      <p className="text-sm font-medium">
        {confirmed ? "Confirmed contract terms" : "Proposed extraction"}
      </p>
      {doc.group === "Contract" && extractionOn && !proposed && !confirmed ? (
        <Button
          variant="outline"
          className="rounded-xl"
          onClick={() => {
            void extractContractAction(doc.id).then((r) => {
              if (!r.ok) toast(r.message);
              else {
                applySnapshot(r.data);
                toast("Extraction proposed — nothing is bound yet.");
              }
            });
          }}
        >
          Extract contract
        </Button>
      ) : null}
      {proposed ? (
        <>
          <Field
            label="Seller"
            value={draft.parties.seller ?? ""}
            onChange={(v) => setDraft({ ...draft, parties: { ...draft.parties, seller: v || null } })}
          />
          <Field
            label="Buyer"
            value={draft.parties.buyer ?? ""}
            onChange={(v) => setDraft({ ...draft, parties: { ...draft.parties, buyer: v || null } })}
          />
          <Field
            label="Premises"
            value={draft.premisesAddress ?? ""}
            onChange={(v) => setDraft({ ...draft, premisesAddress: v || null })}
          />
          <Field
            label="Purchase price (cents)"
            value={draft.purchasePriceCents?.toString() ?? ""}
            onChange={(v) =>
              setDraft({ ...draft, purchasePriceCents: v ? Number(v) : null })
            }
          />
          <Field
            label="Contract date"
            value={draft.contractDate ?? ""}
            onChange={(v) => setDraft({ ...draft, contractDate: v || null })}
          />
          <Field
            label="Deposit (cents)"
            value={draft.deposit.amountCents?.toString() ?? ""}
            onChange={(v) =>
              setDraft({ ...draft, deposit: { ...draft.deposit, amountCents: v ? Number(v) : null } })
            }
          />
          <Field
            label="Deposit holder"
            value={draft.deposit.holderName ?? ""}
            onChange={(v) => setDraft({ ...draft, deposit: { ...draft.deposit, holderName: v || null } })}
          />
          <Field
            label="Financing type"
            value={draft.financing.type ?? ""}
            onChange={(v) => setDraft({ ...draft, financing: { ...draft.financing, type: v || null } })}
          />
          <Field
            label="Mortgage amount (cents)"
            value={draft.financing.mortgageAmountCents?.toString() ?? ""}
            onChange={(v) =>
              setDraft({
                ...draft,
                financing: { ...draft.financing, mortgageAmountCents: v ? Number(v) : null },
              })
            }
          />
          <Field
            label="Commitment deadline"
            value={draft.financing.commitmentDeadline ?? ""}
            onChange={(v) =>
              setDraft({
                ...draft,
                financing: { ...draft.financing, commitmentDeadline: v || null },
              })
            }
          />
          <Field
            label="Closing on or about"
            value={draft.closing.onOrAbout ?? ""}
            onChange={(v) => setDraft({ ...draft, closing: { ...draft.closing, onOrAbout: v || null } })}
          />
          <Field
            label="Outside date"
            value={draft.closing.outsideDate ?? ""}
            onChange={(v) => setDraft({ ...draft, closing: { ...draft.closing, outsideDate: v || null } })}
          />
          <Button
            className="rounded-xl"
            onClick={() => {
              void confirmExtractionAction(doc.id, draft).then((r) => {
                if (!r.ok) toast(r.message);
                else {
                  applySnapshot(r.data);
                  toast("Extraction confirmed. Deadlines are now bound.");
                }
              });
            }}
          >
            Confirm extraction
          </Button>
        </>
      ) : null}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block text-xs">
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm"
      />
    </label>
  );
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1 text-xs font-medium",
        active ? "bg-forest text-cream" : "bg-warm text-forest",
      )}
    >
      {label}
    </button>
  );
}

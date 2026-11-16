"use client";

import type { TemplateDoc } from "@/lib/templates/types";
import { cn } from "@/lib/format";

export type SignatureBoxState = {
  role: "Seller" | "Brokerage";
  /** When set, box shows the executed stamp from the document record. */
  signedAtLabel?: string | null;
  signedBy?: string | null;
  /** Evidence image URL from the vault record — never local canvas state. */
  signatureImageUrl?: string | null;
  /** Seller tap target — only when signing is live and this role is Seller. */
  tapToSign?: boolean;
  /** Brokerage awaiting countersign after seller signed. */
  countersignPending?: boolean;
  onTapToSign?: () => void;
  busy?: boolean;
};

export function ListingAgreementView({
  doc,
  signatureBoxes,
}: {
  doc: TemplateDoc;
  /** When omitted, boxes are inert (preview-only). Never pass tap targets during a hold. */
  signatureBoxes?: SignatureBoxState[];
}) {
  return (
    <div className="max-h-[min(28rem,55vh)] overflow-y-auto rounded-2xl border border-line bg-cream/40 px-4 py-4 text-sm leading-6 text-forest">
      <p className="font-sans text-xl font-semibold tracking-tight">{doc.title}</p>
      {doc.subtitle ? <p className="mt-1 text-xs text-muted">{doc.subtitle}</p> : null}
      {doc.notice ? (
        <p className="mt-3 text-xs font-medium text-muted">{doc.notice}</p>
      ) : null}
      <div className="mt-4 space-y-3">
        {doc.paragraphs.map((para) => (
          <p key={para.slice(0, 48)}>{para}</p>
        ))}
      </div>
      {doc.sections?.map((section) => (
        <section key={section.heading} className="mt-5">
          <h3 className="text-sm font-semibold tracking-tight">{section.heading}</h3>
          <div className="mt-2 space-y-2 text-[13px] leading-6 text-forest/90">
            {section.paragraphs.map((para) => (
              <p key={para.slice(0, 48)}>{para}</p>
            ))}
          </div>
        </section>
      ))}
      {doc.fields.length ? (
        <section className="mt-5">
          <h3 className="text-sm font-semibold tracking-tight">Transaction particulars</h3>
          <dl className="mt-2 space-y-1.5 text-[13px]">
            {doc.fields.map((field) => (
              <div key={field.label} className="flex flex-wrap gap-x-2">
                <dt className="text-muted">{field.label}</dt>
                <dd className="font-medium">{field.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
      <section className="mt-5 border-t border-line pt-4">
        <h3 className="text-sm font-semibold tracking-tight">Signatures</h3>
        <div className="mt-3 space-y-4">
          {doc.signers.map((signer) => {
            const box = signatureBoxes?.find((b) => b.role === signer.role);
            return (
              <div key={`${signer.role}-${signer.name}`}>
                <p className="text-[13px]">
                  <span className="text-muted">{signer.role}</span>
                  <span className="mx-1.5 text-muted">·</span>
                  <span className="font-medium">{signer.name}</span>
                </p>
                {box?.signedAtLabel ? (
                  <div className="mt-2 rounded-md border border-line bg-white px-3 py-2.5">
                    {box.signatureImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={box.signatureImageUrl}
                        alt={`${box.signedBy ?? signer.name} signature`}
                        className="h-14 w-auto max-w-full object-contain object-left"
                      />
                    ) : (
                      <p className="font-sans text-base italic tracking-tight text-forest">
                        {box.signedBy ?? signer.name}
                      </p>
                    )}
                    <p className="mt-1 text-[11px] text-muted">
                      Signed — {box.signedAtLabel}
                    </p>
                  </div>
                ) : box?.countersignPending ? (
                  <div className="mt-2 rounded-md border border-line bg-white/70 px-3 py-2.5">
                    <p className="text-[13px] text-muted">
                      Brokerage countersignature — in review
                    </p>
                  </div>
                ) : box?.tapToSign ? (
                  <button
                    type="button"
                    disabled={box.busy}
                    onClick={() => box.onTapToSign?.()}
                    className={cn(
                      "mt-2 flex h-10 w-full items-center justify-center rounded-md border border-line bg-white text-[13px] font-medium text-forest transition hover:border-forest hover:bg-cream/80",
                      box.busy && "opacity-60",
                    )}
                  >
                    {box.busy ? "Opening…" : "Tap to sign"}
                  </button>
                ) : (
                  <>
                    <div className="mt-2 h-10 rounded-md border border-line bg-white/70" />
                    <p className="mt-1 text-[11px] text-muted">Signature / date</p>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

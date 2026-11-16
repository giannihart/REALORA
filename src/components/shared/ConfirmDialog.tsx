"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useState } from "react";
import { Button } from "./Button";

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel = "Confirm",
  confirmPhrase,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body: string;
  confirmLabel?: string;
  /** When set, user must type this exact phrase before Confirm is enabled. */
  confirmPhrase?: string;
  onConfirm: () => void;
}) {
  const [typed, setTyped] = useState("");
  const needsPhrase = Boolean(confirmPhrase);
  const phraseReady = !needsPhrase || typed.trim() === confirmPhrase;

  useEffect(() => {
    if (!open) setTyped("");
  }, [open]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="anim-overlay fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[rgba(11,31,26,0.45)] p-4">
          <Dialog.Content className="anim-rise shadow-raised relative w-[min(440px,100%)] rounded-[24px] border border-line bg-white p-6">
            <Dialog.Title className="font-sans text-2xl font-medium tracking-tight text-forest">
              {title}
            </Dialog.Title>
            <Dialog.Description className="mt-3 text-[15px] text-muted" style={{ lineHeight: 1.55 }}>
              {body}
            </Dialog.Description>
            {needsPhrase ? (
              <label className="mt-5 block">
                <span className="text-sm text-muted">
                  Type <span className="font-semibold text-forest">{confirmPhrase}</span> to submit offer
                </span>
                <input
                  type="text"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  autoComplete="off"
                  autoFocus
                  className="mt-2 h-11 w-full rounded-[14px] border border-line bg-cream px-3.5 text-sm text-forest outline-none focus:border-forest"
                  placeholder={confirmPhrase}
                />
              </label>
            ) : null}
            <div className="mt-8 flex justify-end gap-3">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                variant={needsPhrase ? "lime" : "pine"}
                disabled={!phraseReady}
                className={
                  needsPhrase
                    ? phraseReady
                      ? "!bg-lime !text-forest shadow-none transition-[filter,opacity,background-color,color] duration-200 hover:brightness-105"
                      : "!bg-[#c8d96a]/35 !text-forest/30 shadow-none grayscale transition-[filter,opacity,background-color,color] duration-200"
                    : undefined
                }
                onClick={() => {
                  if (!phraseReady) return;
                  onConfirm();
                  onOpenChange(false);
                }}
              >
                {confirmLabel}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

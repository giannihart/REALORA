"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { DocumentItem } from "@/lib/types";

export default function DocumentPreviewDrawer({
  doc,
  onClose,
}: {
  doc: DocumentItem;
  onClose: () => void;
}) {
  return (
    <Dialog.Root open onOpenChange={() => onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="anim-overlay fixed inset-0 z-50 bg-[rgba(11,31,26,0.45)]" />
        <Dialog.Content className="anim-drawer shadow-raised fixed top-0 right-0 z-50 flex h-full w-[min(520px,100%)] flex-col border-l border-line bg-cream">
          <div className="flex items-center justify-between border-b border-line px-6 py-4">
            <Dialog.Title className="font-medium tracking-tight">{doc.name}</Dialog.Title>
            <Dialog.Close
              aria-label="Close document"
              className="ctrl grid h-11 w-11 place-items-center rounded-full bg-white"
            >
              <X className="h-5 w-5" strokeWidth={1.75} />
            </Dialog.Close>
          </div>
          <pre className="flex-1 overflow-auto whitespace-pre-wrap px-6 py-5 font-sans text-sm" style={{ lineHeight: 1.55 }}>
            {doc.body}
          </pre>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

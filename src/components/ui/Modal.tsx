"use client";

import { type ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/format";

export function Modal({
  open,
  title,
  children,
  footer,
  onClose,
  size = "md",
  showClose = true,
  className,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  /** Pinned below the scrollable body so actions stay visible without scrolling. */
  footer?: ReactNode;
  onClose: () => void;
  size?: "md" | "xl";
  showClose?: boolean;
  className?: string;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-forest/40"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "relative flex max-h-[min(920px,calc(100vh-1.5rem))] w-full flex-col overflow-hidden rounded-3xl p-5 shadow-2xl sm:p-6",
          size === "xl" ? "max-w-6xl" : "max-w-lg",
          className?.includes("bg-") ? className : cn("bg-cream", className),
        )}
      >
        <div className="mb-4 flex shrink-0 items-start justify-between gap-4">
          <h3 className="text-lg font-semibold text-forest">{title}</h3>
          {showClose ? (
            <button
              type="button"
              onClick={onClose}
              className="rounded-full px-2 text-lg leading-none text-muted hover:bg-warm"
              aria-label="Close"
            >
              ✕
            </button>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer ? <div className="mt-4 shrink-0">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

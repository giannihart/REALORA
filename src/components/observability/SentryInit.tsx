"use client";

import { useEffect } from "react";
import { captureError, sentryDsn } from "@/lib/sentry/capture";

export function SentryInit() {
  useEffect(() => {
    if (!sentryDsn()) return;
    const onError = (event: ErrorEvent) => {
      captureError(event.error ?? event.message, { source: "window.onerror" });
    };
    const onRejected = (event: PromiseRejectionEvent) => {
      captureError(event.reason, { source: "unhandledrejection" });
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejected);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejected);
    };
  }, []);
  return null;
}

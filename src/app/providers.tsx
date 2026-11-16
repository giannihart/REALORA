"use client";

import { useEffect } from "react";
import { Toaster } from "sonner";
import { bindStoreCrossTab, useDemoStore } from "@/lib/store";
import { isLocalDataMode } from "@/lib/data/mode";
import { bindSupabaseRealtime, hydrateSupabaseStore } from "@/lib/data/supabase-store";
import { SentryInit } from "@/components/observability/SentryInit";

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (isLocalDataMode()) {
      void Promise.resolve(useDemoStore.persist.rehydrate()).then(() => {
        useDemoStore.getState().setHydrated(true);
      });
      return bindStoreCrossTab();
    }
    let unsub: () => void = () => {};
    void hydrateSupabaseStore().then(() => {
      unsub = bindSupabaseRealtime();
    });
    return () => unsub();
  }, []);

  return (
    <>
      <SentryInit />
      {children}
      <Toaster
        position="bottom-right"
        style={{ ["--normal-text" as string]: "#102c25" }}
        toastOptions={{
          classNames: {
            toast: "text-forest",
            title: "text-forest",
          },
          style: {
            background: "#ffffff",
            color: "#102c25",
            border: "1px solid #e6dfd8",
            borderRadius: "16px",
            fontFamily: "var(--font-plus-jakarta), sans-serif",
            boxShadow: "var(--shadow-raised)",
          },
        }}
      />
    </>
  );
}

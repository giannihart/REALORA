"use client";

import { useDemoStore } from "@/lib/store";
import { isLocalDataMode } from "@/lib/data/mode";
import { useSupabaseAppStore } from "@/lib/data/supabase-store";
import type { DataProvider } from "@/lib/data/provider";
import type { UseBoundStore } from "zustand";

export const useAppData = (
  isLocalDataMode() ? useDemoStore : useSupabaseAppStore
) as unknown as UseBoundStore<import("zustand").StoreApi<DataProvider>>;

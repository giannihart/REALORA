import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";
import { publicSupabaseAnonKey, publicSupabaseUrl } from "@/lib/supabase/env";

export function createBrowserSupabaseClient() {
  return createBrowserClient<Database>(publicSupabaseUrl(), publicSupabaseAnonKey());
}

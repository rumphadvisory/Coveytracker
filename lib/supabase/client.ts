import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { CLIENT_KEY, CLIENT_URL, supabaseConfigured as configured } from "./env";

let client: ReturnType<typeof createBrowserClient<Database>> | undefined;

export function supabaseConfigured(): boolean {
  return configured;
}

export function createClient() {
  if (!client) {
    client = createBrowserClient<Database>(CLIENT_URL, CLIENT_KEY);
  }
  return client;
}

export type Supabase = ReturnType<typeof createClient>;

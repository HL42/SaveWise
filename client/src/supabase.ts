import { createClient } from "@supabase/supabase-js";
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
function isPublicKey(value: string): boolean {
  if (value.startsWith("sb_publishable_")) return true;
  try {
    const encoded = value.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(encoded)).role === "anon";
  } catch {
    return false;
  }
}
// Reject accidentally configured admin keys rather than bundling a privileged client.
export const supabase =
  url && key && isPublicKey(key)
    ? createClient(url, key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
        global: {
          fetch: (input, init) =>
            fetch(input, {
              ...init,
              signal: init?.signal
                ? AbortSignal.any([init.signal, AbortSignal.timeout(15_000)])
                : AbortSignal.timeout(15_000),
            }),
        },
      })
    : null;

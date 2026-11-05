import { createClient } from "@supabase/supabase-js";
import { readPublicConfig } from "./publicConfig";
export const publicConfig = readPublicConfig(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
);
// Preview never creates an Auth client or requests real financial data.
export const localPreview =
  import.meta.env.DEV && window.location.pathname === "/demo";
export const supabase =
  publicConfig.status === "ready" && !localPreview
    ? createClient(publicConfig.url, publicConfig.key, {
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

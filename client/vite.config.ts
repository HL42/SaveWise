import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { readPublicConfig } from "./src/publicConfig";

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const config = readPublicConfig(
    env.VITE_SUPABASE_URL,
    env.VITE_SUPABASE_PUBLISHABLE_KEY,
  );
  // A broken production login must fail the build, rather than ship to users.
  if (command === "build" && config.status !== "ready")
    throw new Error(
      `Supabase public client configuration is ${config.status}. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY before building. Never use a secret/service_role key.`,
    );
  return { plugins: [react()] };
});

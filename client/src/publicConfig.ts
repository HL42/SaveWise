export type PublicConfig =
  | { status: "ready"; url: string; key: string }
  | { status: "missing" | "invalid-url" | "unsafe-key" };
export function readPublicConfig(
  rawUrl?: string,
  rawKey?: string,
): PublicConfig {
  const url = rawUrl?.trim();
  const key = rawKey?.trim();
  if (!url || !key) return { status: "missing" };
  try {
    const parsed = new URL(url);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
    if (
      (parsed.protocol !== "https:" &&
        !(local && parsed.protocol === "http:")) ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    )
      return { status: "invalid-url" };
  } catch {
    return { status: "invalid-url" };
  }
  if (
    key.startsWith("sb_publishable_") &&
    key.length > "sb_publishable_".length
  )
    return { status: "ready", url, key };
  try {
    const encoded = key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    if (JSON.parse(atob(encoded)).role === "anon")
      return { status: "ready", url, key };
  } catch {
    /* Never accept a secret/admin key or log its contents. */
  }
  return { status: "unsafe-key" };
}

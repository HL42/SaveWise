import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "../client/node_modules/typescript/lib/typescript.js";
const source = await readFile(
  new URL("../client/src/publicConfig.ts", import.meta.url),
  "utf8",
);
const code = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const { readPublicConfig } = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
);
const url = "https://example.supabase.co",
  key = "sb_publishable_fictional_test_only";
const jwt = (role) =>
  `eyJhbGciOiJub25lIn0.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.fake`;
test("missing build configuration stays disabled", () => {
  assert.equal(readPublicConfig(url, "").status, "missing");
  assert.equal(readPublicConfig(undefined, key).status, "missing");
});
test("public key is accepted and accidental whitespace trimmed", () => {
  assert.deepEqual(readPublicConfig(` ${url} `, ` ${key} `), {
    status: "ready",
    url,
    key,
  });
  assert.equal(readPublicConfig(url, jwt("anon")).status, "ready");
});
test("admin/secret keys are never enabled or included in diagnostics", () => {
  for (const secret of [
    "sb_secret_do_not_use",
    jwt("service_role"),
    "not-a-key",
  ])
    assert.deepEqual(readPublicConfig(url, secret), { status: "unsafe-key" });
});
test("invalid/credential-bearing/insecure remote URL cannot initialize the app", () => {
  for (const bad of [
    "invalid",
    "http://example.com",
    "https://user:pass@example.com",
    "https://example.com?token=secret",
  ])
    assert.deepEqual(readPublicConfig(bad, key), { status: "invalid-url" });
  assert.equal(readPublicConfig("http://127.0.0.1:54321", key).status, "ready");
});

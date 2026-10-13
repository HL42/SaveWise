import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "../client/node_modules/typescript/lib/typescript.js";
const source = await readFile(
  new URL("../client/src/finance.ts", import.meta.url),
  "utf8",
);
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const { cents, dayDistance, dueLabel, available, demoDashboard } = await import(
  `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`
);
test("cents are exact and reject unsupported precision, infinity and malformed input", () => {
  assert.equal(cents("0.29"), 29);
  assert.equal(cents("123.45"), 12345);
  assert.equal(cents("-1.01"), -101);
  for (const input of ["Infinity", "1.001", "10abc", "1e3", "", "NaN"])
    assert.throws(() => cents(input));
});
test("due date stays today and overdue across month/DST boundaries", () => {
  assert.equal(dueLabel("2026-10-12", "2026-10-12"), "今天到期");
  assert.equal(dueLabel("2026-10-13", "2026-10-12"), "逾期 1 天");
  assert.equal(dayDistance("2026-02-28", "2026-03-01"), 1);
  assert.equal(dayDistance("2026-03-07", "2026-03-09"), 2);
});
test("spendable excludes reservations and outstanding bills but never mixes currencies", () => {
  const d = demoDashboard();
  assert.equal(available(d, "CAD").spendable, 90000);
  assert.equal(available(d, "CNY").spendable, 0);
  d.accounts.push({
    id: "cny",
    kind: "asset",
    currency: "CNY",
    balance_cents: 50000,
    reserved_cents: 30000,
  });
  assert.equal(available(d, "CAD").spendable, 90000);
  assert.equal(available(d, "CNY").spendable, 20000);
});

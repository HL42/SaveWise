import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "../client/node_modules/typescript/lib/typescript.js";
const compile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
const url = (source) =>
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const financeSource = compile(
  await readFile(new URL("../client/src/finance.ts", import.meta.url), "utf8"),
);
const helperSource = compile(
  await readFile(
    new URL("../client/src/savingsPreview.ts", import.meta.url),
    "utf8",
  ),
).replace(/from ["']\.\/finance["']/, `from '${url(financeSource)}'`);
const {
  initialPreviewGoal: goal,
  layoutPreviewDashboard,
  updateGoalReserve,
} = await import(url(helperSource));
const { available } = await import(url(financeSource));
test("layout preview uses fictional separate daily/card accounts and an allocated savings goal", () => {
  const data = layoutPreviewDashboard();
  assert.equal(data.accounts.filter((a) => a.kind === "asset").length, 2);
  assert.equal(data.accounts.filter((a) => a.kind === "liability").length, 3);
  assert.equal(data.statements.length, 3);
  assert.ok(
    data.accounts.find((a) => a.id === goal.accountId).reserved_cents >=
      goal.allocated,
  );
  assert.equal(available(data, "CAD").spendable, 130000);
});
test("changing a goal reserves only the allocation delta, never the target or all assets", () => {
  const data = layoutPreviewDashboard(),
    next = { ...goal, allocated: 80000 };
  const changed = updateGoalReserve(data.accounts, goal, next);
  assert.equal(
    changed.find((a) => a.id === goal.accountId).reserved_cents,
    140000,
  );
  assert.equal(
    available({ ...data, accounts: changed }, "CAD").spendable,
    110000,
  );
  assert.deepEqual(
    changed.map((a) => a.balance_cents),
    data.accounts.map((a) => a.balance_cents),
  );
  assert.deepEqual(updateGoalReserve(changed, next, next), changed);
  assert.equal(
    data.accounts.find((a) => a.id === goal.accountId).reserved_cents,
    120000,
  );
});
test("moving goal money releases only its own reserve and preserves living reservations", () => {
  const data = layoutPreviewDashboard();
  const next = { ...goal, accountId: "demo-saving", allocated: 50000 };
  const changed = updateGoalReserve(data.accounts, goal, next);
  assert.equal(changed.find((a) => a.id === "demo-bank").reserved_cents, 60000);
  assert.equal(
    changed.find((a) => a.id === "demo-saving").reserved_cents,
    50000,
  );
  assert.equal(
    available({ ...data, accounts: changed }, "CAD").spendable,
    140000,
  );
});
test("goals reject unavailable funds, non-asset accounts and invalid progress without mutation", () => {
  const data = layoutPreviewDashboard(),
    before = structuredClone(data.accounts);
  for (const next of [
    { ...goal, allocated: -1 },
    { ...goal, allocated: 310000 },
    { ...goal, allocated: 240001 },
    { ...goal, target: 0 },
    { ...goal, accountId: "demo-card" },
    { ...goal, name: "" },
  ])
    assert.throws(() => updateGoalReserve(data.accounts, goal, next));
  assert.deepEqual(data.accounts, before);
});

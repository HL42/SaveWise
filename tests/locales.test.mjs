import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "../client/node_modules/typescript/lib/typescript.js";
const load = async (file) => {
  const source = await readFile(new URL(file, import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  return import(
    `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`
  );
};
const { english, readLanguage, saveLanguage, translate, translateMessage } =
  await load("../client/src/locales.ts");
const { money, dueLabel } = await load("../client/src/finance.ts");
test("English covers UI literals and preserves interpolation and user content", async () => {
  const source = await readFile(
    new URL("../client/src/App.tsx", import.meta.url),
    "utf8",
  );
  const sf = ts.createSourceFile(
    "App.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  function walk(n) {
    if (
      ts.isCallExpression(n) &&
      n.expression.getText(sf) === "t" &&
      ts.isStringLiteral(n.arguments[0])
    ) {
      const key = n.arguments[0].text;
      assert.ok(english[key], `Missing English: ${key}`);
      assert.deepEqual(
        english[key].match(/\{\w+\}/g)?.sort(),
        key.match(/\{\w+\}/g)?.sort(),
        `Placeholders: ${key}`,
      );
    }
    if (ts.isJsxText(n))
      assert.doesNotMatch(
        n.text,
        /[\u3400-\u9fff]/,
        "UI text must use translation",
      );
    ts.forEachChild(n, walk);
  }
  walk(sf);
  assert.equal(
    translate("{0} · 核对余额", "en", { 0: "我的银行" }),
    "我的银行 · Check balance",
  );
  assert.equal(translate("当前余额", "zh"), "当前余额");
  assert.equal(
    translateMessage("未保存：金额超出范围", "en"),
    "Not saved: The amount is out of range.",
  );
  assert.match(
    translateMessage("网络中断，结果未知。请查询并重试原请求。", "en"),
    /unknown/,
  );
  assert.doesNotMatch(
    translateMessage("未保存：未知错误", "en"),
    /[\u3400-\u9fff]/,
  );
});
test("language preference persists and blocked storage does not break switching", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const store = new Map();
  try {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key) => store.get(key),
        setItem: (key, value) => store.set(key, value),
      },
    });
    assert.equal(readLanguage(), "zh");
    saveLanguage("en");
    assert.equal(readLanguage(), "en");
    saveLanguage("zh");
    assert.equal(readLanguage(), "zh");
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("blocked");
      },
    });
    assert.equal(readLanguage(), "zh");
    assert.doesNotThrow(() => saveLanguage("en"));
    assert.equal(translate("总览", "en"), "Overview");
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else delete globalThis.localStorage;
  }
});
test("language changes format only; cents, currency and due-day boundaries stay exact", () => {
  assert.equal(money(21566, "CAD", "en"), "$215.66");
  assert.match(money(8076, "CNY", "en"), /80\.76/);
  assert.equal(dueLabel("2026-11-09", "2026-11-09", "en"), "Due today");
  assert.equal(dueLabel("2026-11-10", "2026-11-09", "en"), "1 day overdue");
  assert.equal(dueLabel("2026-11-05", "2026-11-09", "en"), "Due in 4 days");
  assert.equal(dueLabel("2026-10-31", "2026-11-01", "en"), "Due in 1 day");
});

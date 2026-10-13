import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
const A = "11111111-1111-4111-8111-111111111111",
  B = "22222222-2222-4222-8222-222222222222";
let db, day, priorDay, bank, card, bBank, setupArgs;
async function as(user) {
  await db.exec(
    `reset role; set role authenticated; select set_config('request.jwt.claim.sub','${user}',false);`,
  );
}
async function rpc(name, args) {
  const placeholders = args.map((_, i) => `$${i + 1}`).join(",");
  return (
    await db.query(`select public.${name}(${placeholders}) as result`, args)
  ).rows[0].result;
}
await (async () => {
  db = new PGlite();
  await db.exec(
    `create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated; insert into auth.users values('${A}'),('${B}');`,
  );
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/20261013000100_savewise.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  day = (
    await db.query(
      `select (now() at time zone 'America/Toronto')::date::text as day`,
    )
  ).rows[0].day;
  priorDay = (await db.query(`select ($1::date-1)::text as day`, [day])).rows[0]
    .day;
  await as(A);
  setupArgs = [
    randomUUID(),
    day,
    "America/Toronto",
    JSON.stringify([
      {
        name: "A Bank",
        kind: "asset",
        currency: "CAD",
        balance_cents: 200000,
        reserved_cents: 10000,
      },
      {
        name: "A Card",
        kind: "liability",
        currency: "CAD",
        balance_cents: 80000,
      },
    ]),
  ];
  await rpc("sw_setup", setupArgs);
  const a = await rpc("sw_dashboard", []);
  bank = a.accounts.find((x) => x.kind === "asset").id;
  card = a.accounts.find((x) => x.kind === "liability").id;
  await as(B);
  await rpc("sw_setup", [
    randomUUID(),
    day,
    "America/Toronto",
    JSON.stringify([
      { name: "B Bank", kind: "asset", currency: "CNY", balance_cents: 100000 },
    ]),
  ]);
  bBank = (await rpc("sw_dashboard", [])).accounts[0].id;
})();
after(async () => {
  await db?.close();
});
test("RLS isolates A/B; writes cannot bypass RPC and references enforce owner", async () => {
  await as(A);
  assert.equal(
    (await db.query("select * from public.sw_accounts")).rows.length,
    2,
  );
  assert.equal(
    (await db.query("select * from public.sw_accounts where id=$1", [bBank]))
      .rows.length,
    0,
  );
  await assert.rejects(
    db.query("update public.sw_accounts set balance_cents=1"),
    /permission denied/,
  );
  await assert.rejects(
    rpc("sw_record", [
      randomUUID(),
      "expense",
      bBank,
      null,
      100,
      null,
      day,
      "",
      false,
    ]),
    /无权限/,
  );
  await assert.rejects(
    rpc("sw_record", [
      randomUUID(),
      "transfer",
      bank,
      bBank,
      100,
      20,
      day,
      "",
      false,
    ]),
    /无权限/,
  );
  await assert.rejects(
    rpc("sw_reserve", [randomUUID(), bBank, 1, 1]),
    /无权限/,
  );
  await as(B);
  assert.equal((await rpc("sw_dashboard", [])).accounts.length, 1);
});
test("opening balances are not income or expense", async () => {
  await as(A);
  const d = await rpc("sw_dashboard", []);
  assert.deepEqual(d.monthly, []);
  assert.equal(d.accounts.find((a) => a.id === bank).balance_cents, 200000);
});
test("partial repayment allocates oldest bill and retries are idempotent", async () => {
  await as(A);
  await rpc("sw_statement", [randomUUID(), card, 60000, 60000, day]);
  await assert.rejects(
    rpc("sw_statement", [randomUUID(), card, 60000, 60000, day]),
    /duplicate key/,
  );
  const key = randomUUID(),
    args = [key, "repayment", bank, card, 20000, 20000, day, "部分还款", false];
  const one = await rpc("sw_record", args),
    two = await rpc("sw_record", args);
  assert.equal(one.id, two.id);
  const d = await rpc("sw_dashboard", []);
  assert.equal(d.accounts.find((a) => a.id === bank).balance_cents, 180000);
  assert.equal(d.accounts.find((a) => a.id === card).balance_cents, 60000);
  assert.equal(d.statements[0].remaining_cents, 40000);
  assert.deepEqual(d.monthly, []);
  await assert.rejects(
    rpc("sw_record", [
      key,
      "repayment",
      bank,
      card,
      30000,
      30000,
      day,
      "部分还款",
      false,
    ]),
    /重试内容变化/,
  );
});
test("invalid transaction rolls back; same-account transfer is rejected", async () => {
  await as(A);
  const before = await rpc("sw_dashboard", []);
  await assert.rejects(
    rpc("sw_record", [
      randomUUID(),
      "transfer",
      bank,
      bank,
      100,
      100,
      day,
      "",
      false,
    ]),
    /不同/,
  );
  await assert.rejects(
    rpc("sw_record", [
      randomUUID(),
      "expense",
      bank,
      null,
      -1,
      null,
      day,
      "",
      false,
    ]),
    /无效/,
  );
  assert.deepEqual((await rpc("sw_dashboard", [])).accounts, before.accounts);
});
test("mixed currencies stay separate; historical import never changes opening balance", async () => {
  await as(A);
  const cny = await rpc("sw_add_account", [
    randomUUID(),
    "A CNY",
    "asset",
    "CNY",
    100000,
    0,
    day,
  ]);
  await rpc("sw_record", [
    randomUUID(),
    "expense",
    cny,
    null,
    5000,
    null,
    day,
    "CNY food",
    false,
  ]);
  await rpc("sw_record", [
    randomUUID(),
    "expense",
    bank,
    null,
    1000,
    null,
    day,
    "CAD food",
    false,
  ]);
  const before = await rpc("sw_dashboard", []);
  await rpc("sw_record", [
    randomUUID(),
    "expense",
    bank,
    null,
    777,
    null,
    priorDay,
    "补历史",
    false,
  ]);
  const after = await rpc("sw_dashboard", []);
  assert.equal(
    after.accounts.find((a) => a.id === bank).balance_cents,
    before.accounts.find((a) => a.id === bank).balance_cents,
  );
  assert.equal(
    after.monthly.find((m) => m.currency === "CNY").expense_cents,
    5000,
  );
  await rpc("sw_record", [
    randomUUID(),
    "transfer",
    cny,
    bank,
    5000,
    1000,
    day,
    "换汇",
    false,
  ]);
  const moved = await rpc("sw_dashboard", []);
  assert.equal(moved.transactions[0].currency, "CNY");
  assert.equal(moved.transactions[0].target_currency, "CAD");
  assert.equal(moved.transactions[0].target_cents, 1000);
});
test("reconciliation checks version, preserves audit, and reversal respects checkpoint", async () => {
  await as(A);
  const d = await rpc("sw_dashboard", []),
    account = d.accounts.find((a) => a.id === bank);
  await assert.rejects(
    rpc("sw_reconcile", [
      randomUUID(),
      bank,
      150000,
      account.version - 1,
      day,
      "",
    ]),
    /余额已变化/,
  );
  const key = randomUUID(),
    args = [key, bank, 150000, account.version, day, "银行核对"];
  const tx = await rpc("sw_reconcile", args);
  assert.equal((await rpc("sw_reconcile", args)).id, tx.id);
  assert.equal(tx.before_cents, account.balance_cents);
  assert.equal(tx.after_cents, 150000);
  const old = d.transactions.find(
    (t) => t.kind === "expense" && t.source_id === bank,
  );
  await rpc("sw_reverse", [old.id]);
  assert.equal(
    (await rpc("sw_dashboard", [])).accounts.find((a) => a.id === bank)
      .balance_cents,
    150000,
  );
  const fresh = await rpc("sw_record", [
    randomUUID(),
    "expense",
    bank,
    null,
    300,
    null,
    day,
    "fresh",
    false,
  ]);
  await rpc("sw_reverse", [fresh.id]);
  await rpc("sw_reverse", [fresh.id]);
  assert.equal(
    (await rpc("sw_dashboard", [])).accounts.find((a) => a.id === bank)
      .balance_cents,
    150000,
  );
});
test("settings and onboarding retry receipts do not overwrite later changes", async () => {
  await as(A);
  const beforeSetupRetry = (await rpc("sw_dashboard", [])).accounts;
  await rpc("sw_setup", setupArgs);
  assert.deepEqual((await rpc("sw_dashboard", [])).accounts, beforeSetupRetry);
  const key = randomUUID(),
    args = [key, "Retry Bank", "asset", "CAD", 10000, 0, day];
  const id = await rpc("sw_add_account", args);
  assert.equal(await rpc("sw_add_account", args), id);
  let account = (await rpc("sw_dashboard", [])).accounts.find(
    (a) => a.id === id,
  );
  const reserveKey = randomUUID(),
    reserve = [reserveKey, id, 1000, account.version];
  await rpc("sw_reserve", reserve);
  await rpc("sw_reserve", reserve);
  account = (await rpc("sw_dashboard", [])).accounts.find((a) => a.id === id);
  assert.equal(account.version, 2);
  await assert.rejects(
    rpc("sw_reserve", [randomUUID(), id, 1000, 1]),
    /余额已变化/,
  );
});
test("cross-period repayment allocation and reversal restore each bill exactly once", async () => {
  await as(A);
  const c = await rpc("sw_add_account", [
    randomUUID(),
    "Multi Card",
    "liability",
    "CAD",
    100000,
    0,
    day,
  ]);
  const first = randomUUID(),
    second = randomUUID();
  await rpc("sw_statement", [first, c, 30000, 30000, priorDay]);
  await rpc("sw_statement", [second, c, 50000, 50000, day]);
  const tx = await rpc("sw_record", [
    randomUUID(),
    "repayment",
    bank,
    c,
    40000,
    40000,
    day,
    "跨期",
    false,
  ]);
  let d = await rpc("sw_dashboard", []);
  assert.equal(d.statements.find((s) => s.id === first).remaining_cents, 0);
  assert.equal(
    d.statements.find((s) => s.id === second).remaining_cents,
    40000,
  );
  // A lost response on statement creation does not mistake later payment for a changed request.
  assert.equal(
    await rpc("sw_statement", [first, c, 30000, 30000, priorDay]),
    first,
  );
  await rpc("sw_reverse", [tx.id]);
  await rpc("sw_reverse", [tx.id]);
  d = await rpc("sw_dashboard", []);
  assert.equal(d.statements.find((s) => s.id === first).remaining_cents, 30000);
  assert.equal(
    d.statements.find((s) => s.id === second).remaining_cents,
    50000,
  );
});
test("manual statement correction has version protection and prevents stale repayment reversal", async () => {
  await as(A);
  const c = await rpc("sw_add_account", [
      randomUUID(),
      "Correction Card",
      "liability",
      "CAD",
      90000,
      0,
      day,
    ]),
    bill = randomUUID();
  await rpc("sw_statement", [bill, c, 50000, 50000, day]);
  const tx = await rpc("sw_record", [
    randomUUID(),
    "repayment",
    bank,
    c,
    10000,
    10000,
    day,
    "",
    false,
  ]);
  let b = (await rpc("sw_dashboard", [])).statements.find((s) => s.id === bill);
  const key = randomUUID(),
    args = [key, bill, 50000, 35000, day, b.version];
  await rpc("sw_update_statement", args);
  await rpc("sw_update_statement", args);
  await assert.rejects(
    rpc("sw_update_statement", [
      randomUUID(),
      bill,
      50000,
      30000,
      day,
      b.version,
    ]),
    /账单已变化/,
  );
  await assert.rejects(rpc("sw_reverse", [tx.id]), /账单已手动更正/);
  await as(B);
  await assert.rejects(
    rpc("sw_update_statement", [randomUUID(), bill, 50000, 1, day, 3]),
    /无权限/,
  );
});
test("refund reduces expenses, never becomes card income; transfer cannot bypass repayment allocation", async () => {
  await as(A);
  const before = await rpc("sw_dashboard", []);
  const tx = await rpc("sw_record", [
    randomUUID(),
    "refund",
    card,
    null,
    1000,
    null,
    day,
    "退款",
    false,
  ]);
  const after = await rpc("sw_dashboard", []);
  assert.equal(
    after.accounts.find((a) => a.id === card).balance_cents,
    before.accounts.find((a) => a.id === card).balance_cents - 1000,
  );
  assert.equal(
    after.monthly.find((m) => m.currency === "CAD").expense_cents,
    before.monthly.find((m) => m.currency === "CAD").expense_cents - 1000,
  );
  assert.equal(
    after.monthly.find((m) => m.currency === "CAD").income_cents,
    before.monthly.find((m) => m.currency === "CAD").income_cents,
  );
  await assert.rejects(
    rpc("sw_record", [
      randomUUID(),
      "income",
      card,
      null,
      1000,
      null,
      day,
      "",
      false,
    ]),
    /退款类型/,
  );
  await assert.rejects(
    rpc("sw_record", [
      randomUUID(),
      "transfer",
      bank,
      card,
      1000,
      1000,
      day,
      "",
      false,
    ]),
    /还款类型/,
  );
  await rpc("sw_reverse", [tx.id]);
});
test("a new authenticated user receives onboarding, not a false empty dashboard", async () => {
  const C = "33333333-3333-4333-8333-333333333333";
  await db.exec(`reset role; insert into auth.users values('${C}');`);
  await as(C);
  const dashboard = await rpc("sw_dashboard", []);
  assert.equal(dashboard.profile, null);
  assert.deepEqual(dashboard.accounts, []);
  await assert.rejects(
    rpc("sw_setup", [randomUUID(), day, "America/Toronto", null]),
    /添加/,
  );
  assert.equal((await rpc("sw_dashboard", [])).profile, null);
});
test("unauthenticated cannot use financial tables or RPCs", async () => {
  await db.exec(
    `reset role; set role anon; select set_config('request.jwt.claim.sub','',false);`,
  );
  await assert.rejects(
    db.query("select * from public.sw_accounts"),
    /permission denied/,
  );
  await assert.rejects(rpc("sw_dashboard", []), /permission denied/);
  await db.exec("reset role");
  await assert.rejects(rpc("sw_dashboard", []), /请先登录/);
});

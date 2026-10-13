export type Currency = "CAD" | "CNY";
export type Account = {
  id: string;
  name: string;
  kind: "asset" | "liability";
  currency: Currency;
  balance_cents: number;
  reserved_cents: number;
  opening_on: string;
  checkpoint_on: string;
  version: number;
};
export type Statement = {
  id: string;
  account_id: string;
  statement_cents: number;
  remaining_cents: number;
  due_on: string;
  version: number;
};
export type Transaction = {
  id: string;
  kind: string;
  source_id: string;
  target_id: string | null;
  amount_cents: number;
  target_cents: number | null;
  currency: Currency;
  target_currency: Currency | null;
  occurred_on: string;
  note: string;
  source_effect: boolean;
  target_effect: boolean;
  reversed_at: string | null;
  before_cents: number | null;
  after_cents: number | null;
};
export type Dashboard = {
  profile: {
    started_on: string;
    timezone: string;
    coverage_incomplete: boolean;
  } | null;
  today: string;
  as_of: string;
  accounts: Account[];
  statements: Statement[];
  transactions: Transaction[];
  monthly: {
    currency: Currency;
    expense_cents: number;
    income_cents: number;
  }[];
};
export function cents(value: string): number {
  if (!/^-?\d+(\.\d{1,2})?$/.test(value.trim()))
    throw new Error("金额最多两位小数，请输入有效数字");
  const negative = value.trim().startsWith("-");
  const [whole, fraction = ""] = value.trim().replace("-", "").split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(result) || result > 1_000_000_000_000)
    throw new Error("金额超出范围");
  return negative ? -result : result;
}
export const money = (value: number, currency: Currency) =>
  new Intl.NumberFormat("zh-CN", { style: "currency", currency }).format(
    value / 100,
  );
export function localDay(timezone = "America/Toronto"): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (name: string) => parts.find((p) => p.type === name)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function dayDistance(today: string, due: string): number {
  return Math.round(
    (Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) /
      86_400_000,
  );
}
export function dueLabel(today: string, due: string): string {
  const days = dayDistance(today, due);
  return days < 0
    ? `逾期 ${-days} 天`
    : days === 0
      ? "今天到期"
      : `${days} 天后到期`;
}
export function available(
  data: Dashboard,
  currency: Currency,
): { cash: number; reserved: number; repayment: number; spendable: number } {
  const assets = data.accounts.filter(
    (a) => a.kind === "asset" && a.currency === currency,
  );
  const cash = assets.reduce((sum, a) => sum + a.balance_cents, 0);
  const reserved = assets.reduce((sum, a) => sum + a.reserved_cents, 0);
  const repayment = data.statements
    .filter(
      (s) =>
        data.accounts.some(
          (a) => a.id === s.account_id && a.currency === currency,
        ) && dayDistance(data.today, s.due_on) <= 30,
    )
    .reduce((sum, s) => sum + s.remaining_cents, 0);
  return { cash, reserved, repayment, spendable: cash - reserved - repayment };
}
export function demoDashboard(): Dashboard {
  const today = localDay();
  const due = new Date(`${today}T00:00:00Z`);
  due.setUTCDate(due.getUTCDate() + 3);
  return {
    profile: {
      started_on: today,
      timezone: "America/Toronto",
      coverage_incomplete: true,
    },
    today,
    as_of: new Date().toISOString(),
    accounts: [
      {
        id: "demo-bank",
        name: "日常银行",
        kind: "asset",
        currency: "CAD",
        balance_cents: 240000,
        reserved_cents: 120000,
        opening_on: today,
        checkpoint_on: today,
        version: 1,
      },
      {
        id: "demo-card",
        name: "示例信用卡",
        kind: "liability",
        currency: "CAD",
        balance_cents: 80000,
        reserved_cents: 0,
        opening_on: today,
        checkpoint_on: today,
        version: 1,
      },
    ],
    statements: [
      {
        id: "demo-bill",
        account_id: "demo-card",
        statement_cents: 50000,
        remaining_cents: 30000,
        due_on: due.toISOString().slice(0, 10),
        version: 1,
      },
    ],
    transactions: [],
    monthly: [],
  };
}

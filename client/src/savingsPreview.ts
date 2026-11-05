import { demoDashboard } from "./finance";
import type { Account, Dashboard } from "./finance";

// Development preview only. Goal allocations are part of account reserves, not expenses.
export type PreviewGoal = {
  name: string;
  accountId: string;
  target: number;
  allocated: number;
  monthly: number;
};
export const initialPreviewGoal: PreviewGoal = {
  name: "备用金",
  accountId: "demo-bank",
  target: 300000,
  allocated: 60000,
  monthly: 0,
};
export function updateGoalReserve(
  accounts: Account[],
  previous: PreviewGoal | null,
  next: PreviewGoal,
): Account[] {
  if (!next.name.trim() || next.name.trim().length > 40)
    throw new Error("给目标起个名字，最多 40 个字");
  if (
    !Number.isSafeInteger(next.target) ||
    next.target <= 0 ||
    next.target > 1000000000000
  )
    throw new Error("目标金额需要大于零");
  if (
    !Number.isSafeInteger(next.allocated) ||
    next.allocated < 0 ||
    !Number.isSafeInteger(next.monthly) ||
    next.monthly < 0 ||
    next.allocated + next.monthly > next.target
  )
    throw new Error("已留好的钱不能小于零，也不能超过目标");
  if (!accounts.some((a) => a.id === next.accountId && a.kind === "asset"))
    throw new Error("请选择存放这笔钱的日常账户");
  if (
    previous &&
    !accounts.some((a) => a.id === previous.accountId && a.kind === "asset")
  )
    throw new Error("原来的存钱账户不存在，请重新设置");
  return accounts.map((account) => {
    const released =
      previous?.accountId === account.id
        ? previous.allocated + previous.monthly
        : 0;
    const added =
      next.accountId === account.id ? next.allocated + next.monthly : 0;
    if (!released && !added) return account;
    const reserved = account.reserved_cents - released + added;
    if (reserved < 0 || reserved > Math.max(account.balance_cents, 0))
      throw new Error("这个账户的钱不够，请调低已留好的金额");
    return { ...account, reserved_cents: reserved };
  });
}
// Confirmation reclassifies reserved money; it must not reserve or create money again.
export function confirmPreviewMonth(goal: PreviewGoal): PreviewGoal {
  return { ...goal, allocated: goal.allocated + goal.monthly, monthly: 0 };
}
export function layoutPreviewDashboard(): Dashboard {
  const data = demoDashboard();
  data.accounts[0] = { ...data.accounts[0], name: "日常银行卡" };
  data.accounts[1] = {
    ...data.accounts[1],
    name: "日常信用卡",
    balance_cents: 80000,
  };
  data.accounts.push(
    {
      ...data.accounts[0],
      id: "demo-saving",
      name: "储蓄账户",
      balance_cents: 80000,
      reserved_cents: 0,
    },
    {
      ...data.accounts[1],
      id: "demo-travel",
      name: "出行信用卡",
      balance_cents: 18000,
    },
    {
      ...data.accounts[1],
      id: "demo-shopping",
      name: "购物信用卡",
      balance_cents: 26000,
    },
  );
  data.statements.push(
    {
      ...data.statements[0],
      id: "demo-travel-bill",
      account_id: "demo-travel",
      statement_cents: 18000,
      remaining_cents: 18000,
    },
    {
      ...data.statements[0],
      id: "demo-shopping-bill",
      account_id: "demo-shopping",
      statement_cents: 22000,
      remaining_cents: 22000,
    },
  );
  return data;
}

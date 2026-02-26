import React, { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Wallet, Smartphone, CreditCard, Banknote, Send, AlertCircle } from "lucide-react";

const API_BASE = "http://localhost:5005";

type AccountKey = "WeChat" | "Cash" | "CreditCard" | "DebitCard";

type BackendAccount = {
  _id: string;
  name: AccountKey;
  type: "asset" | "liability";
  balance: number;
  dueDate?: number;
  billingDate?: number;
};

type MonthlyStats = {
  totalIncome: number;
  totalExpense: number;
  year: number;
  month: number;
};

// 固定顺序与展示名，用于渲染四张卡片
const ACCOUNT_ORDER: { key: AccountKey; label: string }[] = [
  { key: "WeChat", label: "WeChat" },
  { key: "Cash", label: "Cash" },
  { key: "CreditCard", label: "Credit Card" },
  { key: "DebitCard", label: "Debit Card" },
];

const App: React.FC = () => {
  const [isDark, setIsDark] = useState(false);
  const [backendHealthy, setBackendHealthy] = useState<boolean | null>(null);
  const [accountsFromApi, setAccountsFromApi] = useState<BackendAccount[]>([]);
  const [highlightKeys, setHighlightKeys] = useState<AccountKey[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 本月收支统计（顶部看板 Income/Expense）
  const [monthlyStats, setMonthlyStats] = useState<MonthlyStats | null>(null);

  // 初始对账 Modal：当前正在编辑的账户、余额、还款日
  const [reconcileAccount, setReconcileAccount] = useState<AccountKey | null>(null);
  const [reconcileInput, setReconcileInput] = useState("");
  const [reconcileDueDate, setReconcileDueDate] = useState("");
  const [isReconciling, setIsReconciling] = useState(false);

  // 从后端拉取所有账户；若为空则先调 init-accounts 再拉取
  const fetchAccounts = useCallback(async (): Promise<BackendAccount[] | null> => {
    try {
      const res = await fetch(`${API_BASE}/api/accounts`);
      if (!res.ok) throw new Error("Failed to load accounts");
      const data: BackendAccount[] = await res.json();
      if (data.length === 0) {
        await fetch(`${API_BASE}/api/init-accounts`);
        const retry = await fetch(`${API_BASE}/api/accounts`);
        if (!retry.ok) return null;
        const retryData: BackendAccount[] = await retry.json();
        setAccountsFromApi(retryData);
        return retryData;
      }
      setAccountsFromApi(data);
      return data;
    } catch (e) {
      console.error(e);
      return null;
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = (e: MediaQueryListEvent) => setIsDark(e.matches);
    setIsDark(mq.matches);
    mq.addEventListener("change", listener);
    return () => mq.removeEventListener("change", listener);
  }, []);

  const fetchMonthlyStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/stats/monthly`);
      if (!res.ok) return;
      const data: MonthlyStats = await res.json();
      setMonthlyStats(data);
    } catch {
      // ignore
    }
  }, []);

  // 页面加载：检查健康、拉取账户、拉取本月统计
  useEffect(() => {
    const init = async () => {
      try {
        const healthRes = await fetch(`${API_BASE}/health`);
        setBackendHealthy(healthRes.ok);
        if (!healthRes.ok) return;
        await fetchAccounts();
        await fetchMonthlyStats();
      } catch (e) {
        console.error(e);
        setBackendHealthy(false);
      }
    };
    init();
  }, [fetchAccounts, fetchMonthlyStats]);

  // 按固定顺序合并后端数据，便于渲染四张卡片
  const accounts = useMemo(() => {
    return ACCOUNT_ORDER.map(({ key, label }) => {
      const apiAcc = accountsFromApi.find((a) => a.name === key);
      return {
        key,
        label,
        balance: apiAcc?.balance ?? 0,
        type: apiAcc?.type ?? "asset",
        dueDate: apiAcc?.dueDate,
      };
    });
  }, [accountsFromApi]);

  // 信用卡还款日是否在 3 天内（含已过期）
  const isDueWithinThreeDays = useCallback((dueDate: number | undefined) => {
    if (dueDate == null) return false;
    const today = new Date();
    const thisMonthDue = new Date(today.getFullYear(), today.getMonth(), dueDate);
    let nextDue = thisMonthDue;
    if (thisMonthDue < today) {
      nextDue = new Date(today.getFullYear(), today.getMonth() + 1, dueDate);
    }
    const daysLeft = Math.ceil((nextDue.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
    return daysLeft <= 3;
  }, []);

  // Total Balance = 资产余额总和 - 负债余额
  const totalBalance = useMemo(() => {
    let assetSum = 0;
    let liabilitySum = 0;
    accountsFromApi.forEach((a) => {
      if (a.type === "asset") assetSum += a.balance;
      else liabilitySum += a.balance;
    });
    return assetSum - liabilitySum;
  }, [accountsFromApi]);

  const handleSend = async () => {
    if (!input.trim() || isSending) return;
    setIsSending(true);
    setError(null);

    try {
      const prev = [...accountsFromApi];

      const res = await fetch(`${API_BASE}/api/record`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: input.trim() }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "记账失败");
      }

      const next = await fetchAccounts();
      if (next) {
        const changed: AccountKey[] = [];
        next.forEach((a) => {
          const oldAcc = prev.find((x) => x.name === a.name);
          if (oldAcc && oldAcc.balance !== a.balance) changed.push(a.name);
        });
        if (changed.length > 0) {
          setHighlightKeys(changed);
          setTimeout(() => setHighlightKeys([]), 800);
        }
        await fetchMonthlyStats();
      }
      setInput("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "发送失败，请稍后再试");
    } finally {
      setIsSending(false);
    }
  };

  // 初始对账：打开 Modal 并填入当前余额与还款日
  const openReconcile = (key: AccountKey) => {
    const acc = accounts.find((a) => a.key === key);
    setReconcileAccount(key);
    setReconcileInput(acc ? String(acc.balance) : "0");
    setReconcileDueDate(acc?.dueDate != null ? String(acc.dueDate) : "");
  };

  const closeReconcile = () => {
    setReconcileAccount(null);
    setReconcileInput("");
    setReconcileDueDate("");
  };

  const confirmReconcile = async () => {
    if (reconcileAccount == null) return;
    const num = parseFloat(reconcileInput);
    if (Number.isNaN(num)) return;
    const dueNum = reconcileDueDate.trim() === "" ? undefined : parseInt(reconcileDueDate, 10);
    const payload: { balance: number; dueDate?: number } = { balance: num };
    if (dueNum != null && !Number.isNaN(dueNum) && dueNum >= 1 && dueNum <= 31) {
      payload.dueDate = dueNum;
    }
    setIsReconciling(true);
    try {
      const res = await fetch(`${API_BASE}/api/accounts/${reconcileAccount}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "更新失败");
      }
      await fetchAccounts();
      closeReconcile();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "更新失败");
    } finally {
      setIsReconciling(false);
    }
  };

  const bgColor = isDark ? "#020617" : "#f9fafb";
  const cardBg = isDark ? "rgba(15,23,42,0.96)" : "rgba(255,255,255,0.96)";
  const subtleBorder = isDark ? "rgba(148,163,184,0.3)" : "rgba(226,232,240,0.9)";

  // 底部输入栏高度 + 安全区，用于中间区域 padding-bottom，避免内容被遮挡
  const bottomBarSpacing = "calc(80px + env(safe-area-inset-bottom))";

  return (
    <div
      style={{
        height: "100dvh",
        overflow: "hidden",
        width: "100%",
        maxWidth: "28rem",
        marginLeft: "auto",
        marginRight: "auto",
        display: "flex",
        flexDirection: "column",
        background: bgColor,
        color: isDark ? "#e5e7eb" : "#020617",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, system-ui, "SF Pro Text", "SF Pro Display", sans-serif',
      }}
    >
      {/* 中间可滚动区域：仅此区域滚动，背景与整页不滑动 */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          overflowX: "hidden",
          WebkitOverflowScrolling: "touch",
          paddingLeft: "max(16px, env(safe-area-inset-left))",
          paddingRight: "max(16px, env(safe-area-inset-right))",
          paddingTop: "max(16px, env(safe-area-inset-top))",
          paddingBottom: bottomBarSpacing,
        }}
      >
        {/* 顶部导航区域，类似 Apple Wallet 顶部 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Wallet size={24} />
            <span style={{ fontWeight: 600 }}>SaveWise</span>
          </div>
          <Smartphone size={20} opacity={0.6} />
        </div>

        {/* 总资产卡片：大号数字 + 渐变色 */}
        <motion.div
        layout
        style={{
          borderRadius: 28,
          padding: "20px 20px 24px",
          marginBottom: 20,
          background:
            "linear-gradient(135deg, rgba(59,130,246,1), rgba(236,72,153,1))",
          boxShadow: "0 18px 45px rgba(15,23,42,0.35)",
          color: "#f9fafb",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: "-40%",
            background:
              "radial-gradient(circle at 0% 0%, rgba(255,255,255,0.22), transparent 60%)",
            opacity: 0.8,
            pointerEvents: "none",
          }}
        />
        <div style={{ position: "relative" }}>
          <div style={{ fontSize: 14, opacity: 0.9 }}>Total Balance</div>
          <div
            style={{
              fontSize: 40,
              fontWeight: 700,
              letterSpacing: "-0.04em",
              marginTop: 4,
            }}
          >
            ¥ {totalBalance.toLocaleString("zh-CN")}
          </div>
          <div
            style={{
              marginTop: 10,
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontSize: 12, color: "rgba(34,197,94,1)", fontWeight: 600 }}>
              Income: +¥{(monthlyStats?.totalIncome ?? 0).toLocaleString("zh-CN")}
            </span>
            <span style={{ fontSize: 12, color: "rgba(239,68,68,1)", fontWeight: 600 }}>
              Expense: -¥{(monthlyStats?.totalExpense ?? 0).toLocaleString("zh-CN")}
            </span>
          </div>
          <div
            style={{
              marginTop: 8,
              fontSize: 12,
              opacity: 0.85,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>
              {backendHealthy === null
                ? "Checking backend..."
                : backendHealthy
                ? "Backend · Connected"
                : "Backend · Offline"}
            </span>
            <span>Today · {new Date().toLocaleDateString()}</span>
          </div>
        </div>
      </motion.div>

      {/* 账户网格：四个卡片 */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 12,
        }}
      >
        {accounts.map((acc) => {
          const isHighlighted = highlightKeys.includes(acc.key);

          const icon =
            acc.key === "WeChat" ? (
              <Smartphone size={20} />
            ) : acc.key === "Cash" ? (
              <Banknote size={20} />
            ) : acc.key === "CreditCard" ? (
              <CreditCard size={20} />
            ) : (
              <CreditCard size={20} />
            );

          return (
            <motion.div
              key={acc.key}
              role="button"
              tabIndex={0}
              onClick={() => openReconcile(acc.key)}
              onKeyDown={(e) => e.key === "Enter" && openReconcile(acc.key)}
              layout
              initial={false}
              animate={
                isHighlighted
                  ? {
                      boxShadow: [
                        "0 0 0 0 rgba(34,197,94,0.0)",
                        "0 0 22px 6px rgba(34,197,94,0.85)",
                        "0 0 0 0 rgba(34,197,94,0.0)",
                      ],
                      scale: [1, 1.03, 1],
                    }
                  : {
                      boxShadow: "0 10px 25px rgba(15,23,42,0.12)",
                      scale: 1,
                    }
              }
              transition={{ duration: 0.6 }}
              style={{
                borderRadius: 22,
                padding: "14px 14px 16px",
                background: cardBg,
                border: `1px solid ${subtleBorder}`,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                position: "relative",
                overflow: "hidden",
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: "-30%",
                  background:
                    "radial-gradient(circle at 0% 0%, rgba(148,163,184,0.22), transparent 60%)",
                  opacity: isDark ? 0.9 : 0.7,
                  pointerEvents: "none",
                }}
              />
              <div
                style={{
                  position: "relative",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 10,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  {icon}
                  <span>{acc.label}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {acc.key === "CreditCard" && isDueWithinThreeDays(acc.dueDate) && (
                    <AlertCircle
                      size={18}
                      color="rgba(239,68,68,1)"
                      style={{ flexShrink: 0 }}
                      aria-label="还款日临近"
                    />
                  )}
                  <div
                    style={{
                      fontSize: 11,
                      opacity: 0.7,
                      padding: "3px 8px",
                      borderRadius: 999,
                      border: `1px solid ${subtleBorder}`,
                      backgroundColor: isDark
                        ? "rgba(15,23,42,0.8)"
                        : "rgba(248,250,252,0.85)",
                    }}
                  >
                    Active
                  </div>
                </div>
              </div>
              <div style={{ position: "relative" }}>
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 700,
                    letterSpacing: "-0.02em",
                  }}
                >
                  ¥ {acc.balance.toLocaleString("zh-CN")}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
      </div>

      {/* 初始对账 Modal：点击卡片后弹出，输入当前余额并 PUT 同步 */}
      {reconcileAccount != null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="设置当前余额"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            background: "rgba(0,0,0,0.5)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
          }}
          onClick={(e) => e.target === e.currentTarget && closeReconcile()}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            style={{
              width: "100%",
              maxWidth: 320,
              borderRadius: 24,
              padding: 24,
              background: cardBg,
              border: `1px solid ${subtleBorder}`,
              boxShadow: "0 24px 48px rgba(0,0,0,0.25)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ marginBottom: 16, fontSize: 16, fontWeight: 600 }}>
              {ACCOUNT_ORDER.find((a) => a.key === reconcileAccount)?.label} · 账户设置
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 12, opacity: 0.8, marginBottom: 4 }}>
                当前余额
              </label>
              <input
                type="number"
                inputMode="decimal"
                value={reconcileInput}
                onChange={(e) => setReconcileInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmReconcile();
                  if (e.key === "Escape") closeReconcile();
                }}
                autoFocus
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "12px 16px",
                  fontSize: 18,
                  borderRadius: 12,
                  border: `1px solid ${subtleBorder}`,
                  background: isDark ? "rgba(15,23,42,0.6)" : "rgba(248,250,252,0.9)",
                  color: isDark ? "#e5e7eb" : "#020617",
                }}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 12, opacity: 0.8, marginBottom: 4 }}>
                还款日 (1–31，仅信用卡等负债账户)
              </label>
              <input
                type="number"
                min={1}
                max={31}
                inputMode="numeric"
                placeholder="如 10"
                value={reconcileDueDate}
                onChange={(e) => setReconcileDueDate(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmReconcile();
                  if (e.key === "Escape") closeReconcile();
                }}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "12px 16px",
                  fontSize: 16,
                  borderRadius: 12,
                  border: `1px solid ${subtleBorder}`,
                  background: isDark ? "rgba(15,23,42,0.6)" : "rgba(248,250,252,0.9)",
                  color: isDark ? "#e5e7eb" : "#020617",
                }}
              />
            </div>
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={closeReconcile}
                style={{
                  padding: "10px 18px",
                  borderRadius: 12,
                  border: `1px solid ${subtleBorder}`,
                  background: "transparent",
                  color: isDark ? "#e5e7eb" : "#020617",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmReconcile}
                disabled={isReconciling}
                style={{
                  padding: "10px 18px",
                  borderRadius: 12,
                  border: "none",
                  background: "linear-gradient(135deg, #22c55e, #4ade80)",
                  color: "#f9fafb",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: isReconciling ? "not-allowed" : "pointer",
                  opacity: isReconciling ? 0.7 : 1,
                }}
              >
                {isReconciling ? "同步中..." : "确认"}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* 底部输入框：固定在最底端，不随键盘或滚动错位 */}
      <div
        style={{
          position: "fixed",
          left: "max(16px, env(safe-area-inset-left))",
          right: "max(16px, env(safe-area-inset-right))",
          bottom: 0,
          paddingBottom: "max(12px, env(safe-area-inset-bottom))",
          maxWidth: "28rem",
          marginLeft: "auto",
          marginRight: "auto",
          zIndex: 40,
        }}
      >
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.35 }}
          style={{
            padding: "8px 10px",
            borderRadius: 999,
            backdropFilter: "blur(18px)",
            WebkitBackdropFilter: "blur(18px)",
            backgroundColor: isDark
              ? "rgba(15,23,42,0.88)"
              : "rgba(255,255,255,0.9)",
            border: `1px solid ${
              isDark ? "rgba(30,64,175,0.7)" : "rgba(191,219,254,0.9)"
            }`,
            boxShadow: "0 18px 45px rgba(15,23,42,0.35)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="例如：今天中午用微信花了 35 块钱吃饭"
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              background: "transparent",
              fontSize: 14,
              color: isDark ? "#e5e7eb" : "#020617",
            }}
          />
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={handleSend}
            disabled={!input.trim() || isSending}
            style={{
              borderRadius: 999,
              padding: "8px 14px",
              border: "none",
              display: "flex",
              alignItems: "center",
              gap: 6,
              cursor: !input.trim() || isSending ? "not-allowed" : "pointer",
              opacity: !input.trim() || isSending ? 0.6 : 1,
              background:
                "linear-gradient(135deg, #22c55e, #22c55e, #4ade80)",
              color: "#f9fafb",
              fontSize: 13,
              fontWeight: 600,
              boxShadow: "0 10px 30px rgba(22,163,74,0.65)",
            }}
          >
            <Send size={16} />
            <span>{isSending ? "记录中..." : "记一笔"}</span>
          </motion.button>
        </motion.div>
        {error && (
          <div
            style={{
              marginTop: 6,
              fontSize: 12,
              color: "#f97316",
              textAlign: "center",
            }}
          >
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

export default App;

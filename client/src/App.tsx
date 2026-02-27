import React, { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Wallet, Smartphone, CreditCard, Banknote, Send, AlertCircle, Sparkles, Plus } from "lucide-react";

const API_BASE = "http://localhost:5005";
const SAVING_GOAL_STORAGE_KEY = "savewise_saving_goal";
const DEFAULT_SAVING_GOAL = 10000;

type Currency = "CAD" | "CNY";
type AccountType = "asset" | "liability";

type BackendAccount = {
  _id: string;
  name: string;
  type: AccountType;
  balance: number;
  dueDate?: number;
  currency: Currency;
  displayCurrency?: Currency;
};

type AccountsResponse = {
  accounts: BackendAccount[];
  fx: {
    cadToCny: number;
    fetchedAt: string;
  };
};

type MonthlyStats = {
  totalIncome: number;
  totalExpense: number;
  year: number;
  month: number;
};

type AnalyzeResponse = {
  roast: string;
  weeklyTotal: number;
  expenseCount: number;
};

const CORE_ORDER = ["WeChat", "Cash", "CreditCard", "DebitCard"];

const currencySymbol = (c: Currency) => (c === "CNY" ? "¥" : "$");

const convertAmount = (amount: number, from: Currency, to: Currency, cadToCny: number): number => {
  if (from === to) return amount;
  if (from === "CAD" && to === "CNY") return amount * cadToCny;
  return amount / cadToCny;
};

const App: React.FC = () => {
  const [isDark, setIsDark] = useState(false);
  const [backendHealthy, setBackendHealthy] = useState<boolean | null>(null);
  const [accountsFromApi, setAccountsFromApi] = useState<BackendAccount[]>([]);
  const [highlightKeys, setHighlightKeys] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [monthlyStats, setMonthlyStats] = useState<MonthlyStats | null>(null);

  const [cadToCnyRate, setCadToCnyRate] = useState(5);
  const [totalCurrency, setTotalCurrency] = useState<Currency>("CAD");

  const [reconcileAccount, setReconcileAccount] = useState<string | null>(null);
  const [reconcileInput, setReconcileInput] = useState("");
  const [reconcileDueDate, setReconcileDueDate] = useState("");
  const [reconcileDisplayCurrency, setReconcileDisplayCurrency] = useState<Currency>("CAD");
  const [reconcileUseFxDisplay, setReconcileUseFxDisplay] = useState(false);
  const [isReconciling, setIsReconciling] = useState(false);

  const [isAddingCard, setIsAddingCard] = useState(false);
  const [newCardName, setNewCardName] = useState("");
  const [newCardBalance, setNewCardBalance] = useState("0");
  const [newCardDueDate, setNewCardDueDate] = useState("");
  const [newCardCurrency, setNewCardCurrency] = useState<Currency>("CAD");
  const [isCreatingCard, setIsCreatingCard] = useState(false);

  const [savingGoal, setSavingGoal] = useState(DEFAULT_SAVING_GOAL);
  const [isSettingGoal, setIsSettingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState(String(DEFAULT_SAVING_GOAL));

  const [isRoastOpen, setIsRoastOpen] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [roastData, setRoastData] = useState<AnalyzeResponse | null>(null);

  const fetchAccounts = useCallback(async (): Promise<BackendAccount[] | null> => {
    try {
      const res = await fetch(`${API_BASE}/api/accounts`);
      if (!res.ok) throw new Error("Failed to load accounts");
      const data: AccountsResponse = await res.json();

      if (data.accounts.length === 0) {
        await fetch(`${API_BASE}/api/init-accounts`);
        const retry = await fetch(`${API_BASE}/api/accounts`);
        if (!retry.ok) return null;
        const retryData: AccountsResponse = await retry.json();
        setAccountsFromApi(retryData.accounts);
        setCadToCnyRate(retryData.fx.cadToCny);
        return retryData.accounts;
      }

      setAccountsFromApi(data.accounts);
      setCadToCnyRate(data.fx.cadToCny);
      return data.accounts;
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const cachedGoal = window.localStorage.getItem(SAVING_GOAL_STORAGE_KEY);
    if (!cachedGoal) return;
    const num = Number(cachedGoal);
    if (!Number.isNaN(num) && num > 0) {
      setSavingGoal(num);
      setGoalInput(String(num));
    }
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

  const accounts = useMemo(() => {
    const orderMap = new Map(CORE_ORDER.map((name, i) => [name, i]));
    return [...accountsFromApi].sort((a, b) => {
      const ai = orderMap.has(a.name) ? (orderMap.get(a.name) as number) : 999;
      const bi = orderMap.has(b.name) ? (orderMap.get(b.name) as number) : 999;
      if (ai !== bi) return ai - bi;
      return a.name.localeCompare(b.name);
    });
  }, [accountsFromApi]);

  const isDueWithinFiveDays = useCallback((dueDate: number | undefined) => {
    if (dueDate == null) return false;
    const today = new Date();
    const thisMonthDue = new Date(today.getFullYear(), today.getMonth(), dueDate);
    let nextDue = thisMonthDue;
    if (thisMonthDue < today) {
      nextDue = new Date(today.getFullYear(), today.getMonth() + 1, dueDate);
    }
    const daysLeft = Math.ceil((nextDue.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
    return daysLeft <= 5;
  }, []);

  const totalBalance = useMemo(() => {
    // CAD 基准：CAD 直接相加；CNY 按实时汇率除回 CAD 后再汇总
    const totalCad = accountsFromApi.reduce((sum, acc) => {
      const nativeCadAmount = acc.currency === "CAD" ? acc.balance : acc.balance / cadToCnyRate;
      return sum + (acc.type === "asset" ? nativeCadAmount : -nativeCadAmount);
    }, 0);
    return totalCurrency === "CAD" ? totalCad : totalCad * cadToCnyRate;
  }, [accountsFromApi, cadToCnyRate, totalCurrency]);

  const goalProgress = useMemo(() => {
    const goalInDisplayCurrency = convertAmount(savingGoal, "CNY", totalCurrency, cadToCnyRate);
    if (goalInDisplayCurrency <= 0) return 0;
    return Math.max(0, Math.min(100, (totalBalance / goalInDisplayCurrency) * 100));
  }, [savingGoal, totalBalance, totalCurrency, cadToCnyRate]);

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
        const changed: string[] = [];
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

  const openReconcile = (name: string) => {
    const acc = accounts.find((a) => a.name === name);
    if (!acc) return;
    setReconcileAccount(name);
    setReconcileInput(String(acc.balance));
    setReconcileDueDate(acc.type === "liability" && acc.dueDate != null ? String(acc.dueDate) : "");
    const currentDisplay = acc.displayCurrency ?? acc.currency;
    const useFx = currentDisplay !== acc.currency;
    setReconcileUseFxDisplay(useFx);
    setReconcileDisplayCurrency(useFx ? currentDisplay : acc.currency === "CAD" ? "CNY" : "CAD");
  };

  const closeReconcile = () => {
    setReconcileAccount(null);
    setReconcileInput("");
    setReconcileDueDate("");
    setReconcileDisplayCurrency("CAD");
    setReconcileUseFxDisplay(false);
  };

  const confirmReconcile = async () => {
    if (!reconcileAccount) return;
    const num = parseFloat(reconcileInput);
    if (Number.isNaN(num)) return;

    const selected = accounts.find((a) => a.name === reconcileAccount);
    const dueNum = reconcileDueDate.trim() === "" ? undefined : parseInt(reconcileDueDate, 10);

    // 重要：balance 始终按账户原生货币存储，不做任何汇率转换
    const nativeBalance = num;
    const nextDisplayCurrency =
      selected == null
        ? reconcileDisplayCurrency
        : reconcileUseFxDisplay
          ? reconcileDisplayCurrency
          : selected.currency;
    const payload: { balance: number; dueDate?: number; displayCurrency?: Currency } = {
      balance: nativeBalance,
      displayCurrency: nextDisplayCurrency,
    };

    if (selected?.type === "liability" && dueNum != null && !Number.isNaN(dueNum) && dueNum >= 1 && dueNum <= 31) {
      payload.dueDate = dueNum;
    }

    setIsReconciling(true);
    try {
      const res = await fetch(`${API_BASE}/api/accounts/${encodeURIComponent(reconcileAccount)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "更新失败");
      }
      const updated: BackendAccount = await res.json();
      setAccountsFromApi((prev) => prev.map((acc) => (acc.name === updated.name ? { ...acc, ...updated } : acc)));
      await fetchAccounts();
      closeReconcile();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "更新失败");
    } finally {
      setIsReconciling(false);
    }
  };

  const createCreditCard = async () => {
    const name = newCardName.trim();
    const bal = Number(newCardBalance);
    const due = newCardDueDate.trim() === "" ? undefined : Number(newCardDueDate);
    if (!name) {
      setError("请填写信用卡名称");
      return;
    }
    if (Number.isNaN(bal)) {
      setError("请填写有效的初始欠款");
      return;
    }

    setIsCreatingCard(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/accounts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          type: "liability",
          balance: bal,
          dueDate: due,
          currency: newCardCurrency,
          displayCurrency: newCardCurrency,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "创建信用卡失败");
      }
      await fetchAccounts();
      setIsAddingCard(false);
      setNewCardName("");
      setNewCardBalance("0");
      setNewCardDueDate("");
      setNewCardCurrency("CAD");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "创建信用卡失败");
    } finally {
      setIsCreatingCard(false);
    }
  };

  const openGoalSetter = () => {
    setGoalInput(String(savingGoal));
    setIsSettingGoal(true);
  };

  const confirmGoal = () => {
    const parsed = Number(goalInput);
    if (Number.isNaN(parsed) || parsed <= 0) {
      setError("目标金额必须大于 0");
      return;
    }
    setSavingGoal(parsed);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SAVING_GOAL_STORAGE_KEY, String(parsed));
    }
    setIsSettingGoal(false);
  };

  const handleAnalyze = async () => {
    setIsRoastOpen(true);
    setIsAnalyzing(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/analyze`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "AI 分析失败");
      }
      const data: AnalyzeResponse = await res.json();
      setRoastData(data);
    } catch (e: unknown) {
      setRoastData(null);
      setError(e instanceof Error ? e.message : "AI 分析失败");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const bgColor = isDark ? "#020617" : "#f9fafb";
  const cardBg = isDark ? "rgba(15,23,42,0.96)" : "rgba(255,255,255,0.96)";
  const subtleBorder = isDark ? "rgba(148,163,184,0.3)" : "rgba(226,232,240,0.9)";
  const bottomBarSpacing = "calc(160px + env(safe-area-inset-bottom))";

  const selectedAccount = accounts.find((a) => a.name === reconcileAccount);
  const selectedIsLiability = selectedAccount?.type === "liability";

  return (
    <div style={{ height: "100dvh", overflow: "hidden", width: "100%", maxWidth: "28rem", marginLeft: "auto", marginRight: "auto", display: "flex", flexDirection: "column", background: bgColor, color: isDark ? "#e5e7eb" : "#020617", fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, "SF Pro Text", "SF Pro Display", sans-serif' }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", WebkitOverflowScrolling: "touch", paddingLeft: "max(16px, env(safe-area-inset-left))", paddingRight: "max(16px, env(safe-area-inset-right))", paddingTop: "max(16px, env(safe-area-inset-top))", paddingBottom: bottomBarSpacing }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Wallet size={24} />
            <span style={{ fontWeight: 600 }}>SaveWise</span>
          </div>
          <Smartphone size={20} opacity={0.6} />
        </div>

        <motion.div layout style={{ borderRadius: 28, padding: "20px 20px 24px", marginBottom: 20, background: "linear-gradient(135deg, rgba(59,130,246,1), rgba(236,72,153,1))", boxShadow: "0 18px 45px rgba(15,23,42,0.35)", color: "#f9fafb", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: "-40%", background: "radial-gradient(circle at 0% 0%, rgba(255,255,255,0.22), transparent 60%)", opacity: 0.8, pointerEvents: "none" }} />
          <div style={{ position: "relative" }}>
            <div style={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center" }}>
              <button type="button" onClick={openGoalSetter} style={{ background: "transparent", border: "none", color: "inherit", padding: 0, cursor: "pointer", textAlign: "left" }}>
                <span style={{ fontSize: 14, opacity: 0.9 }}>Total Balance</span>
              </button>
              <div style={{ display: "flex", gap: 6 }}>
                {(["CAD", "CNY"] as Currency[]).map((c) => (
                  <button key={c} type="button" onClick={() => setTotalCurrency(c)} style={{ borderRadius: 999, border: "none", padding: "4px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", color: totalCurrency === c ? "#0f172a" : "rgba(248,250,252,0.88)", background: totalCurrency === c ? "rgba(248,250,252,0.95)" : "rgba(15,23,42,0.3)" }}>{c}</button>
                ))}
              </div>
            </div>
            <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: "-0.04em", marginTop: 4 }}>{currencySymbol(totalCurrency)} {totalBalance.toLocaleString("en-CA", { maximumFractionDigits: 2 })}</div>

            <div style={{ marginTop: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, opacity: 0.92, marginBottom: 6 }}>
                <span>存款目标 ¥{savingGoal.toLocaleString("zh-CN")}</span>
                <span>{goalProgress.toFixed(0)}%</span>
              </div>
              <div style={{ height: 10, borderRadius: 999, background: "rgba(255,255,255,0.28)", overflow: "hidden" }}>
                <motion.div initial={false} animate={{ width: `${goalProgress}%` }} transition={{ duration: 0.4 }} style={{ height: "100%", borderRadius: 999, background: "linear-gradient(90deg, rgba(34,197,94,0.95), rgba(16,185,129,0.95))", boxShadow: "0 4px 12px rgba(16,185,129,0.45)" }} />
              </div>
            </div>

            <div style={{ marginTop: 10, display: "flex", gap: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: "rgba(34,197,94,1)", fontWeight: 600 }}>Income: +¥{(monthlyStats?.totalIncome ?? 0).toLocaleString("zh-CN")}</span>
              <span style={{ fontSize: 12, color: "rgba(239,68,68,1)", fontWeight: 600 }}>Expense: -¥{(monthlyStats?.totalExpense ?? 0).toLocaleString("zh-CN")}</span>
            </div>
            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.85, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>{backendHealthy === null ? "Checking backend..." : backendHealthy ? "Backend · Connected" : "Backend · Offline"}</span>
              <span>FX 1 CAD = {cadToCnyRate.toFixed(3)} CNY</span>
            </div>
          </div>
        </motion.div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
          {accounts.map((acc) => {
            const isHighlighted = highlightKeys.includes(acc.name);
            const icon = acc.name === "WeChat" ? <Smartphone size={20} /> : acc.name === "Cash" ? <Banknote size={20} /> : <CreditCard size={20} />;
            const showCurrency = acc.displayCurrency ?? acc.currency;
            const useFxDisplay = showCurrency !== acc.currency;
            const showAmount =
              !useFxDisplay
                ? acc.balance
                : convertAmount(acc.balance, acc.currency, showCurrency, cadToCnyRate);
            return (
              <motion.div key={acc.name} role="button" tabIndex={0} onClick={() => openReconcile(acc.name)} onKeyDown={(e) => e.key === "Enter" && openReconcile(acc.name)} layout initial={false} animate={isHighlighted ? { boxShadow: ["0 0 0 0 rgba(34,197,94,0.0)", "0 0 22px 6px rgba(34,197,94,0.85)", "0 0 0 0 rgba(34,197,94,0.0)"], scale: [1, 1.03, 1] } : { boxShadow: "0 10px 25px rgba(15,23,42,0.12)", scale: 1 }} transition={{ duration: 0.6 }} style={{ borderRadius: 22, padding: "14px 14px 16px", background: cardBg, border: `1px solid ${subtleBorder}`, display: "flex", flexDirection: "column", justifyContent: "space-between", position: "relative", overflow: "hidden", cursor: "pointer" }}>
                <div style={{ position: "absolute", inset: "-30%", background: "radial-gradient(circle at 0% 0%, rgba(148,163,184,0.22), transparent 60%)", opacity: isDark ? 0.9 : 0.7, pointerEvents: "none" }} />
                <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 }}>{icon}<span>{acc.name}</span></div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {acc.type === "liability" && isDueWithinFiveDays(acc.dueDate) && <AlertCircle size={18} color="rgba(239,68,68,1)" style={{ flexShrink: 0 }} aria-label="还款日临近" />}
                    <div style={{ fontSize: 11, opacity: 0.7, padding: "3px 8px", borderRadius: 999, border: `1px solid ${subtleBorder}`, backgroundColor: isDark ? "rgba(15,23,42,0.8)" : "rgba(248,250,252,0.85)" }}>{useFxDisplay ? `${showCurrency} · 换算` : showCurrency}</div>
                  </div>
                </div>
                <div style={{ position: "relative" }}><div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em" }}>{currencySymbol(showCurrency)} {showAmount.toLocaleString(showCurrency === "CNY" ? "zh-CN" : "en-CA", { maximumFractionDigits: 2 })}</div></div>
                {acc.type === "liability" && (
                  <div style={{ marginTop: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontSize: 12, opacity: 0.86 }}>还款日：每月 {acc.dueDate || "未设置"} 号</span>
                    {isDueWithinFiveDays(acc.dueDate) && (
                      <span style={{ fontSize: 11, color: "rgba(254,226,226,1)", background: "rgba(220,38,38,0.9)", padding: "3px 8px", borderRadius: 999, fontWeight: 700 }}>
                        即将到期
                      </span>
                    )}
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>

        <div style={{ marginTop: 14 }}>
          <button type="button" onClick={() => setIsAddingCard(true)} style={{ width: "100%", borderRadius: 16, border: `1px solid ${subtleBorder}`, background: isDark ? "rgba(15,23,42,0.76)" : "rgba(255,255,255,0.82)", color: isDark ? "#e2e8f0" : "#0f172a", padding: "11px 14px", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 14, fontWeight: 700, cursor: "pointer", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)" }}>
            <Plus size={16} />
            + 添加信用卡
          </button>
        </div>
      </div>

      {isSettingGoal && (
        <div role="dialog" aria-modal="true" aria-label="设置存款目标" style={{ position: "fixed", inset: 0, zIndex: 55, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }} onClick={(e) => e.target === e.currentTarget && setIsSettingGoal(false)}>
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} style={{ width: "100%", maxWidth: 320, borderRadius: 24, padding: 24, background: cardBg, border: `1px solid ${subtleBorder}`, boxShadow: "0 24px 48px rgba(0,0,0,0.25)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ marginBottom: 16, fontSize: 16, fontWeight: 600 }}>设置存款目标</div>
            <input type="number" inputMode="numeric" value={goalInput} onChange={(e) => setGoalInput(e.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: "12px 16px", fontSize: 18, borderRadius: 12, border: `1px solid ${subtleBorder}`, background: isDark ? "rgba(15,23,42,0.6)" : "rgba(248,250,252,0.9)", color: isDark ? "#e5e7eb" : "#020617" }} />
            <div style={{ marginTop: 16, display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setIsSettingGoal(false)} style={{ padding: "10px 18px", borderRadius: 12, border: `1px solid ${subtleBorder}`, background: "transparent", color: isDark ? "#e5e7eb" : "#020617", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>取消</button>
              <button type="button" onClick={confirmGoal} style={{ padding: "10px 18px", borderRadius: 12, border: "none", background: "linear-gradient(135deg, #3b82f6, #ec4899)", color: "#f9fafb", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>保存</button>
            </div>
          </motion.div>
        </div>
      )}

      {isAddingCard && (
        <div role="dialog" aria-modal="true" aria-label="添加信用卡" style={{ position: "fixed", inset: 0, zIndex: 58, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }} onClick={(e) => e.target === e.currentTarget && setIsAddingCard(false)}>
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} style={{ width: "100%", maxWidth: 340, borderRadius: 24, padding: 24, background: cardBg, border: `1px solid ${subtleBorder}`, boxShadow: "0 24px 48px rgba(0,0,0,0.25)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ marginBottom: 14, fontSize: 16, fontWeight: 600 }}>添加信用卡</div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: "block", fontSize: 12, opacity: 0.8, marginBottom: 4 }}>名称</label>
              <input type="text" value={newCardName} onChange={(e) => setNewCardName(e.target.value)} placeholder="例如 BMO" style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", fontSize: 16, borderRadius: 12, border: `1px solid ${subtleBorder}`, background: isDark ? "rgba(15,23,42,0.6)" : "rgba(248,250,252,0.9)", color: isDark ? "#e5e7eb" : "#020617" }} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: "block", fontSize: 12, opacity: 0.8, marginBottom: 4 }}>初始欠款</label>
              <input type="number" inputMode="decimal" value={newCardBalance} onChange={(e) => setNewCardBalance(e.target.value)} placeholder="0" style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", fontSize: 16, borderRadius: 12, border: `1px solid ${subtleBorder}`, background: isDark ? "rgba(15,23,42,0.6)" : "rgba(248,250,252,0.9)", color: isDark ? "#e5e7eb" : "#020617" }} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: "block", fontSize: 12, opacity: 0.8, marginBottom: 4 }}>还款日 (1-31)</label>
              <input type="number" min={1} max={31} inputMode="numeric" value={newCardDueDate} onChange={(e) => setNewCardDueDate(e.target.value)} placeholder="如 10" style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", fontSize: 16, borderRadius: 12, border: `1px solid ${subtleBorder}`, background: isDark ? "rgba(15,23,42,0.6)" : "rgba(248,250,252,0.9)", color: isDark ? "#e5e7eb" : "#020617" }} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 12, opacity: 0.8, marginBottom: 4 }}>原生币种</label>
              <div style={{ display: "flex", gap: 8 }}>
                {(["CAD", "CNY"] as Currency[]).map((c) => (
                  <button key={c} type="button" onClick={() => setNewCardCurrency(c)} style={{ flex: 1, borderRadius: 10, border: `1px solid ${subtleBorder}`, background: newCardCurrency === c ? "linear-gradient(135deg, #3b82f6, #22c55e)" : "transparent", color: "inherit", padding: "8px 10px", cursor: "pointer", fontWeight: 600 }}>{c}</button>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setIsAddingCard(false)} style={{ padding: "10px 18px", borderRadius: 12, border: `1px solid ${subtleBorder}`, background: "transparent", color: isDark ? "#e5e7eb" : "#020617", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>取消</button>
              <button type="button" onClick={createCreditCard} disabled={isCreatingCard} style={{ padding: "10px 18px", borderRadius: 12, border: "none", background: "linear-gradient(135deg, #22c55e, #4ade80)", color: "#f9fafb", fontSize: 14, fontWeight: 600, cursor: isCreatingCard ? "not-allowed" : "pointer", opacity: isCreatingCard ? 0.7 : 1 }}>{isCreatingCard ? "创建中..." : "创建"}</button>
            </div>
          </motion.div>
        </div>
      )}

      {reconcileAccount != null && (
        <div role="dialog" aria-modal="true" aria-label="账户设置" style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }} onClick={(e) => e.target === e.currentTarget && closeReconcile()}>
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} style={{ width: "100%", maxWidth: 320, borderRadius: 24, padding: 24, background: cardBg, border: `1px solid ${subtleBorder}`, boxShadow: "0 24px 48px rgba(0,0,0,0.25)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ marginBottom: 16, fontSize: 16, fontWeight: 600 }}>{reconcileAccount} · 设置</div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 12, opacity: 0.8, marginBottom: 4 }}>
                {selectedIsLiability ? "当前欠款" : "当前余额"}（原生币种：{selectedAccount?.currency ?? "CAD"}）
              </label>
              <input type="number" inputMode="decimal" value={reconcileInput} onChange={(e) => setReconcileInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") confirmReconcile(); if (e.key === "Escape") closeReconcile(); }} autoFocus style={{ width: "100%", boxSizing: "border-box", padding: "12px 16px", fontSize: 18, borderRadius: 12, border: `1px solid ${subtleBorder}`, background: isDark ? "rgba(15,23,42,0.6)" : "rgba(248,250,252,0.9)", color: isDark ? "#e5e7eb" : "#020617" }} />
            </div>
            {selectedIsLiability && (
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", fontSize: 12, opacity: 0.8, marginBottom: 4 }}>还款日 (1-31)</label>
                <input type="number" min={1} max={31} inputMode="numeric" placeholder="如 10" value={reconcileDueDate} onChange={(e) => setReconcileDueDate(e.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: "12px 16px", fontSize: 16, borderRadius: 12, border: `1px solid ${subtleBorder}`, background: isDark ? "rgba(15,23,42,0.6)" : "rgba(248,250,252,0.9)", color: isDark ? "#e5e7eb" : "#020617" }} />
              </div>
            )}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 12, opacity: 0.8, marginBottom: 4 }}>主显示币种</label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 8 }}>
                <input type="checkbox" checked={reconcileUseFxDisplay} onChange={(e) => setReconcileUseFxDisplay(e.target.checked)} />
                开启换算显示
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                {(["CAD", "CNY"] as Currency[]).map((c) => (
                  <button key={c} type="button" onClick={() => setReconcileDisplayCurrency(c)} disabled={!reconcileUseFxDisplay} style={{ flex: 1, borderRadius: 10, border: `1px solid ${subtleBorder}`, background: reconcileDisplayCurrency === c ? "linear-gradient(135deg, #3b82f6, #22c55e)" : "transparent", color: "inherit", padding: "8px 10px", cursor: reconcileUseFxDisplay ? "pointer" : "not-allowed", fontWeight: 600, opacity: reconcileUseFxDisplay ? 1 : 0.5 }}>{c}</button>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button type="button" onClick={closeReconcile} style={{ padding: "10px 18px", borderRadius: 12, border: `1px solid ${subtleBorder}`, background: "transparent", color: isDark ? "#e5e7eb" : "#020617", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>取消</button>
              <button type="button" onClick={confirmReconcile} disabled={isReconciling} style={{ padding: "10px 18px", borderRadius: 12, border: "none", background: "linear-gradient(135deg, #22c55e, #4ade80)", color: "#f9fafb", fontSize: 14, fontWeight: 600, cursor: isReconciling ? "not-allowed" : "pointer", opacity: isReconciling ? 0.7 : 1 }}>{isReconciling ? "同步中..." : "确认"}</button>
            </div>
          </motion.div>
        </div>
      )}

      {isRoastOpen && (
        <div role="dialog" aria-modal="true" aria-label="AI 吐槽周报" style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "rgba(2,6,23,0.5)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }} onClick={(e) => e.target === e.currentTarget && setIsRoastOpen(false)}>
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} style={{ width: "100%", maxWidth: 360, borderRadius: 24, padding: 22, background: isDark ? "rgba(15,23,42,0.8)" : "rgba(255,255,255,0.8)", border: `1px solid ${subtleBorder}`, boxShadow: "0 24px 48px rgba(0,0,0,0.25)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700 }}><Sparkles size={18} /> AI 毒舌周报</div>
              <button type="button" onClick={() => setIsRoastOpen(false)} style={{ border: "none", background: "transparent", color: isDark ? "#e5e7eb" : "#0f172a", cursor: "pointer" }}>关闭</button>
            </div>
            <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 10 }}>近7天支出 {roastData?.expenseCount ?? 0} 笔，合计 ¥{(roastData?.weeklyTotal ?? 0).toLocaleString("zh-CN")}</div>
            <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.65, fontSize: 15 }}>
              {isAnalyzing ? "AI 正在磨刀霍霍，请稍等..." : roastData?.roast ?? "暂无分析结果"}
            </div>
          </motion.div>
        </div>
      )}

      <div style={{ position: "fixed", left: "max(16px, env(safe-area-inset-left))", right: "max(16px, env(safe-area-inset-right))", bottom: 0, paddingBottom: "max(12px, env(safe-area-inset-bottom))", maxWidth: "28rem", marginLeft: "auto", marginRight: "auto", zIndex: 40 }}>
        <motion.button whileTap={{ scale: 0.97 }} onClick={handleAnalyze} disabled={isAnalyzing} style={{ width: "100%", marginBottom: 10, borderRadius: 16, border: `1px solid ${isDark ? "rgba(96,165,250,0.45)" : "rgba(147,197,253,0.85)"}`, backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", background: isDark ? "rgba(30,41,59,0.76)" : "rgba(241,245,249,0.8)", color: isDark ? "#e2e8f0" : "#0f172a", padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 14, fontWeight: 700, cursor: isAnalyzing ? "not-allowed" : "pointer" }}>
          <Sparkles size={16} />
          {isAnalyzing ? "AI 吐槽中..." : "AI 吐槽"}
        </motion.button>

        <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.35 }} style={{ padding: "8px 10px", borderRadius: 999, backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)", backgroundColor: isDark ? "rgba(15,23,42,0.88)" : "rgba(255,255,255,0.9)", border: `1px solid ${isDark ? "rgba(30,64,175,0.7)" : "rgba(191,219,254,0.9)"}`, boxShadow: "0 18px 45px rgba(15,23,42,0.35)", display: "flex", alignItems: "center", gap: 8 }}>
          <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSend(); } }} placeholder="例如：今天中午在 BMO 信用卡刷了 35 加元吃饭" style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 14, color: isDark ? "#e5e7eb" : "#020617" }} />
          <motion.button whileTap={{ scale: 0.9 }} onClick={handleSend} disabled={!input.trim() || isSending} style={{ borderRadius: 999, padding: "8px 14px", border: "none", display: "flex", alignItems: "center", gap: 6, cursor: !input.trim() || isSending ? "not-allowed" : "pointer", opacity: !input.trim() || isSending ? 0.6 : 1, background: "linear-gradient(135deg, #22c55e, #22c55e, #4ade80)", color: "#f9fafb", fontSize: 13, fontWeight: 600, boxShadow: "0 10px 30px rgba(22,163,74,0.65)" }}>
            <Send size={16} />
            <span>{isSending ? "记录中..." : "记一笔"}</span>
          </motion.button>
        </motion.div>
        {error && <div style={{ marginTop: 6, fontSize: 12, color: "#f97316", textAlign: "center" }}>{error}</div>}
      </div>
    </div>
  );
};

export default App;

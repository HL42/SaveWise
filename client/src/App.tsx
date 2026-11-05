import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  Wallet,
  Plus,
  RefreshCw,
  LogOut,
  ArrowRight,
  CreditCard,
  CheckCircle2,
  House,
  ListFilter,
  X,
  ChevronRight,
  Leaf,
} from "lucide-react";
import { publicConfig, supabase, localPreview } from "./supabase";
import {
  available,
  cents,
  demoDashboard,
  dueLabel as formatDueLabel,
  dayDistance,
  localDay,
  money as formatMoney,
} from "./finance";
import type { Account, Currency, Dashboard, Statement } from "./finance";

import {
  initialPreviewGoal,
  layoutPreviewDashboard,
  updateGoalReserve,
} from "./savingsPreview";
import type { PreviewGoal } from "./savingsPreview";

import {
  readLanguage,
  saveLanguage,
  translate,
  translateMessage,
} from "./locales";
import type { Language } from "./locales";

type Pending = { name: string; params: Record<string, unknown>; owner: string };
type Page = "overview" | "bills" | "accounts" | "history";
const pageLabels: Record<Page, string> = {
  overview: "总览",
  bills: "待还",
  accounts: "账户",
  history: "明细",
};
type Opening = {
  name: string;
  kind: "asset" | "liability";
  currency: Currency;
  balance: string;
  reserved: string;
  statement: string;
  remaining: string;
  due: string;
};
const emptyOpening = (): Opening => ({
  name: "",
  kind: "asset",
  currency: "CAD",
  balance: "0",
  reserved: "0",
  statement: "",
  remaining: "",
  due: "",
});
const labels: Record<string, string> = {
  expense: "支出",
  income: "收入",
  refund: "退款",
  transfer: "转账",
  repayment: "还款",
  adjustment: "对账调整",
};
const cacheKey = (owner: string) => `sw:dashboard:${owner}`;
const pendingKey = (owner: string) => `sw:pending:${owner}`;
function clearLocalFinance() {
  for (const key of Object.keys(sessionStorage))
    if (key.startsWith("sw:")) sessionStorage.removeItem(key);
  for (const key of ["savewise_user_id", "savewise_saving_goal"])
    localStorage.removeItem(key);
}
function saveLocal(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Storage is optional. */
  }
}
function readLocal<T>(key: string): T | null {
  try {
    return JSON.parse(sessionStorage.getItem(key) ?? "null") as T | null;
  } catch {
    return null;
  }
}
function App() {
  const [language, setLanguage] = useState<Language>(readLanguage);
  const t = (source: string, values?: Record<string, unknown>) =>
    translate(source, language, values);
  const money = (value: number, currency: Currency) =>
    formatMoney(value, currency, language);
  const dueLabel = (today: string, due: string) =>
    formatDueLabel(today, due, language);
  useEffect(() => {
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    document.title =
      language === "zh"
        ? "SaveWise · 把钱管清楚"
        : "SaveWise · Know your money";
  }, [language]);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(localPreview);
  const [demo, setDemo] = useState(localPreview);
  const [page, setPage] = useState<Page>("overview");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [snapshot, setSnapshot] = useState<{
    owner: string;
    data: Dashboard;
  } | null>(() =>
    localPreview ? { owner: "demo", data: layoutPreviewDashboard() } : null,
  );
  const [goal, setGoal] = useState<PreviewGoal | null>(() =>
    localPreview ? { ...initialPreviewGoal } : null,
  );
  const [status, setStatus] = useState(
    localPreview ? "本地演示 · 虚构数据" : "等待登录",
  );
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [modal, setModal] = useState<
    "record" | "account" | "reconcile" | "statement" | "reserve" | "goal" | null
  >(null);
  const [selected, setSelected] = useState<Account | null>(null);
  const [selectedBill, setSelectedBill] = useState<Statement | null>(null);
  const [openings, setOpenings] = useState<Opening[]>([
    { ...emptyOpening(), name: translate("日常银行", readLanguage()) },
  ]);
  const [recordKind, setRecordKind] = useState("expense");
  const [recordSource, setRecordSource] = useState("");
  const [recordTarget, setRecordTarget] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const activeOwner = useRef<string | null>(localPreview ? "demo" : null);
  const loadGeneration = useRef(0);
  const submitting = useRef(false);
  const owner = demo ? "demo" : (session?.user.id ?? null);
  const data = snapshot?.owner === owner ? snapshot.data : null;
  const today = data?.today ?? localDay();
  const noticeSuccess =
    notice.startsWith("已保存") || notice.startsWith("目标已");

  const clearDrafts = useCallback(() => {
    setPage("overview");
    setGoal(null);
    setOpenings([
      { ...emptyOpening(), name: translate("日常银行", readLanguage()) },
    ]);
    setSelected(null);
    setSelectedBill(null);
    setRecordKind("expense");
    setRecordSource("");
    setRecordTarget("");
    setPassword("");
    setConfirmPassword("");
    setAuthMode("login");
    setEmail("");
  }, []);

  useEffect(() => {
    if (!modal) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    const viewport = window.visualViewport;
    const fitSheet = () => {
      dialog.style.setProperty(
        "--sheet-height",
        `${viewport?.height ?? window.innerHeight}px`,
      );
      dialog.style.setProperty("--sheet-top", `${viewport?.offsetTop ?? 0}px`);
    };
    fitSheet();
    viewport?.addEventListener("resize", fitSheet);
    viewport?.addEventListener("scroll", fitSheet);
    return () => {
      viewport?.removeEventListener("resize", fitSheet);
      viewport?.removeEventListener("scroll", fitSheet);
      dialog.close();
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [modal]);

  const refresh = useCallback(async (uid: string): Promise<boolean> => {
    if (!supabase || activeOwner.current !== uid) return false;
    const generation = ++loadGeneration.current;
    setLoading(true);
    setStatus("正在同步…");
    let response;
    try {
      response = await supabase.rpc("sw_dashboard");
    } catch {
      if (
        activeOwner.current === uid &&
        generation === loadGeneration.current
      ) {
        setLoading(false);
        setStatus("同步失败 · 显示上次数据");
        setNotice("同步失败：网络中断，请重试");
      }
      return false;
    }
    const { data: result, error } = response;
    if (activeOwner.current !== uid || generation !== loadGeneration.current)
      return false;
    setLoading(false);
    if (error) {
      setStatus("同步失败 · 显示上次数据");
      setNotice(
        error.code === "PGRST202"
          ? "数据库还未应用迁移，请按 docs/SUPABASE_SETUP.md 完成配置。"
          : `同步失败：${error.message}`,
      );
      return false;
    }
    const dashboard = result as Dashboard;
    setSnapshot({ owner: uid, data: dashboard });
    saveLocal(cacheKey(uid), dashboard);
    setStatus("已同步");
    setNotice((previous) =>
      /^(同步失败|数据库还未|已保存，但)/.test(previous) ? "" : previous,
    );
    return true;
  }, []);

  useEffect(() => {
    if (!supabase) {
      queueMicrotask(() => setAuthReady(true));
      return;
    }
    let alive = true;
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, next) => {
        if (!alive) return;
        const uid = next?.user.id ?? null;
        const changed = activeOwner.current !== uid;
        if (changed && activeOwner.current) clearLocalFinance();
        activeOwner.current = uid;
        setSession(next);
        setAuthReady(true);
        if (changed) {
          loadGeneration.current++;
          setSnapshot(null);
          setModal(null);
          clearDrafts();
          setLoading(false);
          setStatus(uid ? "正在同步…" : "等待登录");
          setNotice("");
          setBusy(false);
          const saved = uid ? readLocal<Dashboard>(cacheKey(uid)) : null;
          if (saved && uid) setSnapshot({ owner: uid, data: saved });
          setPending(uid ? readLocal<Pending>(pendingKey(uid)) : null);
        }
        // Do not call Supabase auth methods while its auth callback is holding a lock.
        if (uid)
          window.setTimeout(() => {
            if (alive) void refresh(uid);
          }, 0);
      },
    );
    supabase.auth.getSession().catch(() => {
      if (alive) {
        setAuthReady(true);
        setNotice("无法恢复登录，请重新登录");
      }
    });
    return () => {
      alive = false;
      listener.subscription.unsubscribe();
    };
  }, [refresh, clearDrafts]);

  useEffect(() => {
    const onFocus = () => {
      const uid = activeOwner.current;
      if (uid && uid !== "demo") void refresh(uid);
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onFocus);
    };
  }, [refresh]);

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || busy) return;
    if (
      authMode === "signup" &&
      (password.length < 8 || password !== confirmPassword)
    ) {
      setNotice(password.length < 8 ? "注册密码至少 8 位" : "两次密码不一致");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      if (authMode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) {
          setNotice(
            error.code === "signup_disabled"
              ? "注册暂未开放，请稍后再试或联系应用维护者。"
              : error.code === "email_address_not_authorized"
                ? "注册确认邮件服务尚未开放给外部邮箱，请联系应用维护者配置发信服务。"
                : error.code === "over_email_send_rate_limit"
                  ? "确认邮件发送频率受限，请稍后再试。"
                  : `注册未完成：${error.message}`,
          );
        } else {
          setPassword("");
          setConfirmPassword("");
          setNotice(
            "请查收注册确认邮件，点击验证链接后登录；若未收到，可使用下方的重新发送确认邮件。",
          );
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) setNotice(`登录失败：${error.message}`);
        else setPassword("");
      }
    } catch {
      setNotice("登录服务请求失败，请重试；密码不会被保存。");
    } finally {
      setBusy(false);
    }
  }
  async function resendConfirmation() {
    if (!supabase || busy || !email.trim()) {
      setNotice("请先填写邮箱");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: email.trim(),
        options: { emailRedirectTo: window.location.origin },
      });
      setNotice(
        error
          ? `邮件暂未发送：${error.message}`
          : "确认邮件请求已提交，请检查邮箱和垃圾邮件。",
      );
    } catch {
      setNotice("邮件服务请求失败，请稍后重试。");
    } finally {
      setBusy(false);
    }
  }
  async function magicLink() {
    if (!supabase || !email.trim()) {
      setNotice("请先填写邮箱");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        shouldCreateUser: false,
        emailRedirectTo: window.location.origin,
      },
    });
    setBusy(false);
    setNotice(error ? error.message : "登录链接已发送，请检查邮箱。");
  }
  async function logout() {
    activeOwner.current = null;
    loadGeneration.current++;
    clearLocalFinance();
    setSnapshot(null);
    setPending(null);
    setModal(null);
    clearDrafts();
    setLoading(false);
    setStatus("等待登录");
    setNotice("");
    setDemo(false);
    setSession(null);
    if (supabase) {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error)
        setNotice(`退出会话失败，请关闭当前页面并重试：${error.message}`);
    }
  }
  function enterDemo() {
    if (session) return;
    activeOwner.current = "demo";
    setDemo(true);
    setSnapshot({ owner: "demo", data: demoDashboard() });
    setStatus("虚构数据 · 不连接数据库");
    setNotice("演示只展示虚构数据，登录后才能记账。");
  }

  async function mutate(
    request: Pending,
    onSuccess?: () => void,
  ): Promise<boolean> {
    if (
      !supabase ||
      request.owner !== activeOwner.current ||
      submitting.current ||
      demo
    )
      return false;
    submitting.current = true;
    setBusy(true);
    setNotice("");
    setPending(request);
    saveLocal(pendingKey(request.owner), request);
    try {
      const { error } = await supabase.rpc(request.name, request.params);
      if (request.owner !== activeOwner.current) return false;
      if (error) {
        const uncertain =
          !error.code ||
          error.code.startsWith("5") ||
          /fetch|network|timeout|abort/i.test(error.message);
        if (!uncertain) {
          setPending(null);
          sessionStorage.removeItem(pendingKey(request.owner));
        }
        setNotice(
          uncertain
            ? "结果暂未确认。输入已保留，请用“查询并重试”恢复，避免重复记账。"
            : `未保存：${error.message}`,
        );
        return false;
      }
      setPending(null);
      sessionStorage.removeItem(pendingKey(request.owner));
      onSuccess?.();
      setNotice("已保存。正在刷新余额…");
      const synced = await refresh(request.owner);
      if (request.owner === activeOwner.current)
        setNotice(
          synced
            ? "已保存并同步"
            : "已保存，但余额刷新失败。正在显示上次数据，请刷新。",
        );
      return true;
    } catch {
      if (request.owner === activeOwner.current)
        setNotice("网络中断，结果未知。请查询并重试原请求。");
      return false;
    } finally {
      submitting.current = false;
      if (request.owner === activeOwner.current) setBusy(false);
    }
  }
  async function retry() {
    if (!pending || !supabase) return;
    // The database deduplicates the exact original request, even if the previous response was lost.
    await mutate(pending, () => setModal(null));
  }
  async function setup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!owner) return;
    try {
      const accounts = openings.map((a) => ({
        name: a.name.trim(),
        kind: a.kind,
        currency: a.currency,
        balance_cents: cents(a.balance),
        reserved_cents: a.kind === "asset" ? cents(a.reserved) : 0,
        ...(a.due
          ? {
              statement_cents: cents(a.statement),
              remaining_cents: cents(a.remaining),
              due_on: a.due,
            }
          : {}),
      }));
      await mutate({
        name: "sw_setup",
        owner,
        params: {
          p_key: crypto.randomUUID(),
          p_started_on: today,
          p_timezone: "America/Toronto",
          p_accounts: accounts,
        },
      });
    } catch (error) {
      setNotice((error as Error).message);
    }
  }
  function open(which: typeof modal, account?: Account) {
    if (pending) {
      setNotice("请先恢复上一次结果未知的请求。");
      return;
    }
    setSelected(account ?? null);
    setSelectedBill(null);
    setRecordKind("expense");
    const last = owner ? readLocal<string>(`sw:last-account:${owner}`) : null;
    setRecordSource(
      account?.id ??
        data?.accounts.find((a) => a.id === last)?.id ??
        data?.accounts.find((a) => a.kind === "asset")?.id ??
        data?.accounts[0]?.id ??
        "",
    );
    setRecordTarget("");
    setModal(which);
    setNotice("");
  }
  function changeRecordKind(kind: string) {
    setRecordKind(kind);
    if (
      ["income", "transfer", "repayment"].includes(kind) &&
      data?.accounts.find((a) => a.id === recordSource)?.kind !== "asset"
    ) {
      setRecordSource(data?.accounts.find((a) => a.kind === "asset")?.id ?? "");
    }
    if (
      kind === "repayment" &&
      data?.accounts.find((a) => a.id === recordTarget)?.kind !== "liability"
    )
      setRecordTarget("");
    if (
      kind === "transfer" &&
      data?.accounts.find((a) => a.id === recordTarget)?.kind !== "asset"
    )
      setRecordTarget("");
  }
  async function submitModal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!owner || !data || pending) return;
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) ?? "");
    try {
      if (modal === "goal" && localPreview) {
        const next = {
          name: value("goalName").trim(),
          accountId: value("goalAccount"),
          target: cents(value("goalTarget")),
          allocated: cents(value("goalAllocated")),
        };
        const accounts = updateGoalReserve(data.accounts, goal, next);
        setSnapshot({ owner: "demo", data: { ...data, accounts } });
        setGoal(next);
        setModal(null);
        setNotice(
          "目标已在本页更新。这笔钱已计入预留，不会再扣一次。刷新后恢复演示数据。",
        );
        return;
      }
      if (demo) return;
      const key = crypto.randomUUID();
      let name = "";
      let params: Record<string, unknown> = {};
      if (modal === "record") {
        const transfer = ["transfer", "repayment"].includes(recordKind);
        const source = data.accounts.find((a) => a.id === recordSource);
        const target = data.accounts.find((a) => a.id === recordTarget);
        const amount = cents(value("amount"));
        if (recordKind === "income" && source?.kind === "liability")
          throw new Error("信用卡退款请使用退款类型");
        if (amount <= 0) throw new Error("金额必须大于零");
        name = "sw_record";
        params = {
          p_key: key,
          p_kind: recordKind,
          p_source: recordSource,
          p_target: transfer ? recordTarget : null,
          p_amount: amount,
          p_target_amount: transfer
            ? source?.currency === target?.currency
              ? amount
              : cents(value("targetAmount"))
            : null,
          p_on: value("date"),
          p_note: value("note"),
          p_history_only: form.has("historyOnly"),
        };
      } else if (modal === "reconcile" && selected) {
        name = "sw_reconcile";
        params = {
          p_key: key,
          p_account: selected.id,
          p_balance: cents(value("balance")),
          p_version: selected.version,
          p_on: today,
          p_note: value("note"),
        };
      } else if (modal === "reserve" && selected) {
        name = "sw_reserve";
        params = {
          p_key: key,
          p_account: selected.id,
          p_reserved: cents(value("reserved")),
          p_version: selected.version,
        };
      } else if (modal === "statement" && selected) {
        name = selectedBill ? "sw_update_statement" : "sw_statement";
        params = {
          p_key: key,
          ...(selectedBill
            ? { p_statement: selectedBill.id, p_version: selectedBill.version }
            : { p_account: selected.id }),
          p_amount: cents(value("statement")),
          p_remaining: cents(value("remaining")),
          p_due: value("due"),
        };
      } else if (modal === "account") {
        name = "sw_add_account";
        params = {
          p_key: key,
          p_name: value("name"),
          p_kind: value("kind"),
          p_currency: value("currency"),
          p_balance: cents(value("balance")),
          p_reserved: 0,
          p_on: today,
        };
      }
      if (name)
        await mutate({ name, params, owner }, () => {
          if (name === "sw_record")
            saveLocal(`sw:last-account:${owner}`, recordSource);
          setModal(null);
        });
    } catch (error) {
      setNotice((error as Error).message);
    }
  }
  async function reverse(id: string) {
    if (!owner || demo || pending) return;
    if (
      !window.confirm(
        t("撤销这笔交易？记录会保留；已对账前的交易不会再次改变当前余额。"),
      )
    )
      return;
    await mutate({ name: "sw_reverse", owner, params: { p_transaction: id } });
  }
  function updateOpening(index: number, patch: Partial<Opening>) {
    setOpenings((list) =>
      list.map((a, i) => (i === index ? { ...a, ...patch } : a)),
    );
  }
  const source = data?.accounts.find((a) => a.id === recordSource);
  const target = data?.accounts.find((a) => a.id === recordTarget);
  const transfer = ["transfer", "repayment"].includes(recordKind);
  const unpaidBills = (data?.statements ?? [])
    .filter((bill) => bill.remaining_cents > 0)
    .sort((a, b) => a.due_on.localeCompare(b.due_on));
  const navigate = (next: Page) => {
    setPage(next);
    window.scrollTo({ top: 0, behavior: "instant" });
  };

  return (
    <div className={`shell ${owner && data?.profile ? "has-navigation" : ""}`}>
      <header>
        <div className="brand">
          <span className="brand-icon">
            <Wallet size={23} />
          </span>
          <div>
            <strong>SaveWise</strong>
            <small>
              {owner && data?.profile
                ? `${t(pageLabels[page])} · ${today}`
                : t("把钱管清楚，生活轻一点")}
            </small>
          </div>
        </div>
        <div className="header-actions">
          <div
            className="language-switch"
            role="group"
            aria-label={t("界面语言")}
          >
            {(["zh", "en"] as const).map((next) => (
              <button
                type="button"
                key={next}
                lang={next === "zh" ? "zh-CN" : "en"}
                aria-label={next === "zh" ? "中文" : "English"}
                aria-pressed={language === next}
                onClick={() => {
                  saveLanguage(next);
                  setLanguage(next);
                }}
              >
                {next === "zh" ? "中文" : "EN"}
              </button>
            ))}
          </div>
          {owner && !localPreview && (
            <button
              className="quiet logout"
              aria-label={t(demo ? "退出演示" : "退出")}
              onClick={() => void logout()}
            >
              <LogOut size={16} />
              <span>{t(demo ? "退出演示" : "退出")}</span>
            </button>
          )}
        </div>
      </header>
      {!owner ? (
        <main className="auth panel">
          <div className="eyebrow">{t("自己的账，自己看")}</div>
          <h1>{authMode === "signup" ? t("创建自己的账本") : t("欢迎回来")}</h1>
          <p>{t("用真实登录保护余额。演示数据与个人账户完全隔离。")}</p>
          {!supabase && (
            <div className="warning">
              {import.meta.env.DEV
                ? t(
                    "Supabase 客户端配置{0}。请检查 client/.env.local 中的 URL 和公开 Publishable / anon key，并重启开发服务。",
                    {
                      0:
                        publicConfig.status === "missing"
                          ? t("缺失")
                          : t("无效"),
                    },
                  )
                : t(
                    "登录服务尚未配置，请联系应用维护者；无需在自己的设备创建 .env 文件。",
                  )}
            </div>
          )}
          <div className="tabs" aria-label={t("登录或注册")}>
            <button
              type="button"
              className={authMode === "login" ? "active" : ""}
              disabled={busy}
              onClick={() => {
                setAuthMode("login");
                setPassword("");
                setConfirmPassword("");
                setNotice("");
              }}
            >
              {t("登录")}
            </button>
            <button
              type="button"
              className={authMode === "signup" ? "active" : ""}
              disabled={busy}
              onClick={() => {
                setAuthMode("signup");
                setPassword("");
                setConfirmPassword("");
                setNotice("");
              }}
            >
              {t("注册")}
            </button>
          </div>
          <form onSubmit={authenticate}>
            <label>
              {t("邮箱")}
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label>
              {t("密码")}
              <input
                type="password"
                autoComplete={
                  authMode === "signup" ? "new-password" : "current-password"
                }
                minLength={authMode === "signup" ? 8 : undefined}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {authMode === "signup" && (
              <label>
                {t("再次输入密码")}
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </label>
            )}
            <button
              className="primary"
              disabled={!supabase || busy || !authReady}
            >
              {busy
                ? t("处理中…")
                : authMode === "signup"
                  ? t("注册并验证邮箱")
                  : t("登录")}
            </button>
          </form>
          <div className="actions">
            {authMode === "signup" && (
              <button
                onClick={() => void resendConfirmation()}
                disabled={!supabase || busy}
              >
                {t("重新发送确认邮件")}
              </button>
            )}
            <button
              onClick={() => void magicLink()}
              disabled={!supabase || busy}
            >
              {t("邮箱链接登录")}
            </button>
            <button onClick={enterDemo} disabled={busy || !authReady}>
              {t("查看虚构演示")}
            </button>
          </div>
          <p className="muted">
            {t(
              "每个人使用独立账号和账本；注册完成并确认邮箱后，从自己的当前余额开始。",
            )}
          </p>
          {notice && (
            <div
              role="status"
              className={`warning${noticeSuccess ? " notice-success" : ""}`}
            >
              {translateMessage(notice, language)}
            </div>
          )}
        </main>
      ) : (
        <main id="main-content">
          <div className="sync" role="status">
            <div>
              <span
                className={`sync-status ${status === "已同步" ? "ok" : ""}`}
              >
                {t(status)}
              </span>
              {data && (
                <small>
                  {t("更新于")}{" "}
                  {new Date(data.as_of).toLocaleString(
                    language === "zh" ? "zh-CN" : "en-CA",
                    {
                      month: "numeric",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    },
                  )}
                </small>
              )}
            </div>
            <button
              className="quiet"
              disabled={loading || demo}
              onClick={() => {
                if (owner) void refresh(owner);
              }}
            >
              <RefreshCw size={14} className={loading ? "spin" : ""} />
              {t("刷新")}
            </button>
          </div>
          {notice && (
            <div
              className={`warning${noticeSuccess ? " notice-success" : ""}`}
              role="status"
            >
              {translateMessage(notice, language)}
            </div>
          )}
          {pending && (
            <div className="warning">
              {t("有一笔请求的结果尚未确认。请先恢复，再新增记账。")}
              <button disabled={busy} onClick={() => void retry()}>
                {t("查询并重试")}
              </button>
            </div>
          )}
          {!data ? (
            <section className="panel">
              <h2>
                {loading ? t("正在加载你的账户…") : t("暂时无法读取账户")}
              </h2>
              <p>{t("未同步的数据不会显示为零，也不会被视为成功记账。")}</p>
            </section>
          ) : !data.profile ? (
            <section className="panel onboarding">
              <div className="eyebrow">{t("第一次设置")}</div>
              <h1>{t("从今天开始就好")}</h1>
              <p>
                {t(
                  "无需补齐以前的账。填银行当前余额和信用卡当前欠款，然后只记之后的交易。",
                )}
              </p>
              <p className="muted">
                {t("起始日期：")}
                {today}
                {t("· America/Toronto。余额与欠款不计入收入或消费。")}
              </p>
              <form onSubmit={setup}>
                {openings.map((a, i) => (
                  <fieldset key={i}>
                    <legend>{t("账户 {0}", { 0: i + 1 })}</legend>
                    <div className="form-grid">
                      <label>
                        {t("名称")}
                        <input
                          required
                          maxLength={60}
                          value={a.name}
                          onChange={(e) =>
                            updateOpening(i, { name: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        {t("类型")}
                        <select
                          value={a.kind}
                          onChange={(e) =>
                            updateOpening(i, {
                              kind: e.target.value as Opening["kind"],
                            })
                          }
                        >
                          <option value="asset">
                            {t("银行卡 / 储蓄 / 现金")}
                          </option>
                          <option value="liability">{t("信用卡欠款")}</option>
                        </select>
                      </label>
                      <label>
                        {t("币种")}
                        <select
                          value={a.currency}
                          onChange={(e) =>
                            updateOpening(i, {
                              currency: e.target.value as Currency,
                            })
                          }
                        >
                          <option>CAD</option>
                          <option>CNY</option>
                        </select>
                      </label>
                      <label>
                        {a.kind === "asset" ? t("当前余额") : t("当前总欠款")}
                        <input
                          required
                          inputMode="decimal"
                          value={a.balance}
                          onChange={(e) =>
                            updateOpening(i, { balance: e.target.value })
                          }
                        />
                      </label>
                      {a.kind === "asset" ? (
                        <label>
                          {t("先留给学费、生活费或储蓄的钱（还款另算）")}
                          <input
                            inputMode="decimal"
                            value={a.reserved}
                            onChange={(e) =>
                              updateOpening(i, { reserved: e.target.value })
                            }
                          />
                        </label>
                      ) : (
                        <>
                          <label>
                            {t("本期账单金额（可稍后补）")}
                            <input
                              inputMode="decimal"
                              required={!!a.due}
                              value={a.statement}
                              onChange={(e) =>
                                updateOpening(i, { statement: e.target.value })
                              }
                            />
                          </label>
                          <label>
                            {t("本期剩余应还")}
                            <input
                              inputMode="decimal"
                              required={!!a.due}
                              value={a.remaining}
                              onChange={(e) =>
                                updateOpening(i, { remaining: e.target.value })
                              }
                            />
                          </label>
                          <label>
                            {t("本期实际到期日期")}
                            <input
                              type="date"
                              required={!!a.statement || !!a.remaining}
                              value={a.due}
                              onChange={(e) =>
                                updateOpening(i, { due: e.target.value })
                              }
                            />
                          </label>
                        </>
                      )}
                    </div>
                    {openings.length > 1 && (
                      <button
                        type="button"
                        className="quiet"
                        onClick={() =>
                          setOpenings((list) => list.filter((_, n) => n !== i))
                        }
                      >
                        {t("移除此账户")}
                      </button>
                    )}
                  </fieldset>
                ))}
                <div className="actions">
                  <button
                    type="button"
                    onClick={() =>
                      setOpenings((list) => [...list, emptyOpening()])
                    }
                  >
                    <Plus size={16} />
                    {t("添加账户")}
                  </button>
                  <button className="primary" disabled={busy || !!pending}>
                    {busy ? t("正在保存…") : t("从今天开始")}
                  </button>
                </div>
              </form>
            </section>
          ) : (
            <>
              <section className="hero" hidden={page !== "overview"}>
                <div className="hero-heading">
                  <Wallet size={18} />
                  <span>{t("安心花，心里有数")}</span>
                </div>
                <div className="eyebrow">{t("未来 30 天 · 含逾期还款")}</div>
                <h1>{t("接下来可以花多少")}</h1>
                <div className="balance-grid">
                  {(["CAD", "CNY"] as Currency[])
                    .filter((c) => data.accounts.some((a) => a.currency === c))
                    .map((c) => {
                      const a = available(data, c);
                      return (
                        <div key={c}>
                          <span>{c}</span>
                          <strong>{money(a.spendable, c)}</strong>
                          <dl className="balance-breakdown">
                            <div>
                              <dt>{t("银行卡余额")}</dt>
                              <dd>{money(a.cash, c)}</dd>
                            </div>
                            <div>
                              <dt>{t("留好的钱")}</dt>
                              <dd>{money(a.reserved, c)}</dd>
                            </div>
                            <div>
                              <dt>{t("近期要还")}</dt>
                              <dd>{money(a.repayment, c)}</dd>
                            </div>
                          </dl>
                        </div>
                      );
                    })}
                </div>
                <details className="balance-explanation">
                  <summary>{t("这个金额怎么算？")}</summary>
                  <p>
                    {t(
                      "银行卡里的钱，减去你留好的钱，再减去未来 30 天及已到期还没还的账单。账单没填全时，这个数可能偏高。",
                    )}
                  </p>
                  <p>
                    {t(
                      "CAD 和 CNY 分开算。信用卡新消费还没出账时，会计入总欠款，但不会加到这期应还里。",
                    )}
                  </p>
                </details>
              </section>
              {localPreview && (
                <section
                  className="panel savings-goal"
                  hidden={page !== "overview"}
                >
                  <div className="goal-heading">
                    <span>
                      <Leaf size={19} />
                      {t("储蓄目标")}
                    </span>
                    <button className="quiet" onClick={() => open("goal")}>
                      {goal ? t("调整目标") : t("设置目标")}
                      <ChevronRight size={15} />
                    </button>
                  </div>
                  {goal ? (
                    <>
                      <h2>{goal.name}</h2>
                      <div className="goal-amount">
                        <strong>
                          {money(
                            goal.allocated,
                            data.accounts.find((a) => a.id === goal.accountId)
                              ?.currency ?? "CAD",
                          )}
                        </strong>
                        <span>
                          {t("目标")}{" "}
                          {money(
                            goal.target,
                            data.accounts.find((a) => a.id === goal.accountId)
                              ?.currency ?? "CAD",
                          )}
                        </span>
                      </div>
                      <div
                        className="goal-progress"
                        role="progressbar"
                        aria-label={t("储蓄目标进度")}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(
                          (goal.allocated / goal.target) * 100,
                        )}
                      >
                        <span
                          style={{
                            width: `${(goal.allocated / goal.target) * 100}%`,
                          }}
                        />
                      </div>
                      <div className="goal-caption">
                        <span>
                          {Math.round((goal.allocated / goal.target) * 100)}
                          {t("% 已留好")}
                        </span>
                        <span>{t("已算在上方留好的钱里")}</span>
                      </div>
                    </>
                  ) : (
                    <p className="muted">
                      {t("想存多少钱？先设目标，再慢慢为它留钱。")}
                    </p>
                  )}
                </section>
              )}
              <div
                className={page === "overview" ? "upcoming-overview" : ""}
                hidden={page !== "overview" && page !== "bills"}
              >
                {data.accounts.some(
                  (a) =>
                    a.kind === "liability" &&
                    !data.statements.some((s) => s.account_id === a.id),
                ) && (
                  <div className="warning">
                    {t(
                      "有信用卡还没填本期账单。先补上还剩多少没还、哪天到期，首页金额才更有参考价值。",
                    )}
                  </div>
                )}
                <div className="section-title">
                  <div>
                    <h2>
                      {page === "overview" ? t("接下来要还") : t("还款清单")}
                    </h2>
                    <small>
                      {t("按到期日先后排列 · {0} 笔待还", {
                        0: unpaidBills.length,
                      })}
                    </small>
                  </div>
                  {page === "overview" ? (
                    <button className="quiet" onClick={() => navigate("bills")}>
                      {t("全部")}
                      <ChevronRight size={16} />
                    </button>
                  ) : (
                    <span>{t("还款不再算一笔消费")}</span>
                  )}
                </div>
                <section className="panel bills">
                  {unpaidBills.length === 0 ? (
                    <p className="muted">
                      {t(
                        "这里还没有待还账单。如果卡里有欠款，请先到“账户”填写本期账单。",
                      )}
                    </p>
                  ) : (
                    unpaidBills
                      .slice(0, page === "overview" ? 3 : undefined)
                      .map((bill: Statement) => {
                        const a = data.accounts.find(
                          (a) => a.id === bill.account_id,
                        )!;
                        return (
                          <div className="bill" key={bill.id}>
                            <div className="bill-icon">
                              <CreditCard size={22} />
                            </div>
                            <div className="bill-info">
                              {page === "overview" ? (
                                <button
                                  className="bill-overview-link"
                                  onClick={() => navigate("bills")}
                                >
                                  {a.name}
                                </button>
                              ) : (
                                <strong>{a.name}</strong>
                              )}
                              <small
                                className={`due-label ${dayDistance(today, bill.due_on) <= 3 ? "urgent" : ""}`}
                              >
                                {dueLabel(today, bill.due_on)} · {bill.due_on}
                              </small>
                              {page !== "overview" && (
                                <small>
                                  {t("本期账单")}{" "}
                                  {money(bill.statement_cents, a.currency)}
                                  {t("· 这张卡总共欠")}{" "}
                                  {money(a.balance_cents, a.currency)}
                                </small>
                              )}
                            </div>
                            <div className="bill-amount">
                              <strong>
                                <span className="remaining-label">
                                  {t("剩余应还")}{" "}
                                </span>
                                {money(bill.remaining_cents, a.currency)}
                              </strong>
                              {page !== "overview" && (
                                <>
                                  <button
                                    className="quiet"
                                    disabled={busy || !!pending}
                                    onClick={() => {
                                      open("statement", a);
                                      setSelectedBill(bill);
                                    }}
                                  >
                                    {t("核对")}
                                  </button>
                                  <button
                                    disabled={busy || !!pending}
                                    onClick={() => {
                                      open("record");
                                      setRecordKind("repayment");
                                      setRecordSource(
                                        data.accounts.find(
                                          (account) => account.kind === "asset",
                                        )?.id ?? "",
                                      );
                                      setRecordTarget(a.id);
                                    }}
                                  >
                                    {t("记还款")}
                                    <ArrowRight size={14} />
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })
                  )}
                </section>
              </div>
              <div hidden={page !== "accounts"}>
                <div className="section-title">
                  <div>
                    <h2>{t("我的账户")}</h2>
                    <small>{t("日常账户看余额，信用卡看欠款")}</small>
                  </div>
                  <button
                    className="quiet"
                    disabled={busy || !!pending}
                    onClick={() => open("account")}
                  >
                    <Plus size={16} />
                    {t("添加")}
                  </button>
                </div>
                {(
                  [
                    { kind: "asset", label: t("日常账户"), Icon: Wallet },
                    { kind: "liability", label: t("信用卡"), Icon: CreditCard },
                  ] as const
                ).map((group) => (
                  <section className="account-section" key={group.kind}>
                    <div className="account-group-heading">
                      <h3>
                        <group.Icon size={18} />
                        {group.label}
                      </h3>
                      <span>
                        {
                          data.accounts.filter((a) => a.kind === group.kind)
                            .length
                        }{" "}
                        {t("个")}
                      </span>
                    </div>
                    <div className="account-grid">
                      {data.accounts
                        .filter((a) => a.kind === group.kind)
                        .map((a) => (
                          <section className="panel account" key={a.id}>
                            <div className="account-top">
                              <strong>{a.name}</strong>
                              <span>
                                {a.kind === "asset"
                                  ? t("日常账户")
                                  : t("信用卡")}{" "}
                                · {a.currency}
                              </span>
                            </div>
                            <h3>{money(a.balance_cents, a.currency)}</h3>
                            <small>
                              {a.kind === "asset"
                                ? t("已留好 {0}", {
                                    0: money(a.reserved_cents, a.currency),
                                  })
                                : t("这张卡总共欠的钱，不等于这期要还的金额")}
                            </small>
                            <div className="actions">
                              <button
                                onClick={() => open("reconcile", a)}
                                disabled={busy || !!pending}
                              >
                                {a.kind === "asset"
                                  ? t("核对余额")
                                  : t("核对总欠款")}
                              </button>
                              <button
                                onClick={() =>
                                  open(
                                    a.kind === "asset"
                                      ? "reserve"
                                      : "statement",
                                    a,
                                  )
                                }
                                disabled={busy || !!pending}
                              >
                                {a.kind === "asset"
                                  ? t("留好一笔钱")
                                  : t("添加本期账单")}
                              </button>
                            </div>
                          </section>
                        ))}
                    </div>
                  </section>
                ))}
              </div>
              <div hidden={page !== "history"}>
                <div className="section-title">
                  <h2>{t("本月已记录收支")}</h2>
                </div>
                <section className="panel">
                  <p className="muted">
                    {t("开始记录：")}
                    {data.profile.started_on}
                    {t("；本月覆盖从")}{" "}
                    {data.profile.started_on > `${today.slice(0, 7)}-01`
                      ? data.profile.started_on
                      : `${today.slice(0, 7)}-01`}{" "}
                    {t("到")} {today}
                    {t(
                      "。补记的旧交易也会按发生日期统计。这个月还没核对完整，没记下来不代表没花过。",
                    )}
                  </p>
                  {(["CAD", "CNY"] as Currency[]).map((c) => {
                    const m = data.monthly.find((m) => m.currency === c);
                    return (
                      <div className="stat" key={c}>
                        <span>{c}</span>
                        <span>
                          {t("收入")} {money(m?.income_cents ?? 0, c)}
                        </span>
                        <span>
                          {t("支出")} {money(m?.expense_cents ?? 0, c)}
                        </span>
                      </div>
                    );
                  })}
                </section>
                <div className="section-title">
                  <h2>{t("最近交易")}</h2>
                  <span>{t("最近 100 笔")}</span>
                </div>
                <section className="panel history">
                  {data.transactions.length === 0 ? (
                    <p className="muted">
                      {t("从第一笔开始，慢慢建立清楚的账。")}
                    </p>
                  ) : (
                    data.transactions.map((tx) => (
                      <div
                        className={`transaction ${tx.reversed_at ? "reversed" : ""}`}
                        key={tx.id}
                      >
                        <div>
                          <strong>
                            {t(labels[tx.kind])} ·{" "}
                            {
                              data.accounts.find((a) => a.id === tx.source_id)
                                ?.name
                            }
                          </strong>
                          <small>
                            {tx.occurred_on} · {tx.note || t("无备注")}
                            {tx.target_id
                              ? ` → ${data.accounts.find((a) => a.id === tx.target_id)?.name}`
                              : ""}
                          </small>
                          {!tx.source_effect && (
                            <small>
                              {t("历史补录 · 不再次改变来源账户余额")}
                            </small>
                          )}
                          {tx.reversed_at && (
                            <small>{t("已撤销，原记录保留")}</small>
                          )}
                        </div>
                        <div>
                          <strong>
                            {tx.kind === "adjustment"
                              ? `${money(tx.before_cents ?? 0, tx.currency)} → ${money(tx.after_cents ?? 0, tx.currency)}`
                              : money(tx.amount_cents, tx.currency)}
                          </strong>
                          {tx.target_currency && (
                            <small>
                              {t("到账")}{" "}
                              {money(tx.target_cents ?? 0, tx.target_currency)}
                            </small>
                          )}
                          {tx.kind !== "adjustment" && !tx.reversed_at && (
                            <button
                              className="quiet"
                              disabled={busy || demo || !!pending}
                              onClick={() => void reverse(tx.id)}
                            >
                              {t("撤销")}
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </section>
              </div>
              <nav className="bottom-nav" aria-label={t("主要导航")}>
                {(
                  [
                    "overview",
                    "bills",
                    "record",
                    "accounts",
                    "history",
                  ] as const
                ).map((item) => {
                  const Icon =
                    item === "overview"
                      ? House
                      : item === "bills"
                        ? CreditCard
                        : item === "accounts"
                          ? Wallet
                          : item === "history"
                            ? ListFilter
                            : Plus;
                  return (
                    <button
                      key={item}
                      className={
                        item === "record"
                          ? "nav-record"
                          : page === item
                            ? "nav-active"
                            : ""
                      }
                      aria-current={
                        item !== "record" && page === item ? "page" : undefined
                      }
                      disabled={item === "record" && (busy || !!pending)}
                      onClick={() =>
                        item === "record" ? open("record") : navigate(item)
                      }
                    >
                      <span className="nav-icon">
                        <Icon size={22} />
                      </span>
                      <span>
                        {item === "record" ? t("记一笔") : t(pageLabels[item])}
                      </span>
                    </button>
                  );
                })}
              </nav>
            </>
          )}
        </main>
      )}
      {modal && data && (
        <dialog
          ref={dialogRef}
          className="overlay"
          aria-labelledby="dialog-title"
          onCancel={(e) => {
            e.preventDefault();
            if (!busy && !pending) setModal(null);
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy && !pending)
              setModal(null);
          }}
        >
          <section className="dialog panel">
            <div className="dialog-heading">
              <h2 id="dialog-title">
                {modal === "record"
                  ? t("记一笔")
                  : modal === "account"
                    ? t("添加账户")
                    : modal === "statement"
                      ? `${selected?.name} · ${selectedBill ? t("核对账单") : t("添加账单")}`
                      : modal === "reserve"
                        ? t("{0} · 留好一笔钱", { 0: selected?.name })
                        : modal === "goal"
                          ? t("存钱目标")
                          : t("{0} · 核对余额", { 0: selected?.name })}
              </h2>
              <button
                type="button"
                className="quiet dialog-close"
                aria-label={t("关闭表单")}
                disabled={busy || !!pending}
                onClick={() => setModal(null)}
              >
                <X size={21} />
              </button>
            </div>
            {demo && modal !== "goal" && (
              <p className="demo-note">
                {t("虚构数据 · 可以试填，真实账户不会变化")}
              </p>
            )}
            <form
              className={modal === "record" ? "record-form" : undefined}
              onSubmit={submitModal}
            >
              {modal === "goal" && localPreview && (
                <>
                  <p className="muted">
                    {t("本地试填，刷新后恢复。真实账户不会变化。")}
                  </p>
                  <label>
                    {t("给目标起个名字")}
                    <input
                      name="goalName"
                      defaultValue={goal?.name ?? t("备用金")}
                      maxLength={40}
                      required
                    />
                  </label>
                  <label>
                    {t("从哪个日常账户留钱")}
                    <select
                      name="goalAccount"
                      defaultValue={
                        goal?.accountId ??
                        data.accounts.find((a) => a.kind === "asset")?.id
                      }
                    >
                      {data.accounts
                        .filter((a) => a.kind === "asset")
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}（{a.currency}）
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    {t("总共想存多少（账户币种）")}
                    <input
                      name="goalTarget"
                      inputMode="decimal"
                      defaultValue={goal ? String(goal.target / 100) : ""}
                      required
                    />
                  </label>
                  <label>
                    {t("现在已经留好多少")}
                    <input
                      name="goalAllocated"
                      inputMode="decimal"
                      defaultValue={String((goal?.allocated ?? 0) / 100)}
                      required
                    />
                  </label>
                  <p className="muted">
                    {t(
                      "只算你专门留给这个目标的钱。它会放进账户预留里，不算消费，也不会重复扣掉。",
                    )}
                  </p>
                </>
              )}
              {modal === "record" && (
                <>
                  <div className="tabs record-tabs" aria-label={t("交易类型")}>
                    {[
                      "expense",
                      "income",
                      "refund",
                      "transfer",
                      "repayment",
                    ].map((kind) => (
                      <button
                        type="button"
                        key={kind}
                        className={recordKind === kind ? "active" : ""}
                        aria-pressed={recordKind === kind}
                        onClick={() => changeRecordKind(kind)}
                        disabled={busy || !!pending}
                      >
                        {t(labels[kind])}
                      </button>
                    ))}
                  </div>
                  <label className="amount-field">
                    {recordKind === "repayment"
                      ? t("这次实际还了多少")
                      : transfer
                        ? t("转出金额")
                        : t("金额")}{" "}
                    · {source?.currency}
                    <input
                      name="amount"
                      inputMode="decimal"
                      required
                      placeholder="0.00"
                      autoComplete="off"
                    />
                  </label>
                  <label>
                    {recordKind === "repayment"
                      ? t("从哪张银行卡还")
                      : transfer
                        ? t("从哪个账户转出")
                        : recordKind === "income"
                          ? t("钱收到哪里")
                          : recordKind === "refund"
                            ? t("退到哪个账户")
                            : t("用哪个账户付的")}
                    <select
                      required
                      value={recordSource}
                      onChange={(e) => setRecordSource(e.target.value)}
                    >
                      {(["asset", "liability"] as const).map((kind) => {
                        const accounts = data.accounts.filter(
                          (a) =>
                            a.kind === kind &&
                            (!(transfer || recordKind === "income") ||
                              a.kind === "asset"),
                        );
                        return accounts.length ? (
                          <optgroup
                            key={kind}
                            label={
                              kind === "asset" ? t("日常账户") : t("信用卡")
                            }
                          >
                            {accounts.map((a) => (
                              <option value={a.id} key={a.id}>
                                {a.name} ({a.currency})
                              </option>
                            ))}
                          </optgroup>
                        ) : null;
                      })}
                    </select>
                  </label>
                  {transfer && (
                    <label>
                      {recordKind === "repayment"
                        ? t("还到哪张信用卡")
                        : t("转到哪个账户")}
                      <select
                        required
                        value={recordTarget}
                        onChange={(e) => setRecordTarget(e.target.value)}
                      >
                        <option value="">{t("请选择")}</option>
                        {data.accounts
                          .filter(
                            (a) =>
                              a.id !== recordSource &&
                              (recordKind === "repayment"
                                ? a.kind === "liability"
                                : a.kind === "asset"),
                          )
                          .map((a) => (
                            <option value={a.id} key={a.id}>
                              {a.name} ({a.currency})
                            </option>
                          ))}
                      </select>
                    </label>
                  )}
                  {transfer &&
                    target &&
                    source?.currency !== target.currency && (
                      <label>
                        {t("实际到账 / 减少欠款金额 ·")}
                        {target.currency}
                        <input
                          name="targetAmount"
                          inputMode="decimal"
                          required
                        />
                      </label>
                    )}
                  <label>
                    {t("哪天发生的")}
                    <input
                      name="date"
                      type="date"
                      defaultValue={today}
                      max={today}
                      required
                    />
                  </label>
                  <label>
                    {t("备注")}
                    <input name="note" maxLength={500} />
                  </label>
                  <details className="form-details">
                    <summary>{t("补以前的账？点这里看看")}</summary>
                    <label className="checkbox">
                      <input type="checkbox" name="historyOnly" />{" "}
                      {t("这笔已经包含在银行余额里，只补记录")}
                    </label>
                    <p className="muted">
                      {t(
                        "比最近一次余额核对更早的记录，不会再扣一次钱。同一天补记、且银行余额已经包含这笔时，请勾选上面一项。还款先抵最早到期的账单；多还的部分只减少总欠款。",
                      )}
                    </p>
                  </details>
                </>
              )}
              {modal === "account" && (
                <>
                  <label>
                    {t("账户名称")}
                    <input name="name" required maxLength={60} />
                  </label>
                  <label>
                    {t("类型")}
                    <select name="kind">
                      <option value="asset">
                        {t("日常账户（银行卡 / 现金）")}
                      </option>
                      <option value="liability">{t("信用卡")}</option>
                    </select>
                  </label>
                  <label>
                    {t("币种")}
                    <select name="currency">
                      <option>CAD</option>
                      <option>CNY</option>
                    </select>
                  </label>
                  <label>
                    {t("银行卡余额 / 信用卡总欠款")}
                    <input
                      name="balance"
                      inputMode="decimal"
                      defaultValue="0"
                      required
                    />
                  </label>
                  <p className="muted">
                    {t(
                      "把今天银行显示的数填进来，作为记账起点，不算收入或消费。",
                    )}
                  </p>
                </>
              )}
              {modal === "reconcile" && selected && (
                <>
                  <p>
                    {t("这里记的是")}{" "}
                    {money(selected.balance_cents, selected.currency)}
                    {t(
                      "。填入今天银行显示的实际数，就能继续记账。差额会留下记录，不算收入或消费。",
                    )}
                  </p>
                  <label>
                    {selected.kind === "asset"
                      ? t("银行现在显示的余额")
                      : t("这张卡现在总共欠多少")}{" "}
                    · {selected.currency}
                    <input
                      name="balance"
                      inputMode="decimal"
                      defaultValue={String(selected.balance_cents / 100)}
                      required
                    />
                  </label>
                  <label>
                    {t("为什么有差别（可不填）")}
                    <input
                      name="note"
                      maxLength={500}
                      placeholder={t("例如：漏记几天，按银行余额继续")}
                    />
                  </label>
                  <p className="muted">
                    {t(
                      "核对卡的总欠款，不会改动这期还剩多少。记账期间余额有变化时，会提醒你重新确认。",
                    )}
                  </p>
                </>
              )}
              {modal === "reserve" && selected && (
                <>
                  <p>
                    {t(
                      "学费、生活费或储蓄，想留着不随便花的钱放在这里。信用卡本期还款会另外留出，别重复算。",
                    )}
                  </p>
                  <label>
                    {t("准备留好多少钱 ·")}
                    {selected.currency}
                    <input
                      name="reserved"
                      inputMode="decimal"
                      defaultValue={String(selected.reserved_cents / 100)}
                      required
                    />
                  </label>
                </>
              )}
              {modal === "statement" && selected && (
                <>
                  <label>
                    {t("银行这期账单总额 ·")}
                    {selected.currency}
                    <input
                      name="statement"
                      inputMode="decimal"
                      defaultValue={
                        selectedBill
                          ? String(selectedBill.statement_cents / 100)
                          : ""
                      }
                      required
                    />
                  </label>
                  <label>
                    {t("这期还剩多少没还 ·")}
                    {selected.currency}
                    <input
                      name="remaining"
                      inputMode="decimal"
                      defaultValue={
                        selectedBill
                          ? String(selectedBill.remaining_cents / 100)
                          : ""
                      }
                      required
                    />
                  </label>
                  <label>
                    {t("这期最晚哪天还")}
                    <input
                      name="due"
                      type="date"
                      defaultValue={selectedBill?.due_on ?? ""}
                      required
                    />
                  </label>
                  <p className="muted">
                    {selectedBill
                      ? t(
                          "按银行显示的数修改这期账单。只改这期应还，不改卡的总欠款。",
                        )
                      : t(
                          "一张新账单填一次就好。如果已经还过一部分，剩余应还只填还没还的数。",
                        )}
                  </p>
                </>
              )}
              {notice && (
                <div
                  className={`warning${noticeSuccess ? " notice-success" : ""}`}
                  role="status"
                >
                  {translateMessage(notice, language)}
                </div>
              )}
              <div className="actions dialog-actions">
                <button
                  type="button"
                  disabled={busy || !!pending}
                  onClick={() => setModal(null)}
                >
                  {t("关闭")}
                </button>
                <button
                  className="primary"
                  disabled={busy || !!pending || (demo && modal !== "goal")}
                >
                  {busy ? (
                    t("正在保存…")
                  ) : demo && modal !== "goal" ? (
                    t("演示模式 · 不保存")
                  ) : (
                    <>
                      <CheckCircle2 size={16} />{" "}
                      {modal === "goal" ? t("更新本地目标") : t("确认保存")}
                    </>
                  )}
                </button>
              </div>
            </form>
          </section>
        </dialog>
      )}
      <footer>{t("CAD 和 CNY 分开计算 · 以已同步的记录为准")}</footer>
    </div>
  );
}
export default App;

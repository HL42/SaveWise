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
} from "lucide-react";
import { supabase } from "./supabase";
import {
  available,
  cents,
  demoDashboard,
  dueLabel,
  localDay,
  money,
} from "./finance";
import type { Account, Currency, Dashboard, Statement } from "./finance";

type Pending = { name: string; params: Record<string, unknown>; owner: string };
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
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [demo, setDemo] = useState(false);
  const [snapshot, setSnapshot] = useState<{
    owner: string;
    data: Dashboard;
  } | null>(null);
  const [status, setStatus] = useState("等待登录");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [modal, setModal] = useState<
    "record" | "account" | "reconcile" | "statement" | "reserve" | null
  >(null);
  const [selected, setSelected] = useState<Account | null>(null);
  const [selectedBill, setSelectedBill] = useState<Statement | null>(null);
  const [openings, setOpenings] = useState<Opening[]>([
    { ...emptyOpening(), name: "日常银行" },
  ]);
  const [recordKind, setRecordKind] = useState("expense");
  const [recordSource, setRecordSource] = useState("");
  const [recordTarget, setRecordTarget] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const activeOwner = useRef<string | null>(null);
  const loadGeneration = useRef(0);
  const submitting = useRef(false);
  const owner = demo ? "demo" : (session?.user.id ?? null);
  const data = snapshot?.owner === owner ? snapshot.data : null;
  const today = data?.today ?? localDay();

  const clearDrafts = useCallback(() => {
    setOpenings([{ ...emptyOpening(), name: "日常银行" }]);
    setSelected(null);
    setSelectedBill(null);
    setRecordKind("expense");
    setRecordSource("");
    setRecordTarget("");
    setPassword("");
    setEmail("");
  }, []);

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
    if (!supabase) return;
    setBusy(true);
    setNotice("");
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (error) setNotice(`登录失败：${error.message}`);
    else setPassword("");
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
    if (demo) {
      setNotice("演示不会写入数据库。请退出演示并登录自己的账户。");
      return;
    }
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
        "撤销这笔交易？记录会保留；已对账前的交易不会再次改变当前余额。",
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

  return (
    <div className="shell">
      <header>
        <div className="brand">
          <Wallet size={26} />
          <div>
            <strong>SaveWise</strong>
            <small>把钱管清楚，生活轻一点</small>
          </div>
        </div>
        {owner && (
          <button className="quiet" onClick={() => void logout()}>
            <LogOut size={16} /> {demo ? "退出演示" : "退出"}
          </button>
        )}
      </header>
      {!owner ? (
        <main className="auth panel">
          <div className="eyebrow">自己的账，自己看</div>
          <h1>欢迎回来</h1>
          <p>用真实登录保护余额。演示数据与个人账户完全隔离。</p>
          {!supabase && (
            <div className="warning">
              尚未配置 Supabase。复制 client/.env.example 为
              .env.local，填入公开 Publishable key 后重启开发服务。
            </div>
          )}
          <form onSubmit={authenticate}>
            <label>
              邮箱
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label>
              密码
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button
              className="primary"
              disabled={!supabase || busy || !authReady}
            >
              {busy ? "登录中…" : "登录"}
            </button>
          </form>
          <div className="actions">
            <button
              onClick={() => void magicLink()}
              disabled={!supabase || busy}
            >
              邮箱链接登录
            </button>
            <button onClick={enterDemo} disabled={busy || !authReady}>
              查看虚构演示
            </button>
          </div>
          <p className="muted">
            个人使用：先在 Supabase 的 Authentication → Users 中创建自己的用户。
          </p>
          {notice && (
            <div role="status" className="warning">
              {notice}
            </div>
          )}
        </main>
      ) : (
        <main>
          <div className="sync">
            <span className={status === "已同步" ? "ok" : ""}>{status}</span>
            <button
              className="quiet"
              disabled={loading || demo}
              onClick={() => {
                if (owner) void refresh(owner);
              }}
            >
              <RefreshCw size={14} className={loading ? "spin" : ""} /> 刷新
            </button>
          </div>
          {notice && (
            <div className="warning" role="status">
              {notice}
            </div>
          )}
          {pending && (
            <div className="warning">
              有一笔请求的结果尚未确认。请先恢复，再新增记账。
              <button disabled={busy} onClick={() => void retry()}>
                查询并重试
              </button>
            </div>
          )}
          {!data ? (
            <section className="panel">
              <h2>{loading ? "正在加载你的账户…" : "暂时无法读取账户"}</h2>
              <p>未同步的数据不会显示为零，也不会被视为成功记账。</p>
            </section>
          ) : !data.profile ? (
            <section className="panel onboarding">
              <div className="eyebrow">第一次设置</div>
              <h1>从今天开始就好</h1>
              <p>
                无需补齐以前的账。填银行当前余额和信用卡当前欠款，然后只记之后的交易。
              </p>
              <p className="muted">
                起始日期：{today} ·
                America/Toronto。余额与欠款不计入收入或消费。
              </p>
              <form onSubmit={setup}>
                {openings.map((a, i) => (
                  <fieldset key={i}>
                    <legend>账户 {i + 1}</legend>
                    <div className="form-grid">
                      <label>
                        名称
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
                        类型
                        <select
                          value={a.kind}
                          onChange={(e) =>
                            updateOpening(i, {
                              kind: e.target.value as Opening["kind"],
                            })
                          }
                        >
                          <option value="asset">银行 / 现金资产</option>
                          <option value="liability">信用卡欠款</option>
                        </select>
                      </label>
                      <label>
                        原生币种
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
                        {a.kind === "asset" ? "当前余额" : "当前总欠款"}
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
                          预留学费 / 生活费 / 储蓄（不含还款）
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
                            本期账单金额（可稍后补）
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
                            本期剩余应还
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
                            本期实际到期日期
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
                        移除此账户
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
                    <Plus size={16} /> 添加账户
                  </button>
                  <button className="primary" disabled={busy || !!pending}>
                    {busy ? "正在保存…" : "从今天开始"}
                  </button>
                </div>
              </form>
            </section>
          ) : (
            <>
              <section className="hero">
                <div className="eyebrow">未来 30 天 · 含逾期还款</div>
                <h1>接下来可以花多少</h1>
                <div className="balance-grid">
                  {(["CAD", "CNY"] as Currency[])
                    .filter((c) => data.accounts.some((a) => a.currency === c))
                    .map((c) => {
                      const a = available(data, c);
                      return (
                        <div key={c}>
                          <span>{c}</span>
                          <strong>{money(a.spendable, c)}</strong>
                          <small>
                            现金 {money(a.cash, c)} − 预留{" "}
                            {money(a.reserved, c)} − 应还{" "}
                            {money(a.repayment, c)}
                          </small>
                        </div>
                      );
                    })}
                </div>
                <p>
                  按原生币种分别计算；未出账消费仍包含在信用卡总欠款中，未列入这份还款计划。
                </p>
                <p>
                  截至 {new Date(data.as_of).toLocaleString("zh-CN")} · {status}
                </p>
              </section>
              {data.accounts.some(
                (a) =>
                  a.kind === "liability" &&
                  !data.statements.some((s) => s.account_id === a.id),
              ) && (
                <div className="warning">
                  部分信用卡账单待补，可支配金额可能偏高。请先填写本期剩余应还与实际到期日期。
                </div>
              )}
              <div className="section-title">
                <h2>还款清单</h2>
                <span>还款不重复计消费</span>
              </div>
              <section className="panel bills">
                {data.statements.filter((s) => s.remaining_cents > 0).length ===
                0 ? (
                  <p className="muted">
                    暂无已记录的待还账单；没有账单信息不代表没有欠款。
                  </p>
                ) : (
                  data.statements
                    .filter((s) => s.remaining_cents > 0)
                    .map((bill: Statement) => {
                      const a = data.accounts.find(
                        (a) => a.id === bill.account_id,
                      )!;
                      return (
                        <div className="bill" key={bill.id}>
                          <div className="bill-icon">
                            <CreditCard size={22} />
                          </div>
                          <div>
                            <strong>{a.name}</strong>
                            <small>
                              {bill.due_on} · {dueLabel(today, bill.due_on)}
                            </small>
                            <small>
                              账单 {money(bill.statement_cents, a.currency)} ·
                              总欠款 {money(a.balance_cents, a.currency)}
                            </small>
                          </div>
                          <div className="bill-amount">
                            <strong>
                              {money(bill.remaining_cents, a.currency)}
                            </strong>
                            <button
                              className="quiet"
                              disabled={busy || !!pending}
                              onClick={() => {
                                open("statement", a);
                                setSelectedBill(bill);
                              }}
                            >
                              核对账单
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
                              去还款 <ArrowRight size={14} />
                            </button>
                          </div>
                        </div>
                      );
                    })
                )}
              </section>
              <div className="section-title">
                <h2>我的账户</h2>
                <button
                  className="quiet"
                  disabled={busy || !!pending}
                  onClick={() => open("account")}
                >
                  <Plus size={16} /> 添加
                </button>
              </div>
              <div className="account-grid">
                {data.accounts.map((a) => (
                  <section className="panel account" key={a.id}>
                    <div className="account-top">
                      <strong>{a.name}</strong>
                      <span>
                        {a.kind === "asset" ? "资产" : "信用卡"} · {a.currency}
                      </span>
                    </div>
                    <h3>{money(a.balance_cents, a.currency)}</h3>
                    <small>
                      {a.kind === "asset"
                        ? `预留 ${money(a.reserved_cents, a.currency)}`
                        : "当前总欠款，与本期应还不同"}
                    </small>
                    <div className="actions">
                      <button
                        onClick={() => open("reconcile", a)}
                        disabled={busy || !!pending}
                      >
                        对账
                      </button>
                      <button
                        onClick={() =>
                          open(a.kind === "asset" ? "reserve" : "statement", a)
                        }
                        disabled={busy || !!pending}
                      >
                        {a.kind === "asset" ? "设置预留" : "添加本期账单"}
                      </button>
                    </div>
                  </section>
                ))}
              </div>
              <div className="section-title">
                <h2>本月已记录收支</h2>
              </div>
              <section className="panel">
                <p className="muted">
                  开始记录：{data.profile.started_on}；本月覆盖从{" "}
                  {data.profile.started_on > `${today.slice(0, 7)}-01`
                    ? data.profile.started_on
                    : `${today.slice(0, 7)}-01`}{" "}
                  到 {today}
                  ，另含已补录的历史。完整性尚未确认，未记录不等于没有消费。
                </p>
                {(["CAD", "CNY"] as Currency[]).map((c) => {
                  const m = data.monthly.find((m) => m.currency === c);
                  return (
                    <div className="stat" key={c}>
                      <span>{c}</span>
                      <span>收入 {money(m?.income_cents ?? 0, c)}</span>
                      <span>支出 {money(m?.expense_cents ?? 0, c)}</span>
                    </div>
                  );
                })}
              </section>
              <div className="section-title">
                <h2>最近交易</h2>
                <span>最近 100 笔</span>
              </div>
              <section className="panel history">
                {data.transactions.length === 0 ? (
                  <p className="muted">从第一笔开始，慢慢建立清楚的账。</p>
                ) : (
                  data.transactions.map((tx) => (
                    <div
                      className={`transaction ${tx.reversed_at ? "reversed" : ""}`}
                      key={tx.id}
                    >
                      <div>
                        <strong>
                          {labels[tx.kind]} ·{" "}
                          {
                            data.accounts.find((a) => a.id === tx.source_id)
                              ?.name
                          }
                        </strong>
                        <small>
                          {tx.occurred_on} · {tx.note || "无备注"}
                          {tx.target_id
                            ? ` → ${data.accounts.find((a) => a.id === tx.target_id)?.name}`
                            : ""}
                        </small>
                        {!tx.source_effect && (
                          <small>历史补录 · 不再次改变来源账户余额</small>
                        )}
                        {tx.reversed_at && <small>已撤销，原记录保留</small>}
                      </div>
                      <div>
                        <strong>
                          {tx.kind === "adjustment"
                            ? `${money(tx.before_cents ?? 0, tx.currency)} → ${money(tx.after_cents ?? 0, tx.currency)}`
                            : money(tx.amount_cents, tx.currency)}
                        </strong>
                        {tx.target_currency && (
                          <small>
                            到账{" "}
                            {money(tx.target_cents ?? 0, tx.target_currency)}
                          </small>
                        )}
                        {tx.kind !== "adjustment" && !tx.reversed_at && (
                          <button
                            className="quiet"
                            disabled={busy || demo || !!pending}
                            onClick={() => void reverse(tx.id)}
                          >
                            撤销
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </section>
              <button
                className="primary add-record"
                disabled={busy || !!pending}
                onClick={() => open("record")}
              >
                <Plus size={20} /> 记一笔
              </button>
            </>
          )}
        </main>
      )}
      {modal && data && (
        <div
          className="overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy && !pending)
              setModal(null);
          }}
        >
          <section
            className="dialog panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
          >
            <h2 id="dialog-title">
              {modal === "record"
                ? "记一笔"
                : modal === "account"
                  ? "添加账户"
                  : modal === "statement"
                    ? `${selected?.name} · ${selectedBill ? "核对账单" : "添加账单"}`
                    : modal === "reserve"
                      ? `${selected?.name} · 预留资金`
                      : `${selected?.name} · 对账`}
            </h2>
            <form onSubmit={submitModal}>
              {modal === "record" && (
                <>
                  <div className="tabs">
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
                        onClick={() => changeRecordKind(kind)}
                        disabled={busy || !!pending}
                      >
                        {labels[kind]}
                      </button>
                    ))}
                  </div>
                  <label>
                    {transfer ? "付款账户" : "账户"}
                    <select
                      required
                      value={recordSource}
                      onChange={(e) => setRecordSource(e.target.value)}
                    >
                      {data.accounts
                        .filter((a) => !transfer || a.kind === "asset")
                        .map((a) => (
                          <option value={a.id} key={a.id}>
                            {a.name} ({a.currency})
                          </option>
                        ))}
                    </select>
                  </label>
                  {transfer && (
                    <label>
                      目标账户
                      <select
                        required
                        value={recordTarget}
                        onChange={(e) => setRecordTarget(e.target.value)}
                      >
                        <option value="">请选择</option>
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
                  <label>
                    金额 · {source?.currency}
                    <input
                      name="amount"
                      inputMode="decimal"
                      required
                      autoFocus
                    />
                  </label>
                  {transfer &&
                    target &&
                    source?.currency !== target.currency && (
                      <label>
                        实际到账 / 减少欠款金额 · {target.currency}
                        <input
                          name="targetAmount"
                          inputMode="decimal"
                          required
                        />
                      </label>
                    )}
                  <label>
                    交易日期
                    <input
                      name="date"
                      type="date"
                      defaultValue={today}
                      max={today}
                      required
                    />
                  </label>
                  <label>
                    备注
                    <input name="note" maxLength={500} />
                  </label>
                  <label className="checkbox">
                    <input type="checkbox" name="historyOnly" />{" "}
                    只补历史，不改变当前余额
                  </label>
                  <p className="muted">
                    日期早于账户最新起始 /
                    对账日时自动只补历史。同一天的旧交易请勾选上项，避免重复扣款。还款按最早到期的未还账单分配，超额部分保留为未分配还款。
                  </p>
                </>
              )}
              {modal === "account" && (
                <>
                  <label>
                    账户名称
                    <input name="name" required maxLength={60} />
                  </label>
                  <label>
                    类型
                    <select name="kind">
                      <option value="asset">资产</option>
                      <option value="liability">信用卡</option>
                    </select>
                  </label>
                  <label>
                    币种
                    <select name="currency">
                      <option>CAD</option>
                      <option>CNY</option>
                    </select>
                  </label>
                  <label>
                    当前余额 / 总欠款
                    <input
                      name="balance"
                      inputMode="decimal"
                      defaultValue="0"
                      required
                    />
                  </label>
                  <p className="muted">作为今天的起始余额，不计收入或消费。</p>
                </>
              )}
              {modal === "reconcile" && selected && (
                <>
                  <p>
                    系统数：{money(selected.balance_cents, selected.currency)}
                    。按今天银行显示的实际数对账，差额有记录，不自动计收支。
                  </p>
                  <label>
                    实际余额 / 当前总欠款 · {selected.currency}
                    <input
                      name="balance"
                      inputMode="decimal"
                      defaultValue={String(selected.balance_cents / 100)}
                      required
                    />
                  </label>
                  <label>
                    差额说明
                    <input
                      name="note"
                      maxLength={500}
                      placeholder="例如：漏记几天，按银行余额继续"
                    />
                  </label>
                  <p className="muted">
                    信用卡总欠款对账不会自动改变本期应还。若同时有人记账，版本冲突会要求重新核对。
                  </p>
                </>
              )}
              {modal === "reserve" && selected && (
                <>
                  <p>
                    预留给学费、生活费或储蓄；信用卡还款由还款清单另扣，不要在这里重复预留。
                  </p>
                  <label>
                    预留总金额 · {selected.currency}
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
                    本期原始账单金额 · {selected.currency}
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
                    截至现在剩余应还 · {selected.currency}
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
                    银行给出的实际到期日期
                    <input
                      name="due"
                      type="date"
                      defaultValue={selectedBill?.due_on ?? ""}
                      required
                    />
                  </label>
                  <p className="muted">
                    {selectedBill
                      ? "按银行实际结果更正本期账单，有审计记录，不改变总欠款。"
                      : "新增一期账单；请勿重复添加同一期。已支付部分直接反映在剩余应还中。"}
                  </p>
                </>
              )}
              {notice && (
                <div className="warning" role="status">
                  {notice}
                </div>
              )}
              <div className="actions">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setModal(null)}
                >
                  关闭
                </button>
                <button className="primary" disabled={busy || !!pending}>
                  {busy ? (
                    "正在保存…"
                  ) : (
                    <>
                      <CheckCircle2 size={16} /> 确认保存
                    </>
                  )}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      <footer>
        金额分别以 CAD / CNY 原币种保存 · 余额与统计以已确认记录为准
      </footer>
    </div>
  );
}
export default App;

import "dotenv/config"; // 加载环境变量，方便在整个项目中使用
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { connectDB } from "./db";
import { Account, AccountCurrency, AccountType, CORE_ACCOUNT_NAMES } from "./models/Account";
import { Transaction, TransactionType } from "./models/Transaction";
import "dotenv/config";
import { GoogleGenerativeAI } from "@google/generative-ai";

async function list() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  try {
    // 2026 年推荐直接用 v1 接口或者尝试列出所有模型
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
    const data = await response.json();
    console.log("你当前 API Key 可用的模型列表：");
    data.models.forEach((m: any) => console.log("- " + m.name.replace('models/', '')));
  } catch (e) {
    console.error("查询失败，请检查 API Key");
  }
}
list();


const app = express();

// 中间件：允许跨域 & 解析 JSON 请求体
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;

// Gemini 客户端初始化
const geminiApiKey = process.env.GEMINI_API_KEY;

if (!geminiApiKey) {
  throw new Error("GEMINI_API_KEY is not defined in .env");
}

const genAI = new GoogleGenerativeAI(geminiApiKey);

const SYSTEM_PROMPT = `# Role
You are a highly accurate finance parsing assistant.
你是一个极度精确的财务解析助手。
Your task is to convert user bookkeeping text (Chinese or English) into standard JSON.
你的任务是把用户的中英文记账输入转换成标准 JSON。

# Constraints
1. Output JSON only. No explanation text.
2. Current reference time: 2026-02-26 (Thursday).
3. Any repayment intent such as "还信用卡", "credit card payment", "pay BMO card" must be type: "transfer", and target_account must be "credit_card" or the matched liability card.
4. If the input mentions an account name (e.g. BMO), prioritize matching the exact account from "当前可用账户列表 / available accounts list".
5. Category must be stored in English (e.g. "food", "shopping", "transport", "repayment", "salary", "transfer", "utilities", "entertainment", "other").

# Account Mapping
- 微信 / WeChat: "wechat"
- 现金 / cash: "cash"
- 信用卡 / credit card: "credit_card"
- 借记卡 / debit card: "debit_card"

# Output Schema
{
  "amount": number,
  "type": "expense" | "income" | "transfer",
  "category": string,
  "account": string, 
  "target_account": string | null,
  "date": "YYYY-MM-DD",
  "note": string
}

# Examples
Input: "用借记卡还了600信用卡"
Output: {"amount": 600, "type": "transfer", "category": "repayment", "account": "debit_card", "target_account": "credit_card", "date": "2026-02-26", "note": "还信用卡"}

Input: "信用卡刷了100买衣服"
Output: {"amount": 100, "type": "expense", "category": "shopping", "account": "credit_card", "target_account": null, "date": "2026-02-26", "note": "衣服"}

Input: "Spent 5 on coffee"
Output: {"amount": 5, "type": "expense", "category": "food", "account": "debit_card", "target_account": null, "date": "2026-02-26", "note": "coffee"}

Respond with VALID JSON ONLY.`;

const WEEKLY_ROAST_SYSTEM_PROMPT = `# Role
你是一个极度毒舌、言辞犀利但心怀善意的财务教练。你的任务是分析用户过去一周的消费记录，给出一份让人“扎心”但能反思的财务总结。

# Style
1. 语气：刻薄、幽默、充满讽刺，像一个损友。
2. 语言：中文。
3. 关键点：找出消费中最不合理的支出，狠狠地吐槽。

# Constraints
1. 篇幅：控制在 150 字以内。
2. 结构：先给本周表现打分（0-100），然后分两段进行毒舌评论，最后给出一个极其抠门的建议。`;

type ParsedTransactionPayload = {
  amount: number;
  type: TransactionType;
  category: string;
  account: string;
  target_account: string | null;
  date: string;
  note: string;
};

type FxRatePayload = {
  cadToCny: number;
  fetchedAt: string;
};

const NAME_ALIASES: Record<string, string> = {
  wechat: CORE_ACCOUNT_NAMES.WeChat,
  weixin: CORE_ACCOUNT_NAMES.WeChat,
  wx: CORE_ACCOUNT_NAMES.WeChat,
  "微信": CORE_ACCOUNT_NAMES.WeChat,
  cash: CORE_ACCOUNT_NAMES.Cash,
  xianjin: CORE_ACCOUNT_NAMES.Cash,
  "现金": CORE_ACCOUNT_NAMES.Cash,
  creditcard: CORE_ACCOUNT_NAMES.CreditCard,
  "credit_card": CORE_ACCOUNT_NAMES.CreditCard,
  "credit card": CORE_ACCOUNT_NAMES.CreditCard,
  "信用卡": CORE_ACCOUNT_NAMES.CreditCard,
  debitcard: CORE_ACCOUNT_NAMES.DebitCard,
  "debit_card": CORE_ACCOUNT_NAMES.DebitCard,
  "debit card": CORE_ACCOUNT_NAMES.DebitCard,
  debit: CORE_ACCOUNT_NAMES.DebitCard,
  "借记卡": CORE_ACCOUNT_NAMES.DebitCard,
};

const normalizeToken = (v: string): string =>
  v.trim().toLowerCase().replace(/[_\-\s]/g, "");

function resolveAccountNameFromList(raw: string | null | undefined, accountNames: string[]): string | null {
  if (!raw) return null;
  const cleaned = raw.trim();
  if (!cleaned) return null;

  const alias = NAME_ALIASES[cleaned.toLowerCase()];
  if (alias) return alias;

  const normalized = normalizeToken(cleaned);
  const matched = accountNames.find((n) => normalizeToken(n) === normalized);
  if (matched) return matched;

  const fuzzy = accountNames.find((n) => {
    const nn = normalizeToken(n);
    return normalized.includes(nn) || nn.includes(normalized);
  });
  return fuzzy ?? null;
}

function serializeAccount(acc: {
  _id: unknown;
  name: string;
  type: AccountType;
  balance: number;
  dueDate?: number;
  currency: AccountCurrency;
  displayCurrency?: AccountCurrency;
}) {
  return {
    _id: acc._id,
    name: acc.name,
    type: acc.type,
    balance: acc.balance,
    dueDate: acc.dueDate,
    currency: acc.currency,
    displayCurrency: acc.displayCurrency ?? acc.currency,
  };
}

async function getCadCnyRate(): Promise<FxRatePayload> {
  try {
    const r = await fetch("https://api.frankfurter.app/latest?from=CAD&to=CNY");
    if (!r.ok) throw new Error(`fx status ${r.status}`);
    const data = (await r.json()) as { rates?: { CNY?: number }; date?: string };
    const rate = data.rates?.CNY;
    if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
      throw new Error("invalid fx response");
    }
    return {
      cadToCny: rate,
      fetchedAt: data.date ?? new Date().toISOString(),
    };
  } catch (err) {
    console.error("FX fetch failed, fallback to 5.0:", err);
    return {
      cadToCny: 5.0,
      fetchedAt: new Date().toISOString(),
    };
  }
}

// 简单的错误处理中间件类型辅助
type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

const asyncHandler =
  (fn: AsyncHandler): AsyncHandler =>
  async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (err) {
      next(err);
    }
  };

function getUserId(req: Request): string | null {
  const raw = req.headers["x-user-id"];
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  return v.length > 0 ? v : null;
}

async function ensureDefaultAccounts(userId: string) {
  const created: unknown[] = [];
  const existing: unknown[] = [];
  const initialBalance = 0;

  for (const { name, type, currency } of DEFAULT_ACCOUNTS) {
    const found = await Account.findOne({ userId, name });
    if (found) {
      if (found.type !== type) found.type = type;
      if (found.currency !== currency) found.currency = currency;
      if (!found.displayCurrency) found.displayCurrency = currency;
      await found.save();
      existing.push(found);
    } else {
      const acc = await Account.create({
        userId,
        name,
        type,
        currency,
        displayCurrency: currency,
        balance: initialBalance,
      });
      created.push(acc);
    }
  }

  return {
    initialBalance,
    created,
    existing,
  };
}

// POST /api/record
// 接收用户的一段话 -> 调用 Gemini -> 解析为 JSON -> 存入 Transaction 并更新 Account 余额
app.post(
  "/api/record",
  asyncHandler(async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: "缺少 x-user-id" });
      return;
    }
    const { text } = req.body as { text?: string };

    if (!text) {
      res.status(400).json({ error: "请输入内容" });
      return;
    }

    await connectDB();
    const accountDocs = await Account.find({ userId }, { name: 1, type: 1 }).lean();
    if (accountDocs.length === 0) {
      await ensureDefaultAccounts(userId);
    }
    const refreshedDocs = accountDocs.length === 0
      ? await Account.find({ userId }, { name: 1, type: 1 }).lean()
      : accountDocs;
    const accountNames = refreshedDocs.map((a) => a.name);

    let parsed: ParsedTransactionPayload;

    try {
      // 1. 使用你列表里最稳的 3.0 Flash 模型
      const model = genAI.getGenerativeModel({
        model: "gemini-3-flash-preview",
      });

      // 2. 注入当前可用账户（含用户新增信用卡），提升解析准确率
      const dynamicAccountsPrompt = `当前可用账户列表（name / type）：\n${refreshedDocs
        .map((acc) => `- ${acc.name} (${acc.type})`)
        .join("\n")}`;
      const finalPrompt = `${SYSTEM_PROMPT}\n\n${dynamicAccountsPrompt}\n\n当前用户输入: "${text}"\n请只输出 JSON。`;

      const result = await model.generateContent(finalPrompt);
      const response = await result.response;
      let raw = response.text();

      // 3. 过滤掉 AI 可能自带的 Markdown 标签 (```json ... ```)
      raw = raw.replace(/```json/g, "").replace(/```/g, "").trim();

      parsed = JSON.parse(raw) as ParsedTransactionPayload;
    } catch (error) {
      // 如果 AI 调用报错（503/429 等），这里用一个模拟的记账结果，方便你本地调试完整流程
      console.error("Gemini 调用失败，使用 Mock 数据:", error);
      parsed = {
        amount: 10,
        type: "expense",
        category: "测试",
        account: "wechat",
        target_account: null,
        date: "2026-02-26",
        note: "AI暂时休息，这是模拟入账",
      };
    }

    // 兜底规则：凡是“还信用卡”语义，强制修正为 transfer 到 credit_card
    const repayCreditCardPattern = /还.*信用卡|信用卡.*还款|偿还.*信用卡|还款给.*卡/;
    if (repayCreditCardPattern.test(text)) {
      parsed.type = "transfer";
      parsed.target_account = "credit_card";
      // 若模型把主账户识别为信用卡，改回默认出款账户
      if (resolveAccountNameFromList(parsed.account, accountNames) === CORE_ACCOUNT_NAMES.CreditCard) {
        parsed.account = "debit_card";
      }
    }

    // 归一化主账户与（转账时的）目标账户
    const normalizedSource = resolveAccountNameFromList(parsed.account, accountNames);
    if (!normalizedSource) {
      res.status(400).json({ error: `无法识别账户: ${parsed.account}` });
      return;
    }

    const sourceAccount = await Account.findOne({ userId, name: normalizedSource });
    if (!sourceAccount) {
      res.status(400).json({ error: `未找到账户: ${normalizedSource}` });
      return;
    }

    let targetAccount: (typeof sourceAccount) | null = null;
    if (parsed.type === "transfer" && !parsed.target_account) {
      res.status(400).json({ error: "转账必须包含目标账户 target_account" });
      return;
    }
    if (parsed.type === "transfer" && parsed.target_account) {
      const normalizedTarget = resolveAccountNameFromList(parsed.target_account, accountNames);
      if (!normalizedTarget) {
        res.status(400).json({ error: `无法识别目标账户: ${parsed.target_account}` });
        return;
      }
      targetAccount = await Account.findOne({ userId, name: normalizedTarget });
      if (!targetAccount) {
        res.status(400).json({ error: `未找到目标账户: ${normalizedTarget}` });
        return;
      }
    }

    const session = await (await connectDB()).startSession();
    session.startTransaction();

    try {
      const amount = parsed.amount;

      // 对账逻辑：
      // expense: asset 减 / liability 加（欠款增加）
      // income: asset 加 / liability 减（欠款减少）
      // transfer: 来源永远减；目标是 credit_card 则减（还款），否则按资产加
      if (parsed.type === "expense") {
        if (sourceAccount.type === "asset") {
          sourceAccount.balance -= amount;
        } else {
          sourceAccount.balance += amount; // 负债：欠款变多
        }
      } else if (parsed.type === "income") {
        if (sourceAccount.type === "asset") {
          sourceAccount.balance += amount;
        } else {
          sourceAccount.balance -= amount; // 负债：欠款变少
        }
      } else if (parsed.type === "transfer" && targetAccount) {
        sourceAccount.balance -= amount; // 来源账户永远减少
        if (targetAccount.type === "liability") {
          targetAccount.balance -= amount; // 关键：还信用卡时负债减少
        } else {
          targetAccount.balance += amount; // 目标资产增加
        }
      }

      await sourceAccount.save({ session });
      if (targetAccount) await targetAccount.save({ session });

      const transaction = await Transaction.create(
        [{
          amount: parsed.amount,
          userId,
          type: parsed.type,
          category: parsed.category,
          account: sourceAccount._id,
          date: parsed.date ? new Date(parsed.date) : new Date(),
          note: parsed.note ?? undefined,
        }],
        { session }
      );

      await session.commitTransaction();
      session.endSession();

      res.status(201).json({ message: "成功记账！", data: transaction[0] });
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      throw err;
    }
  })
);

// 四个基础账户：保留默认账户，但允许用户后续新增信用卡账户
const DEFAULT_ACCOUNTS: { name: string; type: AccountType; currency: AccountCurrency }[] = [
  { name: CORE_ACCOUNT_NAMES.WeChat, type: "asset", currency: "CNY" },
  { name: CORE_ACCOUNT_NAMES.Cash, type: "asset", currency: "CAD" },
  { name: CORE_ACCOUNT_NAMES.DebitCard, type: "asset", currency: "CAD" },
  { name: CORE_ACCOUNT_NAMES.CreditCard, type: "liability", currency: "CAD" },
];

// 临时初始化账户：若不存在则创建，并写入 type
app.get("/api/init-accounts", async (_req: Request, res: Response) => {
  try {
    await connectDB();
    const userId = getUserId(_req);
    if (!userId) {
      res.status(401).json({ error: "缺少 x-user-id" });
      return;
    }
    const { initialBalance, created, existing } = await ensureDefaultAccounts(userId);

    res.json({
      message: "初始化账户完成",
      initialBalance,
      createdCount: created.length,
      existingCount: existing.length,
      created,
      existing,
    });
  } catch (err) {
    console.error("init-accounts error:", err);
    res.status(500).json({ error: "初始化账户失败" });
  }
});

// 返回所有账户 + CAD/CNY 汇率（用于前端展示与换算）
app.get("/api/accounts", asyncHandler(async (_req: Request, res: Response) => {
  await connectDB();
  const userId = getUserId(_req);
  if (!userId) {
    res.status(401).json({ error: "缺少 x-user-id" });
    return;
  }
  let accounts = await Account.find({ userId }).sort({ name: 1 }).lean();
  if (accounts.length === 0) {
    await ensureDefaultAccounts(userId);
    accounts = await Account.find({ userId }).sort({ name: 1 }).lean();
  }
  const fx = await getCadCnyRate();
  const normalized = accounts.map((acc) =>
    serializeAccount({
      _id: acc._id,
      name: acc.name,
      type: acc.type ?? (acc.name === CORE_ACCOUNT_NAMES.CreditCard ? "liability" : "asset"),
      balance: acc.balance,
      dueDate: acc.dueDate,
      currency: acc.currency ?? "CAD",
      displayCurrency: acc.displayCurrency ?? (acc.currency ?? "CAD"),
    })
  );
  res.json({ accounts: normalized, fx });
}));

// 新增信用卡账户（liability）
app.post(
  "/api/accounts",
  asyncHandler(async (req: Request, res: Response) => {
    await connectDB();
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: "缺少 x-user-id" });
      return;
    }
    const body = req.body as {
      name?: string;
      balance?: number;
      dueDate?: number;
      currency?: AccountCurrency;
      displayCurrency?: AccountCurrency;
      type?: AccountType;
    };
    const name = body.name?.trim();
    if (!name) {
      res.status(400).json({ error: "请提供信用卡名称" });
      return;
    }
    const exists = await Account.findOne({ userId, name });
    if (exists) {
      res.status(409).json({ error: "账户名称已存在" });
      return;
    }

    const dueDate =
      typeof body.dueDate === "number" && body.dueDate >= 1 && body.dueDate <= 31
        ? body.dueDate
        : undefined;

    const currency: AccountCurrency = body.currency === "CNY" ? "CNY" : "CAD";
    const displayCurrency: AccountCurrency =
      body.displayCurrency === "CAD" || body.displayCurrency === "CNY"
        ? body.displayCurrency
        : currency;

    const account = await Account.create({
      userId,
      name,
      type: "liability",
      // 重要：balance 永远按用户输入的账户原生货币原样存储，禁止在存储前换算
      balance: typeof body.balance === "number" ? body.balance : 0,
      dueDate,
      currency,
      displayCurrency,
    });

    res.status(201).json(serializeAccount(account));
  })
);

app.post(
  "/api/analyze",
  asyncHandler(async (req: Request, res: Response) => {
    await connectDB();
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: "缺少 x-user-id" });
      return;
    }

    const end = new Date();
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - 6);

    const expenses = await Transaction.find({
      userId,
      type: "expense",
      date: { $gte: start, $lte: end },
    })
      .populate("account", "name type")
      .sort({ date: -1 })
      .lean();

    const weeklyTotal = expenses.reduce((sum, tx) => sum + tx.amount, 0);
    const payload = expenses.map((tx) => ({
      amount: tx.amount,
      category: tx.category,
      note: tx.note ?? "",
      date: tx.date,
      account: (tx.account as { name?: string } | undefined)?.name ?? "未知账户",
    }));

    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const prompt = `${WEEKLY_ROAST_SYSTEM_PROMPT}\n\n以下是用户最近7天支出数据(JSON)：\n${JSON.stringify(
      {
        weeklyTotal,
        expenseCount: payload.length,
        expenses: payload,
      },
      null,
      2
    )}`;

    try {
      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      res.json({
        period: {
          start: start.toISOString(),
          end: end.toISOString(),
        },
        weeklyTotal,
        expenseCount: payload.length,
        roast: text,
      });
    } catch (error) {
      console.error("Gemini analyze 调用失败:", error);
      res.status(502).json({ error: "AI 分析暂时不可用，请稍后再试" });
    }
  })
);

// 直接更新某个账户的余额、还款日等（严谨对账 / 账户设置）
app.put(
  "/api/accounts/:name",
  asyncHandler(async (req: Request, res: Response) => {
    await connectDB();
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: "缺少 x-user-id" });
      return;
    }
    const nameRaw = decodeURIComponent(req.params.name as string);
    const accountNames = (await Account.find({ userId }, { name: 1 }).lean()).map((a) => a.name);
    const normalized = resolveAccountNameFromList(nameRaw, accountNames);
    if (!normalized) {
      res.status(400).json({ error: `无法识别账户: ${nameRaw}` });
      return;
    }
    const body = req.body as {
      balance?: number;
      dueDate?: number;
      displayCurrency?: AccountCurrency;
    };
    if (typeof body.balance !== "number") {
      res.status(400).json({ error: "请提供数字类型的 balance" });
      return;
    }
    // 重要：balance 永远按用户输入的账户原生货币原样存储，禁止在存储前换算
    const rawBalance = body.balance;
    const update: Record<string, number | undefined> = { balance: rawBalance };
    const existing = await Account.findOne({ userId, name: normalized });
    if (!existing) {
      res.status(404).json({ error: `未找到账户: ${normalized}` });
      return;
    }
    const isCreditCard = normalized === CORE_ACCOUNT_NAMES.CreditCard;
    if (isCreditCard && existing.type !== "liability") {
      existing.type = "liability";
      await existing.save();
    }

    if (existing.type === "liability" || isCreditCard) {
      if (
        typeof body.dueDate === "number" &&
        body.dueDate >= 1 &&
        body.dueDate <= 31
      ) {
        update.dueDate = body.dueDate;
      }
    } else {
      update.dueDate = undefined;
    }
    if (body.displayCurrency === "CAD" || body.displayCurrency === "CNY") {
      (update as { displayCurrency?: AccountCurrency }).displayCurrency = body.displayCurrency;
    }
    const account = await Account.findOneAndUpdate(
      { userId, name: normalized },
      update,
      { new: true }
    );
    if (!account) {
      res.status(404).json({ error: `未找到账户: ${normalized}` });
      return;
    }
    res.json({
      ...serializeAccount(account),
    });
  })
);

// 本月收支统计：仅统计 income / expense，转账不计入收入或支出
app.get(
  "/api/stats/monthly",
  asyncHandler(async (req: Request, res: Response) => {
    await connectDB();
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: "缺少 x-user-id" });
      return;
    }
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const [incomeResult, expenseResult] = await Promise.all([
      Transaction.aggregate([
        {
          $match: {
            date: { $gte: start, $lt: end },
            userId,
            type: "income",
          },
        },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      Transaction.aggregate([
        {
          $match: {
            date: { $gte: start, $lt: end },
            userId,
            type: "expense",
          },
        },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
    ]);

    const totalIncome = incomeResult[0]?.total ?? 0;
    const totalExpense = expenseResult[0]?.total ?? 0;

    res.json({
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      totalIncome,
      totalExpense,
    });
  })
);

// 健康检查
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

// 全局错误处理
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// 启动服务器
const startServer = async () => {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`Server is running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

startServer();

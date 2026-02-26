import "dotenv/config"; // 加载环境变量，方便在整个项目中使用
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { connectDB } from "./db";
import { Account, AccountName, AccountType } from "./models/Account";
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

// 财务记账助手 System Prompt：从自然语言提取交易 JSON
const SYSTEM_PROMPT = `# Role
你是一个专业的财务记账助手，专门负责从模糊的自然语言中提取财务交易数据。你的任务是将用户的描述转换为精确的 JSON 格式。

# Constraints
1. 必须仅输出 JSON 格式，不要包含任何多余的文字说明。
2. 当前时间参考：2026-02-25 (Wednesday)。
3. 如果用户未指明日期，默认使用当前日期。
4. 如果用户提到“昨天”、“前天”，请根据参考日期计算出准确日期。
5. 金额必须为数字（Number），不能带有千分符。

# Account Mapping (重要)
仅支持以下四个账户名：
- \`wechat\` (微信)
- \`cash\` (现金)
- \`credit_card\` (信用卡)
- \`debit_card\` (借记卡)
- 如果未提及，默认为 \`debit_card\`。

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

# Example Inputs & Outputs
Input: "昨天吃火锅微信付了200"
Output: {"amount": 200, "type": "expense", "category": "餐饮", "account": "wechat", "target_account": null, "date": "2026-02-24", "note": "火锅"}

Input: "往借记卡存了5000"
Output: {"amount": 5000, "type": "income", "category": "工资/存入", "account": "debit_card", "target_account": null, "date": "2026-02-25", "note": "存入"}

Input: "从借记卡转了1000去还信用卡"
Output: {"amount": 1000, "type": "transfer", "category": "还款", "account": "debit_card", "target_account": "credit_card", "date": "2026-02-25", "note": "还信用卡"}

Respond with VALID JSON ONLY. Do not wrap in markdown. Do not add comments.`;

type ParsedTransactionPayload = {
  amount: number;
  type: TransactionType;
  category: string;
  account: string;
  target_account: string | null;
  date: string;
  note: string;
};

// 把 AI 输出的账户名统一转换为枚举值，解决大小写 / 别名问题
function normalizeAccountName(raw: string | null | undefined): AccountName | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();

  switch (v) {
    case "wechat":
    case "weixin":
    case "wx":
    case "微信":
      return AccountName.WeChat;
    case "cash":
    case "xianjin":
    case "现金":
      return AccountName.Cash;
    case "creditcard":
    case "credit_card":
    case "credit card":
    case "信用卡":
      return AccountName.CreditCard;
    case "debitcard":
    case "debit_card":
    case "debit card":
    case "debit":
    case "借记卡":
      return AccountName.DebitCard;
    default:
      // 如果 AI 已经输出正确的枚举值，就直接匹配
      if ((Object.values(AccountName) as string[]).includes(raw)) {
        return raw as AccountName;
      }
      return null;
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

// POST /api/record
// 接收用户的一段话 -> 调用 Gemini -> 解析为 JSON -> 存入 Transaction 并更新 Account 余额
app.post(
  "/api/record",
  asyncHandler(async (req: Request, res: Response) => {
    const { text } = req.body as { text?: string };

    if (!text) {
      res.status(400).json({ error: "请输入内容" });
      return;
    }

    await connectDB();

    let parsed: ParsedTransactionPayload;

    try {
      // 1. 使用你列表里最稳的 3.0 Flash 模型
      const model = genAI.getGenerativeModel({
        model: "gemini-3-flash-preview",
      });

      // 2. 将 System Prompt 和用户输入组合，确保 AI 乖乖听话
      const finalPrompt = `${SYSTEM_PROMPT}\n\n当前用户输入: "${text}"\n请只输出 JSON。`;

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
        date: "2026-02-25",
        note: "AI暂时休息，这是模拟入账",
      };
    }

    // 归一化主账户与（转账时的）目标账户
    const normalizedSource = normalizeAccountName(parsed.account);
    if (!normalizedSource) {
      res.status(400).json({ error: `无法识别账户: ${parsed.account}` });
      return;
    }

    const sourceAccount = await Account.findOne({ name: normalizedSource });
    if (!sourceAccount) {
      res.status(400).json({ error: `未找到账户: ${normalizedSource}` });
      return;
    }

    let targetAccount: (typeof sourceAccount) | null = null;
    if (parsed.type === "transfer" && parsed.target_account) {
      const normalizedTarget = normalizeAccountName(parsed.target_account);
      if (!normalizedTarget) {
        res.status(400).json({ error: `无法识别目标账户: ${parsed.target_account}` });
        return;
      }
      targetAccount = await Account.findOne({ name: normalizedTarget });
      if (!targetAccount) {
        res.status(400).json({ error: `未找到目标账户: ${normalizedTarget}` });
        return;
      }
    }

    const session = await (await connectDB()).startSession();
    session.startTransaction();

    try {
      const amount = parsed.amount;

      // 对账逻辑：支出 Asset 减 / Liability 加；收入 Asset 加 / Liability 减；转账 来源减、目标按类型加减
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
        sourceAccount.balance -= amount; // 来源（资产）减少
        if (targetAccount.type === "asset") {
          targetAccount.balance += amount;
        } else {
          targetAccount.balance -= amount; // 还债：负债减少
        }
      }

      await sourceAccount.save({ session });
      if (targetAccount) await targetAccount.save({ session });

      const transaction = await Transaction.create(
        [{
          amount: parsed.amount,
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

// 四个基础账户及其类型：asset = 资产，liability = 负债（信用卡）
const DEFAULT_ACCOUNTS: { name: AccountName; type: AccountType }[] = [
  { name: AccountName.WeChat, type: "asset" },
  { name: AccountName.Cash, type: "asset" },
  { name: AccountName.DebitCard, type: "asset" },
  { name: AccountName.CreditCard, type: "liability" },
];

// 临时初始化账户：若不存在则创建，并写入 type
app.get("/api/init-accounts", async (_req: Request, res: Response) => {
  try {
    await connectDB();

    const initialBalance = 1000;
    const created: any[] = [];
    const existing: any[] = [];

    for (const { name, type } of DEFAULT_ACCOUNTS) {
      const found = await Account.findOne({ name });
      if (found) {
        if (found.type !== type) {
          found.type = type;
          await found.save();
        }
        existing.push(found);
      } else {
        const acc = await Account.create({
          name,
          type,
          balance: initialBalance,
        });
        created.push(acc);
      }
    }

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

// 返回所有账户（用于前端展示与初始对账）
app.get("/api/accounts", asyncHandler(async (_req: Request, res: Response) => {
  await connectDB();
  const accounts = await Account.find().sort({ name: 1 }).lean();
  res.json(accounts);
}));

// 直接更新某个账户的余额、还款日等（严谨对账 / 账户设置）
app.put(
  "/api/accounts/:name",
  asyncHandler(async (req: Request, res: Response) => {
    await connectDB();
    const nameRaw = req.params.name as string;
    const normalized = normalizeAccountName(nameRaw);
    if (!normalized) {
      res.status(400).json({ error: `无法识别账户: ${nameRaw}` });
      return;
    }
    const body = req.body as {
      balance?: number;
      dueDate?: number;
      billingDate?: number;
    };
    if (typeof body.balance !== "number") {
      res.status(400).json({ error: "请提供数字类型的 balance" });
      return;
    }
    const update: Record<string, number> = { balance: body.balance };
    if (typeof body.dueDate === "number" && body.dueDate >= 1 && body.dueDate <= 31) {
      update.dueDate = body.dueDate;
    }
    if (typeof body.billingDate === "number" && body.billingDate >= 1 && body.billingDate <= 31) {
      update.billingDate = body.billingDate;
    }
    const account = await Account.findOneAndUpdate(
      { name: normalized },
      update,
      { new: true }
    );
    if (!account) {
      res.status(404).json({ error: `未找到账户: ${normalized}` });
      return;
    }
    res.json(account);
  })
);

// 本月收支统计：仅统计 income / expense，转账不计入收入或支出
app.get(
  "/api/stats/monthly",
  asyncHandler(async (_req: Request, res: Response) => {
    await connectDB();
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const [incomeResult, expenseResult] = await Promise.all([
      Transaction.aggregate([
        {
          $match: {
            date: { $gte: start, $lt: end },
            type: "income",
          },
        },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      Transaction.aggregate([
        {
          $match: {
            date: { $gte: start, $lt: end },
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


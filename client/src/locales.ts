export type Language = "zh" | "en";
export const LANGUAGE_STORAGE_KEY = "savewise_lang";

// Source-language keys keep UI copy readable. User content is never translated.
export const english: Readonly<Record<string, string>> = {
  切换到英文: "Switch to English",
  切换到中文: "切换到中文 / Switch to Chinese",
  "本月留了 {0} · 月底待确认":
    "{0} set aside this month · Confirm at month-end",
  "本月还没留钱 · 点这里安排": "Nothing set aside this month · Tap to plan",
  "还差 {0} · 本月留存已从可花金额扣除":
    "{0} to go · This month’s allocation is already reserved",
  "本地设计预览 · 刷新重置": "Local design preview · Resets on refresh",
  之前已经攒下多少: "Previously saved",
  本月还留着多少钱: "Amount still set aside this month",
  "之前攒下的和本月留的钱都会从可花金额中留出。若动用了本月留存，把这里改成还剩的金额。月底确认只更新累计，不会再扣钱。":
    "Previous savings and this month’s allocation are reserved from spending money. If you use some of this month’s allocation, enter what remains. Month-end confirmation updates the total without deducting it again.",
  "试试月底确认（本地演示）": "Try month-end confirmation (local preview)",
  "目标已确认本月留存。累计增加，可花金额不会再扣一次。仅本地演示，刷新重置。":
    "Month confirmed in this preview. Savings increased; spending money is not deducted again. Refreshing resets the demo.",
  "账户 {0}": "Account {0}",
  "按到期日先后排列 · {0} 笔待还": "By due date · {0} unpaid",
  总览: "Overview",
  待还: "Due",
  账户: "Accounts",
  明细: "Activity",
  支出: "Expense",
  收入: "Income",
  退款: "Refund",
  转账: "Transfer",
  还款: "Repayment",
  对账调整: "Balance adjustment",
  "本地演示 · 虚构数据": "Local preview · Fictional data",
  等待登录: "Not signed in",
  日常银行: "Daily bank",
  "正在同步…": "Syncing…",
  "同步失败 · 显示上次数据": "Sync failed · Showing previous data",
  "同步失败：网络中断，请重试": "Sync failed: connection lost. Please retry.",
  "数据库还未应用迁移，请按 docs/SUPABASE_SETUP.md 完成配置。":
    "The database is not ready. Please contact the app maintainer.",
  "同步失败：{0}": "Sync failed: {0}",
  已同步: "Up to date",
  "无法恢复登录，请重新登录":
    "Could not restore your session. Please sign in again.",
  "注册密码至少 8 位": "Use at least 8 characters for your password.",
  两次密码不一致: "The passwords do not match.",
  "注册暂未开放，请稍后再试或联系应用维护者。":
    "Registration is not available yet. Please try later or contact the maintainer.",
  "注册确认邮件服务尚未开放给外部邮箱，请联系应用维护者配置发信服务。":
    "Email delivery is not ready for public registration. Please contact the maintainer.",
  "确认邮件发送频率受限，请稍后再试。":
    "Too many email requests. Please wait before trying again.",
  "注册未完成：{0}": "Registration incomplete: {0}",
  "请查收注册确认邮件，点击验证链接后登录；若未收到，可使用下方的重新发送确认邮件。":
    "Check your email and verify your address before signing in. You can resend the confirmation below.",
  "登录失败：{0}": "Sign-in failed: {0}",
  "登录服务请求失败，请重试；密码不会被保存。":
    "The sign-in request failed. Please retry; your password is not saved by this form.",
  请先填写邮箱: "Enter your email first.",
  "邮件暂未发送：{0}": "Email not sent: {0}",
  "确认邮件请求已提交，请检查邮箱和垃圾邮件。":
    "Confirmation email requested. Check your inbox and spam folder.",
  "邮件服务请求失败，请稍后重试。":
    "The email request failed. Please try again later.",
  "登录链接已发送，请检查邮箱。":
    "Sign-in link requested. Please check your email.",
  "退出会话失败，请关闭当前页面并重试：{0}":
    "Sign-out failed. Close this page and retry: {0}",
  "虚构数据 · 不连接数据库": "Fictional data · No database connection",
  "演示只展示虚构数据，登录后才能记账。":
    "This demo uses fictional data. Sign in to use your own ledger.",
  "结果暂未确认。输入已保留，请用“查询并重试”恢复，避免重复记账。":
    "The result is unconfirmed. Your request is retained in this tab. Use “Check and retry” to avoid duplicate entries.",
  "未保存：{0}": "Not saved: {0}",
  "已保存。正在刷新余额…": "Saved. Refreshing balances…",
  已保存并同步: "Saved and up to date",
  "已保存，但余额刷新失败。正在显示上次数据，请刷新。":
    "Saved, but balance refresh failed. Previous data is shown; please refresh.",
  "网络中断，结果未知。请查询并重试原请求。":
    "Connection lost; the result is unknown. Check and retry the original request.",
  "请先恢复上一次结果未知的请求。":
    "Resolve the previous unconfirmed request first.",
  "目标已在本页更新。这笔钱已计入预留，不会再扣一次。刷新后恢复演示数据。":
    "Goal updated in this preview. The allocation is included in reserves once. Refreshing resets the demo.",
  信用卡退款请使用退款类型: "Use Refund for money returned to a credit card.",
  金额必须大于零: "Enter an amount greater than zero.",
  "撤销这笔交易？记录会保留；已对账前的交易不会再次改变当前余额。":
    "Reverse this entry? The original stays in your history. Entries before the latest balance check will not change the current balance again.",
  "把钱管清楚，生活轻一点": "Know your money. Feel a little lighter.",
  退出演示: "Exit demo",
  退出: "Sign out",
  "自己的账，自己看": "Your money, your private ledger",
  创建自己的账本: "Start your own ledger",
  欢迎回来: "Welcome back",
  "用真实登录保护余额。演示数据与个人账户完全隔离。":
    "Sign in to protect your balances. Demo data is separate from personal accounts.",
  "Supabase 客户端配置{0}。请检查 client/.env.local 中的 URL 和公开 Publishable / anon key，并重启开发服务。":
    "Supabase client configuration is {0}. Check the URL and public publishable / anon key in client/.env.local, then restart the dev server.",
  缺失: "missing",
  无效: "invalid",
  "登录服务尚未配置，请联系应用维护者；无需在自己的设备创建 .env 文件。":
    "Sign-in is not configured. Contact the maintainer; you do not need an .env file on your device.",
  登录或注册: "Sign in or register",
  登录: "Sign in",
  注册: "Register",
  邮箱: "Email",
  密码: "Password",
  再次输入密码: "Confirm password",
  "处理中…": "Working…",
  注册并验证邮箱: "Register and verify email",
  重新发送确认邮件: "Resend confirmation",
  邮箱链接登录: "Email me a sign-in link",
  查看虚构演示: "Explore the demo",
  "每个人使用独立账号和账本；注册完成并确认邮箱后，从自己的当前余额开始。":
    "Each person has a separate account and ledger. Verify your email, then start with your current balances.",
  更新于: "Updated",
  刷新: "Refresh",
  "有一笔请求的结果尚未确认。请先恢复，再新增记账。":
    "An earlier request is unconfirmed. Resolve it before adding another entry.",
  查询并重试: "Check and retry",
  "正在加载你的账户…": "Loading your accounts…",
  暂时无法读取账户: "Accounts are unavailable",
  "未同步的数据不会显示为零，也不会被视为成功记账。":
    "Unsynced data is not shown as zero. Unconfirmed entries are not treated as saved.",
  第一次设置: "First-time setup",
  从今天开始就好: "Start from today",
  "无需补齐以前的账。填银行当前余额和信用卡当前欠款，然后只记之后的交易。":
    "No need to reconstruct old transactions. Enter current bank balances and card debt, then record what happens next.",
  "起始日期：": "Start date: ",
  "· America/Toronto。余额与欠款不计入收入或消费。":
    "· America/Toronto. Opening balances and debt are not income or spending.",
  名称: "Name",
  类型: "Type",
  "银行卡 / 储蓄 / 现金": "Bank / savings / cash",
  信用卡欠款: "Credit card debt",
  币种: "Currency",
  当前余额: "Current balance",
  当前总欠款: "Total card debt",
  "先留给学费、生活费或储蓄的钱（还款另算）":
    "Set aside for tuition, living costs or savings (excluding card repayments)",
  "本期账单金额（可稍后补）": "Statement amount (you can add this later)",
  本期剩余应还: "Remaining statement balance",
  本期实际到期日期: "Actual due date for this statement",
  移除此账户: "Remove this account",
  添加账户: "Add account",
  "正在保存…": "Saving…",
  从今天开始: "Start from today",
  "安心花，心里有数": "Spend with a clearer picture",
  "未来 30 天 · 含逾期还款": "Next 30 days · Includes overdue bills",
  接下来可以花多少: "Available to spend",
  银行卡余额: "Bank balances",
  留好的钱: "Set aside",
  近期要还: "Upcoming bills",
  "这个金额怎么算？": "How is this calculated?",
  "银行卡里的钱，减去你留好的钱，再减去未来 30 天及已到期还没还的账单。账单没填全时，这个数可能偏高。":
    "Bank balances minus money set aside, then unpaid bills due within 30 days or already overdue. Missing bills can make this amount too high.",
  "CAD 和 CNY 分开算。信用卡新消费还没出账时，会计入总欠款，但不会加到这期应还里。":
    "CAD and CNY are calculated separately. New card spending increases total debt but is not added to an existing statement balance.",
  储蓄目标: "Savings goal",
  调整目标: "Edit goal",
  设置目标: "Set a goal",
  目标: "Target",
  储蓄目标进度: "Savings goal progress",
  "% 已留好": "% set aside",
  已算在上方留好的钱里: "Included in the set-aside amount above",
  "想存多少钱？先设目标，再慢慢为它留钱。":
    "Choose a target, then set money aside at your own pace.",
  "有信用卡还没填本期账单。先补上还剩多少没还、哪天到期，首页金额才更有参考价值。":
    "Some cards have no statement recorded. Add the remaining balance and actual due date for a more useful spending estimate.",
  接下来要还: "Coming due",
  还款清单: "Repayment list",
  "按到期日先后排列 ·": "By due date · ",
  笔待还: "unpaid bills",
  全部: "View all",
  还款不再算一笔消费: "Repayments are not another expense",
  "这里还没有待还账单。如果卡里有欠款，请先到“账户”填写本期账单。":
    "No unpaid statements are recorded. If you owe money on a card, add its statement under Accounts.",
  本期账单: "Statement",
  "· 这张卡总共欠": "· Total card debt ",
  核对: "Review",
  记还款: "Record payment",
  我的账户: "My accounts",
  "日常账户看余额，信用卡看欠款":
    "Everyday accounts show cash; credit cards show debt.",
  添加: "Add",
  日常账户: "Everyday accounts",
  信用卡: "Credit cards",
  个: "accounts",
  "已留好 {0}": "Set aside: {0}",
  "这张卡总共欠的钱，不等于这期要还的金额":
    "Total owed on this card; different from this statement's remaining balance.",
  核对余额: "Check balance",
  核对总欠款: "Check total debt",
  留好一笔钱: "Set money aside",
  添加本期账单: "Add statement",
  本月已记录收支: "Recorded this month",
  "开始记录：": "Started on: ",
  "；本月覆盖从": "; this month's recorded period is ",
  到: "to",
  "。补记的旧交易也会按发生日期统计。这个月还没核对完整，没记下来不代表没花过。":
    ". Backfilled entries are counted by their transaction dates. This month is not verified as complete; missing entries do not mean no spending.",
  最近交易: "Recent transactions",
  "最近 100 笔": "Latest 100 entries",
  "从第一笔开始，慢慢建立清楚的账。":
    "Start with one entry and build a clearer picture.",
  无备注: "No note",
  "历史补录 · 不再次改变来源账户余额":
    "Historical entry · Source balance is not changed again",
  "已撤销，原记录保留": "Reversed · Original entry retained",
  到账: "Received",
  撤销: "Reverse",
  主要导航: "Main navigation",
  记一笔: "Add entry",
  核对账单: "Review statement",
  添加账单: "Add statement",
  "{0} · 留好一笔钱": "{0} · Set money aside",
  存钱目标: "Savings goal",
  "{0} · 核对余额": "{0} · Check balance",
  关闭表单: "Close form",
  "虚构数据 · 可以试填，真实账户不会变化":
    "Fictional data · Try the form without changing real accounts",
  "本地试填，刷新后恢复。真实账户不会变化。":
    "Local preview only. Refreshing resets it. Real accounts are unchanged.",
  给目标起个名字: "Name your goal",
  备用金: "Emergency fund",
  从哪个日常账户留钱: "Account holding this money",
  "总共想存多少（账户币种）": "Target amount (in the account currency)",
  现在已经留好多少: "Amount already set aside",
  "只算你专门留给这个目标的钱。它会放进账户预留里，不算消费，也不会重复扣掉。":
    "Only count money assigned to this goal. It is included in account reserves, not spending, and is not deducted twice.",
  交易类型: "Transaction type",
  这次实际还了多少: "Amount actually repaid",
  转出金额: "Amount sent",
  金额: "Amount",
  从哪张银行卡还: "Paying bank account",
  从哪个账户转出: "Sending account",
  钱收到哪里: "Receiving account",
  退到哪个账户: "Refund destination",
  用哪个账户付的: "Paid with",
  还到哪张信用卡: "Credit card paid",
  转到哪个账户: "Destination account",
  请选择: "Choose an account",
  "实际到账 / 减少欠款金额 ·": "Amount received / debt reduced · ",
  哪天发生的: "Transaction date",
  备注: "Note",
  "补以前的账？点这里看看": "Adding an old entry? Read this first",
  "这笔已经包含在银行余额里，只补记录":
    "Already included in the bank balance; add history only",
  "比最近一次余额核对更早的记录，不会再扣一次钱。同一天补记、且银行余额已经包含这笔时，请勾选上面一项。还款先抵最早到期的账单；多还的部分只减少总欠款。":
    "Entries dated before the latest balance check do not change balances again. For same-day entries already included by the bank, check the box above. Payments go to the earliest due statement first; excess reduces total debt only.",
  账户名称: "Account name",
  "日常账户（银行卡 / 现金）": "Everyday account (bank / cash)",
  "银行卡余额 / 信用卡总欠款": "Bank balance / total card debt",
  "把今天银行显示的数填进来，作为记账起点，不算收入或消费。":
    "Use the balance your bank shows today as the starting point. It is not income or spending.",
  这里记的是: "Recorded balance: ",
  "。填入今天银行显示的实际数，就能继续记账。差额会留下记录，不算收入或消费。":
    ". Enter today's actual bank balance to continue. Any difference is recorded without treating it as income or spending.",
  银行现在显示的余额: "Balance shown by your bank",
  这张卡现在总共欠多少: "Total debt currently shown for this card",
  "为什么有差别（可不填）": "Reason for the difference (optional)",
  "例如：漏记几天，按银行余额继续":
    "For example: missed a few days; continue from the bank balance",
  "核对卡的总欠款，不会改动这期还剩多少。记账期间余额有变化时，会提醒你重新确认。":
    "Checking total card debt does not change the statement balance. If the balance changes while you work, you will be asked to check again.",
  "学费、生活费或储蓄，想留着不随便花的钱放在这里。信用卡本期还款会另外留出，别重复算。":
    "Set aside money for tuition, living costs or savings. Statement payments are reserved separately; do not include them twice.",
  "准备留好多少钱 ·": "Amount to set aside · ",
  "银行这期账单总额 ·": "Original statement amount · ",
  "这期还剩多少没还 ·": "Remaining statement balance · ",
  这期最晚哪天还: "Actual statement due date",
  "按银行显示的数修改这期账单。只改这期应还，不改卡的总欠款。":
    "Use your bank's figures to update this statement. This does not change total card debt.",
  "一张新账单填一次就好。如果已经还过一部分，剩余应还只填还没还的数。":
    "Add each statement once. If you have already paid part of it, enter only the unpaid part as the remaining balance.",
  关闭: "Close",
  "演示模式 · 不保存": "Demo · No saving",
  更新本地目标: "Update preview goal",
  确认保存: "Save entry",
  "CAD 和 CNY 分开计算 · 以已同步的记录为准":
    "CAD and CNY are separate · Based on confirmed data",
  "正在打开 SaveWise…": "Opening SaveWise…",
  界面语言: "Display language",
  剩余应还: "Remaining due",
  "金额最多两位小数，请输入有效数字":
    "Enter a valid amount with no more than two decimal places.",
  金额超出范围: "The amount is out of range.",
  "给目标起个名字，最多 40 个字": "Enter a goal name, up to 40 characters.",
  目标金额需要大于零: "The target must be greater than zero.",
  "已留好的钱不能小于零，也不能超过目标":
    "The allocation cannot be negative or exceed the target.",
  请选择存放这笔钱的日常账户: "Choose an everyday account for this money.",
  "原来的存钱账户不存在，请重新设置":
    "The original goal account no longer exists. Please set it up again.",
  "这个账户的钱不够，请调低已留好的金额":
    "This account does not have enough money. Lower the allocation.",
  请先登录: "Please sign in first.",
  请先完成首次设置: "Complete first-time setup first.",
  账户不存在或无权限: "The account does not exist or is not accessible.",
  目标账户不存在或无权限:
    "The destination account does not exist or is not accessible.",
  信用卡不存在或无权限: "The card does not exist or is not accessible.",
  账单不存在或无权限: "The statement does not exist or is not accessible.",
  交易不存在或无权限: "The entry does not exist or is not accessible.",
  "余额已变化，请刷新后重新核对":
    "The balance changed. Refresh and check it again.",
  "余额已变化，请刷新": "The balance changed. Please refresh.",
  "账单已变化，请刷新后重新核对":
    "The statement changed. Refresh and check it again.",
  "同币种转账金额必须相等，费用请单独记账":
    "Same-currency transfer amounts must match. Record fees separately.",
  还款必须从资产账户转入信用卡:
    "Repayments must go from a bank or cash account to a credit card.",
  "向信用卡付款请使用还款类型，以更新账单分配":
    "Use Repayment when paying a card so its statement balances are updated.",
  当前仅支持从资产账户转出:
    "Transfers currently support sending from bank or cash accounts only.",
  "信用卡退款请使用退款类型，不计收入":
    "Use Refund for money returned to a card; it is not income.",
  请按今天的实际余额对账: "Use today's actual balance for reconciliation.",
  "还款后账单已手动更正，请先核对账单，不能自动撤销此还款":
    "The statement was manually changed after this payment. Review it before reversing the payment.",
  "对账记录不能撤销，请重新对账":
    "Balance adjustments cannot be reversed. Check the balance again instead.",
  重试内容变化: "The retry differs from the original request.",
  "重试内容变化，请使用新的请求编号":
    "The retry differs from the original request. Use a new request identifier for a new entry.",
  请选择不同的目标账户: "Choose a different destination account.",
  "已完成首次设置，请刷新": "Setup is already complete. Please refresh.",
  请填写实际到期日期: "Enter the actual due date.",
  交易金额或类型无效: "The transaction amount or type is invalid.",
  交易日期无效: "The transaction date is invalid.",
  到账金额无效: "The received amount is invalid.",
  预留不能超过可用余额: "The reserve cannot exceed the available balance.",
  资产余额或预留金额无效: "The account balance or reserve is invalid.",
  资产起始余额或预留金额无效: "The opening balance or reserve is invalid.",
  时区无效: "The time zone is invalid.",
  起始日期无效: "The starting date is invalid.",
  日期无效: "The date is invalid.",
  "请添加 1 至 30 个账户": "Add between 1 and 30 accounts.",
  资产账户不存在或无权限:
    "The bank or cash account does not exist or is not accessible.",
  缺少请求编号: "The request identifier is missing.",
};

export function readLanguage(): Language {
  try {
    return localStorage.getItem(LANGUAGE_STORAGE_KEY) === "en" ? "en" : "zh";
  } catch {
    return "zh";
  }
}
export function saveLanguage(language: Language): void {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    /* A blocked browser store must not prevent language switching. */
  }
}
export function translate(
  source: string,
  language: Language,
  values: Record<string, unknown> = {},
): string {
  const message = language === "en" ? (english[source] ?? source) : source;
  return message.replace(/\{(\w+)\}/g, (token, key: string) =>
    Object.hasOwn(values, key) ? String(values[key] ?? "") : token,
  );
}
export function translateMessage(message: string, language: Language): string {
  if (language === "zh") return message;
  if (english[message]) return english[message];
  const prefixes = [
    "同步失败：",
    "注册未完成：",
    "登录失败：",
    "邮件暂未发送：",
    "退出会话失败，请关闭当前页面并重试：",
    "未保存：",
  ];
  for (const prefix of prefixes) {
    if (message.startsWith(prefix))
      return translate(prefix + "{0}", language, {
        0: translateMessage(message.slice(prefix.length), language),
      });
  }
  if (/Signups not allowed for otp/i.test(message))
    return "This email cannot use existing-account link sign-in yet. Register and verify it first.";
  if (/duplicate key.*sw_statements/i.test(message))
    return "A statement with this due date already exists. Review the existing statement instead.";
  if (/[\u3400-\u9fff]/.test(message))
    return "Could not complete the request. Please review your entry and try again.";
  return message;
}

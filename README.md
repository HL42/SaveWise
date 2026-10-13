# SaveWise

给自己用的轻量理财账本：从今天的真实余额开始，知道未来 30 天能花多少、信用卡什么时候还。

## 当前实现

- React + TypeScript 前端，Supabase Auth 登录、PostgreSQL 存储。
- 服务端验证的身份配合 RLS 隔离用户；不使用前端口令或 `x-user-id` 作为身份凭证。
- 银行余额、信用卡欠款作为起始快照，不计入收入或消费，无需补齐以前的账。
- 信用卡总欠款、账单金额、剩余应还、实际到期日期分别保存。
- 支出、收入、退款、转账、还款、对账和撤销；金额按整数分保存，CAD/CNY 分别统计。
- 部分还款按最早到期账单分配；还款不计消费，退款抵减支出。
- 历史补录不重复影响已对账余额；统计说明记录区间与完整性。
- 首页显示可支配金额、还款清单、数据更新时间和同步状态。
- 写入有事务、幂等和版本保护；网络结果未知可以重试原请求。
- 账号独立缓存，退出或切换清理缓存与草稿；演示为本地只读虚构数据。

首页和普通记账直接请求 Supabase，不依赖 Render 或 Gemini。旧 Express 财务接口返回 410，保留 `/health` 兼容检查；新版不读写 MongoDB。

## 快速开始

使用 Node.js 24 LTS（最低 22.12）。

```sh
npm ci
npm --prefix client ci
npm --prefix server ci
cp client/.env.example client/.env.local
```

在 `client/.env.local` 填入项目的公开 Publishable key 或 legacy anon key，再启动：

```sh
npm --prefix client run dev -- --host 127.0.0.1
```

不能将 secret / service_role key 放入客户端。项目 URL 和公开 key 是浏览器配置，财务访问权限由身份验证与数据库规则控制。

个人使用：在 Supabase Dashboard → Authentication → Users 创建自己的用户。应用不开放注册。首次登录填写当前余额、信用卡欠款及已知账单；真实旧账不自动导入。

## 数据库与登录配置

项目 `edgcercowznfxekrmlbt` 的迁移 `20261013000100` 已于 2026-10-12（America/Toronto）应用。云端只读结构核验通过：6 张 RLS 表、9 个已认证业务 RPC、2 个不开放的内部函数；匿名角色无读权限，客户端无直接写表权限。

已配置关闭公开注册，Site URL 为 `https://save-wise-theta.vercel.app`，允许该站点及两个本地开发地址登录回调。邮件确认、MFA 和其他未声明设置保持原样。

```sh
npm run db:verify
npm run auth:diff
```

本地完整配置在 `supabase/config.toml`。云端最小配置在 `deploy/supabase/config.toml`；不要把本地完整配置直接推送到生产。后续数据库变更用新增迁移，不能修改已应用的迁移或执行生产 `db reset`。

完整操作步骤：[Supabase 配置与运行说明](docs/SUPABASE_SETUP.md)。

## 验证与部署

```sh
npm run check
```

运行 15 项本地数据库/金额/日期测试、前端 lint 和前后端构建。GitHub Actions 对 push 和 PR 执行同样检查；CI 不访问云端财务数据，也不执行云端迁移。

前端托管项目根目录为 `client`，构建命令 `npm run build`，输出 `dist`，Node.js 版本为 24。配置 `VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY` 后重新构建。Git push 是否自动发布取决于托管平台的 Git 集成，不等于已验证线上版本。

旧 Render 服务应更新为兼容服务器或停用。更新之前，旧代码的身份校验问题仍可能在线上存在。

## 已知边界

- 没有批量历史导入、银行同步、自动汇率、AI 功能或完整月份确认。
- 最近交易展示 100 笔，尚未实现分页。
- 界面时区默认 America/Toronto，尚未提供设置入口。
- 还款按最早到期分配；银行分配不同或账单受退款影响时，需要核对账单。
- 可支配金额是现金减预留和未来 30 天/逾期账单，不包含尚未知的未来账单；缺少账单时会提示。
- 本地 PGlite 测试不替代实际邮件登录验收和多连接并发压力测试。

个人复盘：[为什么这样改，以及下一步](docs/RECAP.md)。变更记录：[CHANGELOG](CHANGELOG.md)。

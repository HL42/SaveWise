# SaveWise - Smart Conversational Finance PWA

SaveWise 是一款基于 AI 驱动的“对话式”个人财务管理系统。它旨在打破传统记账 App 繁琐的点击交互，通过自然语言处理（NLP）实现秒级入账，并结合多账户对账系统提供实时资产概览。

## 🚀 核心亮点

- **AI-First 交互**：集成 Google Gemini API，支持模糊语义识别（如：“昨晚打车花了30”），自动解析交易金额、类别、时间和账户。
- **PWA 原生体验**：基于 Vite PWA 插件实现，支持离线访问、添加到主屏幕以及沉浸式全屏 UI，体验媲美原生 App。
- **多账户对账引擎**：严谨的资产/负债逻辑，支持借记卡、信用卡、微信等多种支付媒介的余额同步。
- **可视化理财目标**：实时计算总资产与存款目标的差距，通过进度条可视化激励用户储蓄。

## 🏗️ 技术架构

### Frontend
- **React 18 + TypeScript**: 类型安全与组件化开发。
- **Tailwind CSS**: 响应式 UI，高度定制化的财务看板。
- **PWA (Vite-plugin-pwa)**: Service Workers 离线缓存与 Manifest 沉浸式配置。

### Backend
- **Node.js (Express)**: RESTful API 架构。
- **Gemini 1.5 Flash**: 极速语义解析，实现毫秒级入账反馈。
- **MongoDB Atlas**: 灵活的 Schema 存储非结构化的交易记录。

## 🧩 核心逻辑实现

### 1. AI 解析 Pipeline
后端接收到用户文本后，通过预设的 `System Prompt` 引导 AI 输出结构化 JSON。系统会自动处理相对时间（如“上周”）并将其映射到数据库账户 ID。

### 2. 双向对账系统 (Double-Entry Inspired)
系统将账户分为“资产类”和“负债类”。
- **资产类 (Assets)**: 支出 = 余额减少。
- **负债类 (Liabilities)**: 支出 = 欠款增加（余额数值上升）。
这种设计确保了在处理“信用卡还款”等转账场景时，净资产计算的准确性。

## 📸 项目预览
(此处可以放置你的 PWA 手机壳截图或 GIF 演示)

## 🛠️ 安装与运行
1. `npm install`
2. 配置 `.env` (包含 MONGODB_URI 和 GEMINI_API_KEY)
3. `npm run dev`

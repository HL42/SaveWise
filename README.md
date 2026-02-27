# SaveWise — A Bilingual AI-Driven Personal Finance Ecosystem

**Value Proposition:** SaveWise is a production-style full-stack finance platform that combines bilingual LLM transaction parsing, multi-credit-card liability accounting, and real-time CAD/CNY valuation to deliver accurate net-worth intelligence for Canadian daily life.

URL: https://save-wise-theta.vercel.app/

<img width="471" height="953" alt="Screenshot 2026-02-26 at 8 44 10 PM" src="https://github.com/user-attachments/assets/0c9916be-0e20-43ec-8228-9fef62a01f8c" />

---

## Overview

SaveWise is designed for users who want fast, conversational bookkeeping without sacrificing accounting correctness.

Instead of forcing rigid form-based workflows, the platform accepts natural-language financial input (English/Chinese), resolves intent into structured transactions, updates account balances with asset/liability-safe logic, and visualizes portfolio value in a dual-currency context.

## ✨ What does it do?

- Chat to Log: No more complex forms. Type "Spent $5 at Tims" or "用微信还了 600 信用卡" and the AI handles the rest.

- Bilingual AI: Powered by Gemini 2.0, it understands both English and Chinese and maps them to the correct accounts.

- Canadian Friendly: Specifically designed for local use cases. Supports Canadian banks (BMO, RBC, etc.) and real-time CAD/CNY exchange rates.

- Smart Credit Card Logic: It treats credit cards as debt, not assets. When you "repay" a card, it correctly balances your net worth without double-counting expenses.

- Roast My Spending: An AI feature that looks at your week and gives you a sarcastic (but helpful) critique of your spending.

---

## Tech Stack

| Layer             | Technology            | Why It Matters                                                              |
| ----------------- | --------------------- | --------------------------------------------------------------------------- |
| Frontend          | **React 18**          | Component-driven UI architecture for responsive financial dashboards        |
| Frontend Language | **TypeScript**        | Static typing for safer domain logic and refactoring at scale               |
| Styling           | **Tailwind CSS**      | Rapid, consistent UI implementation for glassmorphism-grade interfaces      |
| Backend           | **Node.js (Express)** | Lightweight, scalable API surface for transactional workflows               |
| Database          | **MongoDB**           | Flexible document schema for evolving finance + account metadata            |
| AI/NLP            | **Google Gemini 2.0** | Bilingual intent extraction and transaction structuring from free-form text |
| Live FX           | **Frankfurter API**   | realtime CAD/CNY FX valuation for CAD/CNY                                   |

---

## Architecture Highlights

### 1. Bilingual LLM Integration

SaveWise uses a prompt-engineered parsing layer to normalize natural language into deterministic JSON.

**Key outcomes:**

- Handles both Chinese and English user inputs
  - Example: `Spent 5 on coffee` and `买了5块钱咖啡`
- Classifies intent into transaction types:
  - `expense`, `income`, `transfer`
- Resolves repayment semantics robustly:
  - Credit-card repayment is always interpreted as `transfer`, not expense inflation
- Supports dynamic account names beyond defaults (e.g., **BMO**, **RBC**, custom cards)

This required iterative prompt design + backend safeguards to prevent misclassification in ambiguous statements.

---

### 2. Financial Architecture (Asset/Liability Correctness)

A core engineering challenge was preserving financial truth under mixed account classes.

#### Account Semantics

- **Asset accounts** (cash/debit/WeChat wallet): represent owned funds
- **Liability accounts** (credit cards): represent debt outstanding

#### Balance Mutation Rules

- **Expense**
  - Asset: `balance -= amount`
  - Liability: `balance += amount` (debt increases)
- **Income**
  - Asset: `balance += amount`
  - Liability: `balance -= amount` (debt decreases)
- **Transfer**
  - Source always decreases
  - Target liability decreases for repayments

This model ensures **Net Worth accuracy** and avoids the common anti-pattern where card repayment is double-counted as expense.

---

### 3. Real-time FX Valuation (CAD/CNY)

SaveWise integrates live conversion via:

- `https://api.frankfurter.app/latest?from=CAD&to=CNY`

#### Total Balance Formula (CAD base)

\[
\text{Total} = (\text{CAD Assets} + \frac{\text{CNY Assets}}{\text{FX}}) - (\text{CAD Liabilities} + \frac{\text{CNY Liabilities}}{\text{FX}})
\]

This separation prevents data drift and guarantees auditability of account-level balances.

---

## Feature Highlights

- **Bilingual LLM Integration**

  - Conversational bookkeeping in English/Chinese with structured transaction output

- **Multi-Credit-Card Management**

  - Dynamic liability account creation (e.g., BMO, RBC)
  - Due-date tracking and repayment-safe transfer behavior

- **Real-time FX Valuation**

  - CAD/CNY market rate integration for valuation-only conversion

- **Behavioral Finance Analysis**

  - “**Roast My Spending**” module for AI-generated weekly spending critique

- **PWA for Native-like Experience**
  - Mobile-first UX designed for quick-add flows and habitual usage patterns

---

## Getting Started

### Prerequisites

- Node.js 18+
- MongoDB (local or Atlas)
- Gemini API key

### Environment Variables

Create `.env` in `server/`:

```bash
MONGODB_URI=your_mongodb_uri
GEMINI_API_KEY=your_gemini_key
PORT=5005
```

### Run Locally

```bash
# Backend
cd server
npm install
npm run dev

# Frontend
cd ../client
npm install
npm run dev
```

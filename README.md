# SaveWise — A Bilingual AI-Driven Personal Finance Ecosystem

**Value Proposition:** SaveWise is a production-style full-stack finance platform that combines bilingual LLM transaction parsing, multi-credit-card liability accounting, and real-time CAD/CNY valuation to deliver accurate net-worth intelligence for Canadian daily life.

---

## Overview
SaveWise is designed for users who want fast, conversational bookkeeping without sacrificing accounting correctness.

Instead of forcing rigid form-based workflows, the platform accepts natural-language financial input (English/Chinese), resolves intent into structured transactions, updates account balances with asset/liability-safe logic, and visualizes portfolio value in a dual-currency context.

This project demonstrates strong end-to-end engineering across:
- LLM integration and prompt hardening
- Financial domain modeling and correctness constraints
- Real-time FX valuation architecture
- Product-oriented frontend interaction design

---

## Tech Stack

| Layer | Technology | Why It Matters |
|---|---|---|
| Frontend | **React 18** | Component-driven UI architecture for responsive financial dashboards |
| Frontend Language | **TypeScript** | Static typing for safer domain logic and refactoring at scale |
| Styling | **Tailwind CSS** | Rapid, consistent UI implementation for glassmorphism-grade interfaces |
| Backend | **Node.js (Express)** | Lightweight, scalable API surface for transactional workflows |
| Database | **MongoDB** | Flexible document schema for evolving finance + account metadata |
| AI/NLP | **Google Gemini 2.0** | Bilingual intent extraction and transaction structuring from free-form text |

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

#### Storage/Computation Separation (Critical Design Decision)
- **Stored balance is always native currency amount** (never pre-converted)
- FX conversion is applied only for:
  - aggregated portfolio valuation
  - optional display-layer currency rendering

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

## Canadian Context Support
SaveWise is tuned for practical Canadian use cases:
- Local credit card naming support (e.g., **BMO**, **RBC**, **TD**)
- Typical day-to-day spending language:
  - coffee runs (e.g., **Tims**)
  - gas/fuel transactions
  - mixed CAD/CNY finance scenarios for newcomers and cross-border households

---

## Screenshots

> Replace with your real product captures (recommended for portfolio and interviews).

- `[Screenshot 1: Dashboard - CAD/CNY total valuation]`
- `[Screenshot 2: Add credit card modal - BMO setup]`
- `[Screenshot 3: Conversational input + parsed transaction result]`
- `[Screenshot 4: Roast My Spending weekly analysis]`

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

---

## API Surface (Core)

- `POST /api/record` — Parse NL input with Gemini and persist transaction
- `GET /api/accounts` — Return accounts + CAD/CNY FX payload
- `POST /api/accounts` — Add dynamic liability account (credit card)
- `PUT /api/accounts/:name` — Update account balance, due date, display currency
- `GET /api/stats/monthly` — Monthly income/expense aggregation
- `POST /api/analyze` — Behavioral finance commentary (“Roast My Spending”)

---

## Engineering Notes for Reviewers
This project intentionally prioritizes:
- deterministic financial correctness under LLM uncertainty
- clean separation of persisted values vs. valuation transformations
- extensible account architecture for real-world bank/card expansion

If you are evaluating this for hiring, focus on the system decisions around:
1. intent disambiguation (`expense` vs `transfer`)
2. liability-safe bookkeeping
3. native-currency storage with valuation-only FX conversion


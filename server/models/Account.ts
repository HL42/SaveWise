import mongoose, { Schema, Document, Model } from "mongoose";

export const CORE_ACCOUNT_NAMES = {
  WeChat: "WeChat",
  Cash: "Cash",
  CreditCard: "CreditCard",
  DebitCard: "DebitCard",
} as const;

// 账户大类：资产（钱在你手里） vs 负债（欠款，如信用卡）
export type AccountType = "asset" | "liability";
export type AccountCurrency = "CAD" | "CNY";

// TypeScript 接口，用来约束 Account 文档的类型
export interface IAccount extends Document {
  name: string;
  type: AccountType;
  currency: AccountCurrency;
  displayCurrency: AccountCurrency;
  balance: number;
  /** 还款日（每月几号），1-31 */
  dueDate?: number;
}

const AccountSchema: Schema<IAccount> = new Schema<IAccount>(
  {
    name: {
      type: String,
      required: true,
      unique: true,
    },
    type: {
      type: String,
      enum: ["asset", "liability"],
      required: true,
      default: "asset",
    },
    currency: {
      type: String,
      enum: ["CAD", "CNY"],
      required: true,
      default: "CAD",
    },
    displayCurrency: {
      type: String,
      enum: ["CAD", "CNY"],
      required: true,
      default: "CAD",
    },
    balance: {
      type: Number,
      required: true,
      default: 0,
    },
    dueDate: {
      type: Number,
      min: 1,
      max: 31,
    },
  },
  {
    timestamps: true,
  }
);

export const Account: Model<IAccount> =
  mongoose.models.Account || mongoose.model<IAccount>("Account", AccountSchema);

import mongoose, { Schema, Document, Model } from "mongoose";

// 账户类型的枚举，限制可选值
export enum AccountName {
  WeChat = "WeChat",
  Cash = "Cash",
  CreditCard = "CreditCard",
  DebitCard = "DebitCard",
}

// 账户大类：资产（钱在你手里） vs 负债（欠款，如信用卡）
export type AccountType = "asset" | "liability";

// TypeScript 接口，用来约束 Account 文档的类型
export interface IAccount extends Document {
  name: AccountName;
  type: AccountType;
  balance: number;
  /** 账单日（每月几号），1-31 */
  billingDate?: number;
  /** 还款日（每月几号），1-31 */
  dueDate?: number;
}

const AccountSchema: Schema<IAccount> = new Schema<IAccount>(
  {
    name: {
      type: String,
      enum: Object.values(AccountName),
      required: true,
      unique: true,
    },
    type: {
      type: String,
      enum: ["asset", "liability"],
      required: true,
      default: "asset",
    },
    balance: {
      type: Number,
      required: true,
      default: 0,
    },
    billingDate: {
      type: Number,
      min: 1,
      max: 31,
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


import mongoose, { Schema, Document, Model, Types } from "mongoose";
import { IAccount } from "./Account";

// 交易类型：支出 / 收入 / 转账
export type TransactionType = "expense" | "income" | "transfer";

// 交易记录接口
export interface ITransaction extends Document {
  userId: string;
  amount: number;
  type: TransactionType;
  category: string;
  // 对应的主账户（对于 transfer，一般认为是转出的账户）
  account: Types.ObjectId | IAccount;
  date: Date;
  note?: string;
}

const TransactionSchema: Schema<ITransaction> = new Schema<ITransaction>(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    type: {
      type: String,
      enum: ["expense", "income", "transfer"],
      required: true,
    },
    category: {
      type: String,
      required: true,
    },
    account: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },
    date: {
      type: Date,
      required: true,
      default: () => new Date(),
    },
    note: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

export const Transaction: Model<ITransaction> =
  mongoose.models.Transaction ||
  mongoose.model<ITransaction>("Transaction", TransactionSchema);

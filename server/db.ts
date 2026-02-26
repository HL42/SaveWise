import mongoose from "mongoose";
import dotenv from "dotenv";

// 提前加载 .env 配置（如果在其他地方已经加载，这里会是幂等的）
dotenv.config();

const mongoUri = process.env.MONGODB_URI;

if (!mongoUri) {
  // 在开发阶段，尽早暴露配置问题
  throw new Error("MONGODB_URI is not defined in .env");
}

// 建立一个可复用的连接 Promise，避免重复连接
export const connectDB = async (): Promise<typeof mongoose> => {
  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  try {
    await mongoose.connect(mongoUri);
    console.log("[MongoDB] connected");
    return mongoose;
  } catch (error) {
    console.error("[MongoDB] connection error:", error);
    throw error;
  }
};


import "dotenv/config";
import express from "express";

// The financial application now uses Supabase Auth + RLS + transactional RPCs.
// Retire all legacy endpoints: a forged x-user-id must never reach MongoDB.
const app = express();
app.get("/health", (_req, res) =>
  res.json({ status: "ok", financialBackend: "supabase" }),
);
app.use("/api", (_req, res) => {
  res
    .status(410)
    .json({
      error: "旧版记账 API 已停用。请使用新版 Supabase 登录和数据库接口。",
    });
});
const port = Number(process.env.PORT ?? 5005);
app.listen(port, () =>
  console.log(
    `Legacy compatibility server listening on ${port}; financial API disabled.`,
  ),
);

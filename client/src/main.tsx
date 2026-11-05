import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { readLanguage, translate } from "./locales";

// /demo reuses the main layout with the Supabase client disabled in development.
const Root = lazy(() => import("./App"));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Suspense
      fallback={
        <p role="status" style={{ padding: 24 }}>
          {translate("正在打开 SaveWise…", readLanguage())}
        </p>
      }
    >
      <Root />
    </Suspense>
  </StrictMode>,
);

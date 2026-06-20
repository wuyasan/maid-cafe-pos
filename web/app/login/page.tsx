import type { Metadata } from "next";
import { loginAction } from "@/lib/server/actions/auth";
import { PinLoginForm } from "@/components/auth/PinLoginForm";
import { LanguageToggle } from "@/components/i18n/LanguageToggle";

export const metadata: Metadata = { title: "Login – Maid Cafe" };

export default function LoginPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--page-bg)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
      }}
    >
      {/* Language toggle — top-right of the login card area */}
      <div
        style={{
          width: "100%",
          maxWidth: "520px",
          display: "flex",
          justifyContent: "flex-end",
          marginBottom: "12px",
        }}
      >
        <LanguageToggle />
      </div>

      <PinLoginForm loginAction={loginAction} />
    </main>
  );
}

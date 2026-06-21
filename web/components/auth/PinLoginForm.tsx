"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { LoginResult } from "@/lib/server/actions/auth";

type Role = "staff" | "admin";

interface Props {
  loginAction: (role: Role, pin: string) => Promise<LoginResult>;
}

// Heart SVG — matches design logo mark
function HeartIcon({ size = 20, color = "#fff" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 20s-7-4.6-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.4-7 10-7 10Z"
        fill={color}
      />
    </svg>
  );
}

// Lock SVG — PIN field icon
function LockIcon() {
  return (
    <svg
      width={17}
      height={17}
      viewBox="0 0 24 24"
      stroke="#B0989E"
      strokeWidth="1.7"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4" y="10" width="16" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

// Mail SVG — ID field icon
function MailIcon() {
  return (
    <svg
      width={17}
      height={17}
      viewBox="0 0 24 24"
      stroke="#B0989E"
      strokeWidth="1.7"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

export function PinLoginForm({ loginAction }: Props) {
  const t = useTranslations("auth");
  const router = useRouter();
  const [role, setRole] = useState<Role>("staff");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await loginAction(role, pin);
      if (result.ok) {
        router.push(role === "admin" ? "/admin" : "/staff");
      } else {
        setError(t(result.errorCode));
        setPin("");
      }
    });
  }

  return (
    // ── Outer card: gradient background 520×430 ──
    <div
      style={{
        width: "520px",
        maxWidth: "100%",
        height: "auto",
        minHeight: "430px",
        borderRadius: "24px",
        overflow: "hidden",
        boxShadow: "var(--shadow-login)",
        position: "relative",
        background: "linear-gradient(150deg, #C9486A 0%, #A8567E 55%, #8E86C9 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 24px",
      }}
    >
      {/* Brand header top-left */}
      <div
        style={{
          position: "absolute",
          top: "26px",
          left: "30px",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          gap: "9px",
        }}
      >
        <HeartIcon size={20} color="#fff" />
        <span
          style={{
            fontFamily: "var(--font-display-stack)",
            fontWeight: 700,
            fontSize: "16px",
          }}
        >
          Moonlight Maid Café
        </span>
      </div>

      {/* Decorative floating heart top-right */}
      <svg
        width={120}
        height={120}
        viewBox="0 0 24 24"
        style={{
          position: "absolute",
          top: "40px",
          right: "24px",
          opacity: 0.14,
          animation: "softFloat 4s ease-in-out infinite",
          pointerEvents: "none",
        }}
        aria-hidden="true"
      >
        <path
          d="M12 20s-7-4.6-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.4-7 10-7 10Z"
          fill="#fff"
        />
      </svg>

      {/* ── Inner white card ── */}
      <form
        onSubmit={handleSubmit}
        style={{
          background: "#fff",
          borderRadius: "22px",
          padding: "30px 32px",
          width: "380px",
          maxWidth: "100%",
          boxShadow: "var(--shadow-inner)",
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* Title */}
        <div
          style={{
            fontFamily: "var(--font-display-stack)",
            fontWeight: 700,
            fontSize: "23px",
            textAlign: "center",
            color: "var(--foreground)",
          }}
        >
          {t("title")}
        </div>

        {/* Subtitle */}
        <div
          style={{
            textAlign: "center",
            fontSize: "12.5px",
            color: "#A8959A",
            marginBottom: "18px",
          }}
        >
          {t("subtitle")}
        </div>

        {/* Role toggle */}
        <div
          style={{
            display: "flex",
            background: "#FBF6F3",
            borderRadius: "11px",
            padding: "4px",
            marginBottom: "16px",
            fontSize: "13px",
            fontWeight: 600,
            textAlign: "center",
          }}
          role="group"
          aria-label="role"
        >
          {(["staff", "admin"] as const).map((r) => {
            const active = r === role;
            return (
              <button
                key={r}
                type="button"
                onClick={() => { setRole(r); setPin(""); setError(null); }}
                aria-pressed={active}
                style={{
                  flex: 1,
                  background: active ? "#fff" : "transparent",
                  color: active ? "#C9486A" : "#A8959A",
                  borderRadius: "8px",
                  padding: "9px",
                  border: "none",
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: "13px",
                  boxShadow: active ? "0 2px 6px -2px rgba(58,42,48,0.2)" : "none",
                  minHeight: "var(--tap-min)",
                  transition: "all 0.15s ease",
                }}
              >
                {t(r === "staff" ? "roleStaff" : "roleAdmin")}
              </button>
            );
          })}
        </div>

        {/* ID field (visual only — design shows it, but login logic only needs PIN) */}
        <div
          style={{
            border: "1.5px solid rgba(58,42,48,0.14)",
            borderRadius: "12px",
            padding: "13px 15px",
            fontSize: "13.5px",
            color: "#A8959A",
            marginBottom: "11px",
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
          aria-hidden="true"
        >
          <MailIcon />
          {t("idPlaceholder")}
        </div>

        {/* PIN input */}
        <div style={{ marginBottom: error ? "8px" : "18px" }}>
          <label
            htmlFor="pin"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              border: `1.5px solid ${error ? "#C9486A" : "rgba(58,42,48,0.14)"}`,
              borderRadius: "12px",
              padding: "13px 15px",
              background: "#fff",
              cursor: "text",
            }}
          >
            <LockIcon />
            <input
              id="pin"
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              placeholder={t("pinPlaceholder")}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              required
              style={{
                border: "none",
                outline: "none",
                flex: 1,
                fontSize: "13.5px",
                color: pin ? "var(--foreground)" : "#A8959A",
                background: "transparent",
                letterSpacing: pin ? "0.2em" : "normal",
                fontFamily: "var(--font-num-stack)",
              }}
            />
          </label>
        </div>

        {/* Error */}
        {error && (
          <p
            role="alert"
            style={{
              fontSize: "12px",
              color: "#C9486A",
              marginBottom: "12px",
              paddingLeft: "2px",
            }}
          >
            {error}
          </p>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={pending || pin.length === 0}
          style={{
            width: "100%",
            background: "#3A2A30",
            color: "#fff",
            textAlign: "center",
            borderRadius: "13px",
            padding: "14px",
            fontFamily: "var(--font-display-stack)",
            fontWeight: 700,
            fontSize: "15px",
            boxShadow: "0 12px 24px -12px rgba(58,42,48,0.8)",
            border: "none",
            cursor: pending || pin.length === 0 ? "not-allowed" : "pointer",
            opacity: pending || pin.length === 0 ? 0.6 : 1,
            minHeight: "var(--tap-min)",
            transition: "opacity 0.15s ease",
          }}
        >
          {pending ? "…" : t("submit")}
        </button>
      </form>
    </div>
  );
}

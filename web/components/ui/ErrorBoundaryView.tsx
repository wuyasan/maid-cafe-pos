"use client";
/**
 * ErrorBoundaryView — shared inner content for route-group error.tsx files.
 * Renders a friendly "service unavailable" card with a retry button.
 * Uses next-intl via useTranslations("common").
 *
 * Each route group wraps this in its own error.tsx:
 *   "use client";
 *   export default function Error({ reset }: { reset: () => void }) {
 *     return <ErrorBoundaryView reset={reset} />;
 *   }
 */
import { useTranslations } from "next-intl";

function CloudOffIcon() {
  return (
    <svg
      width={32}
      height={32}
      viewBox="0 0 24 24"
      stroke="#C9486A"
      strokeWidth="1.6"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ margin: "0 auto", display: "block" }}
      aria-hidden="true"
    >
      <path d="M18.36 6.64a9 9 0 0 1 1.535 9.917" />
      <path d="M2 2l20 20" />
      <path d="M20.08 16.08A5 5 0 0 1 17 17H7a5 5 0 0 1-1-9.9" />
      <path d="M12 12v.01" />
      <path d="M12 6a6.5 6.5 0 0 1 6.5 6.5" />
    </svg>
  );
}

interface ErrorBoundaryViewProps {
  reset: () => void;
}

export function ErrorBoundaryView({ reset }: ErrorBoundaryViewProps) {
  const t = useTranslations("common");

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#FBF6F3",
        padding: "24px",
      }}
    >
      <div
        role="alert"
        style={{
          background: "#FCF1F4",
          border: "1px solid rgba(201,72,106,0.18)",
          borderRadius: "18px",
          padding: "32px 28px",
          maxWidth: "360px",
          width: "100%",
          textAlign: "center",
          boxShadow: "0 4px 16px -6px rgba(58,42,48,0.10)",
        }}
      >
        <CloudOffIcon />

        <div
          style={{
            fontWeight: 700,
            fontSize: "16px",
            color: "#C9486A",
            marginTop: "14px",
            fontFamily: "var(--font-display-stack, inherit)",
          }}
        >
          {t("serviceUnavailable")}
        </div>

        <div
          style={{
            fontSize: "13px",
            color: "#8A7873",
            marginTop: "8px",
            lineHeight: 1.5,
          }}
        >
          {t("serviceUnavailableHint")}
        </div>

        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: "22px",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "12px",
            padding: "11px 28px",
            fontWeight: 600,
            fontSize: "13.5px",
            border: "none",
            cursor: "pointer",
            minHeight: "var(--tap-min)",
            fontFamily: "inherit",
            background: "#C9486A",
            color: "#fff",
            boxShadow: "0 8px 18px -10px rgba(201,72,106,0.8)",
          }}
        >
          {t("retryAction")}
        </button>
      </div>
    </div>
  );
}

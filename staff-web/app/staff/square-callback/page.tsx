"use client";

import Link from "next/link";
import {
  useEffect,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";

import { apiPostNoBody } from "@/lib/api";
import {
  SQUARE_PENDING_CHECKOUT_KEY,
  type PendingSquareCheckout,
} from "@/lib/squarePos";

type CallbackState =
  | "processing"
  | "success"
  | "error";

function parseSquareData(raw: string | null) {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(
      decodeURIComponent(raw),
    ) as {
      status?: string;
      error_code?: string;
      transaction_id?: string;
      state?: string;
    };
  } catch {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
}

export default function SquareCallbackPage() {
  const searchParams = useSearchParams();
  const [state, setState] =
    useState<CallbackState>("processing");
  const [message, setMessage] = useState(
    "Confirming Square payment...",
  );
  const [tableCode, setTableCode] =
    useState("");

  useEffect(() => {
    async function finish() {
      const saved = window.localStorage.getItem(
        SQUARE_PENDING_CHECKOUT_KEY,
      );

      let pending:
        | PendingSquareCheckout
        | null = null;

      if (saved) {
        try {
          pending = JSON.parse(
            saved,
          ) as PendingSquareCheckout;
        } catch {
          pending = null;
        }
      }

      const result = parseSquareData(
        searchParams.get("data"),
      );

      if (!pending) {
        setState("error");
        setMessage(
          "Square returned, but the pending table could not be found. Confirm the payment in Square before using the manual Mark Paid button.",
        );
        return;
      }

      setTableCode(pending.tableCode);

      const succeeded =
        result?.status === "ok" ||
        Boolean(result?.transaction_id);

      if (!succeeded) {
        setState("error");
        setMessage(
          result?.error_code
            ? `Square did not complete payment: ${result.error_code}`
            : "Square payment was cancelled or did not return a successful result.",
        );
        return;
      }

      try {
        await apiPostNoBody(
          `/staff/table/${encodeURIComponent(
            pending.tableCode,
          )}/mark-paid`,
        );

        window.localStorage.removeItem(
          SQUARE_PENDING_CHECKOUT_KEY,
        );

        setState("success");
        setMessage(
          `Payment confirmed. Table ${pending.tableCode} is available again.`,
        );
      } catch (err) {
        setState("error");
        setMessage(
          err instanceof Error
            ? err.message
            : "Payment succeeded, but the bill could not be marked paid.",
        );
      }
    }

    void finish();
  }, [searchParams]);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: "#f8fafc",
        color: "#111827",
      }}
    >
      <section
        style={{
          width: "min(560px, 100%)",
          padding: 26,
          borderRadius: 20,
          background: "#ffffff",
          border: "1px solid #e5e7eb",
          boxShadow:
            "0 14px 40px rgba(15,23,42,.09)",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 46 }}>
          {state === "processing"
            ? "⏳"
            : state === "success"
              ? "✅"
              : "⚠️"}
        </div>

        <h1>
          {state === "processing"
            ? "Processing Payment"
            : state === "success"
              ? "Payment Complete"
              : "Payment Needs Review"}
        </h1>

        <p
          style={{
            color: "#64748b",
            lineHeight: 1.6,
          }}
        >
          {message}
        </p>

        <div
          style={{
            marginTop: 20,
            display: "flex",
            justifyContent: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          {tableCode ? (
            <Link
              href={`/staff/table/${encodeURIComponent(
                tableCode,
              )}`}
              style={{
                padding: "11px 16px",
                borderRadius: 11,
                background: "#111827",
                color: "#ffffff",
                textDecoration: "none",
                fontWeight: 900,
              }}
            >
              Return to Table
            </Link>
          ) : null}

          <Link
            href="/staff/floor"
            style={{
              padding: "11px 16px",
              borderRadius: 11,
              border:
                "1px solid #d1d5db",
              color: "#111827",
              textDecoration: "none",
              fontWeight: 850,
            }}
          >
            Floor Map
          </Link>
        </div>
      </section>
    </main>
  );
}

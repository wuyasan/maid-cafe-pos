"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  readPendingCheckout,
  clearPendingCheckout,
} from "@/lib/squarePos";
import { markPaid, cancelCheckout } from "@/lib/server/actions/staff";
import { formatUSD } from "@/lib/money";

type CallbackState = "processing" | "success" | "error" | "cancelled";

type SquareCallbackData = {
  status?: string;
  error_code?: string;
  transaction_id?: string;
  state?: string;
};

function parseSquareData(raw: string | null): SquareCallbackData | null {
  if (!raw) return null;
  try {
    return JSON.parse(decodeURIComponent(raw)) as SquareCallbackData;
  } catch {
    try {
      return JSON.parse(raw) as SquareCallbackData;
    } catch {
      return null;
    }
  }
}

function SquareCallbackContent() {
  const searchParams = useSearchParams();
  const t = useTranslations("payment");

  const [callbackState, setCallbackState] = useState<CallbackState>("processing");
  const [tableCode, setTableCode] = useState<string>("");
  const [transactionId, setTransactionId] = useState<string | null>(null);
  const [paidTotal, setPaidTotal] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [billRestored, setBillRestored] = useState<boolean>(false);

  useEffect(() => {
    async function finish() {
      const pending = readPendingCheckout();
      const result = parseSquareData(searchParams.get("data"));

      if (!pending) {
        setCallbackState("error");
        setErrorMessage(t("noPending"));
        return;
      }

      setTableCode(pending.tableCode);
      setPaidTotal(pending.total);

      // Determine success: Square returns status==="ok" or a transaction_id.
      const isCancelled = result?.status === "cancel" || result?.error_code === "USER_CANCELED";
      const succeeded =
        result?.status === "ok" || Boolean(result?.transaction_id);

      if (isCancelled) {
        // Unfreeze the bill back to "open" so staff can edit it or retry.
        const cancelRes = await cancelCheckout(pending.tableCode);
        setBillRestored(cancelRes.ok);

        // Clear stale pending — bill is back to open; staff must start a fresh
        // checkout (startCheckout re-freezes + recalculates total) from the
        // table detail page. Never re-use the old pending total.
        clearPendingCheckout();

        setCallbackState("cancelled");
        return;
      }

      if (!succeeded) {
        setCallbackState("error");
        setErrorCode(result?.error_code ?? null);
        setErrorMessage(
          result?.error_code
            ? t("squareError", { code: result.error_code })
            : t("squareFailed"),
        );
        return;
      }

      const txnId = result?.transaction_id ?? null;
      setTransactionId(txnId);

      // Idempotency key: combine billId + transaction_id so retries are safe.
      const idempotencyKey = `bill:${pending.billId}:txn:${txnId ?? "manual"}`;

      try {
        const res = await markPaid(pending.tableCode, {
          provider_payment_id: txnId ?? undefined,
          amount: pending.total,
          idempotency_key: idempotencyKey,
        });

        if (!res.ok) {
          setCallbackState("error");
          setErrorMessage(res.error);
          return;
        }

        clearPendingCheckout();
        setCallbackState("success");
      } catch (e) {
        setCallbackState("error");
        setErrorMessage(
          e instanceof Error ? e.message : t("markPaidFailed"),
        );
      }
    }

    void finish();
  }, [searchParams, t]);

  const tableHref = tableCode
    ? `/staff/table/${encodeURIComponent(tableCode)}`
    : "/staff/floor";

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: "var(--background)",
        color: "var(--foreground)",
      }}
    >
      <section
        style={{
          width: "min(560px, 100%)",
          padding: 28,
          borderRadius: 20,
          background: "var(--card)",
          border: "1px solid var(--line)",
          boxShadow: "0 14px 40px rgba(15,23,42,.09)",
          textAlign: "center",
        }}
      >
        {/* Icon */}
        <div style={{ fontSize: 52, marginBottom: 12 }}>
          {callbackState === "processing" && "⏳"}
          {callbackState === "success" && "✅"}
          {callbackState === "error" && "⚠️"}
          {callbackState === "cancelled" && "↩️"}
        </div>

        {/* Title */}
        <h1 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 900 }}>
          {callbackState === "processing" && t("processingTitle")}
          {callbackState === "success" && t("successTitle")}
          {callbackState === "error" && t("errorTitle")}
          {callbackState === "cancelled" && t("cancelledTitle")}
        </h1>

        {/* Body */}
        {callbackState === "success" && (
          <div style={{ color: "var(--muted)", lineHeight: 1.6 }}>
            {paidTotal && (
              <p style={{ fontSize: 28, fontWeight: 900, color: "var(--ready)", margin: "8px 0" }}>
                {formatUSD(paidTotal)}
              </p>
            )}
            {transactionId && (
              <p style={{ fontSize: 12, color: "var(--muted-2)", marginTop: 4 }}>
                {t("txnId")} {transactionId}
              </p>
            )}
            <p style={{ marginTop: 8 }}>{t("recordedHint")}</p>
          </div>
        )}

        {callbackState === "error" && (
          <p style={{ color: "var(--muted)", lineHeight: 1.6 }}>
            {errorMessage}
            {errorCode && (
              <span style={{ display: "block", fontSize: 12, color: "var(--muted-2)", marginTop: 4 }}>
                {t("errorCode")} {errorCode}
              </span>
            )}
          </p>
        )}

        {callbackState === "cancelled" && (
          <p style={{ color: "var(--muted)", lineHeight: 1.6 }}>
            {billRestored ? t("cancelledBillRestored") : t("cancelledHint")}
          </p>
        )}

        {callbackState === "processing" && (
          <p style={{ color: "var(--muted)", lineHeight: 1.6 }}>
            {t("processingHint")}
          </p>
        )}

        {/* Actions */}
        <div
          style={{
            marginTop: 24,
            display: "flex",
            justifyContent: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          {callbackState === "success" && (
            <>
              <Link
                href={tableHref}
                style={{
                  padding: "12px 18px",
                  borderRadius: 12,
                  background: "var(--foreground)",
                  color: "#ffffff",
                  textDecoration: "none",
                  fontWeight: 900,
                  minHeight: "var(--tap-min)",
                  display: "inline-flex",
                  alignItems: "center",
                }}
              >
                {t("returnToFloor")}
              </Link>
              <Link
                href="/staff/floor"
                style={{
                  padding: "12px 18px",
                  borderRadius: 12,
                  border: "1px solid var(--line)",
                  color: "var(--foreground)",
                  textDecoration: "none",
                  fontWeight: 700,
                  minHeight: "var(--tap-min)",
                  display: "inline-flex",
                  alignItems: "center",
                }}
              >
                {t("floorMap")}
              </Link>
            </>
          )}

          {callbackState === "error" && (
            <>
              {tableCode && (
                <Link
                  href={tableHref}
                  style={{
                    padding: "12px 18px",
                    borderRadius: 12,
                    background: "var(--ready)",
                    color: "#ffffff",
                    textDecoration: "none",
                    fontWeight: 900,
                    minHeight: "var(--tap-min)",
                    display: "inline-flex",
                    alignItems: "center",
                  }}
                >
                  {t("manualMarkPaid")}
                </Link>
              )}
              <Link
                href="/staff/floor"
                style={{
                  padding: "12px 18px",
                  borderRadius: 12,
                  border: "1px solid var(--line)",
                  color: "var(--foreground)",
                  textDecoration: "none",
                  fontWeight: 700,
                  minHeight: "var(--tap-min)",
                  display: "inline-flex",
                  alignItems: "center",
                }}
              >
                {t("floorMap")}
              </Link>
            </>
          )}

          {callbackState === "cancelled" && (
            <Link
              href={tableCode ? tableHref : "/staff/floor"}
              style={{
                padding: "12px 18px",
                borderRadius: 12,
                border: "1px solid var(--line)",
                color: "var(--foreground)",
                textDecoration: "none",
                fontWeight: 700,
                minHeight: "var(--tap-min)",
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              {t("returnToTable")}
            </Link>
          )}
        </div>
      </section>
    </main>
  );
}

function SquareCallbackLoading() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: "var(--background)",
        color: "var(--foreground)",
      }}
    >
      <section
        style={{
          width: "min(560px, 100%)",
          padding: 28,
          borderRadius: 20,
          background: "var(--card)",
          border: "1px solid var(--line)",
          boxShadow: "0 14px 40px rgba(15,23,42,.09)",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 52 }}>⏳</div>
        <h1 style={{ margin: "12px 0 8px", fontSize: 22, fontWeight: 900 }}>
          Processing Payment
        </h1>
        <p style={{ color: "var(--muted)", lineHeight: 1.6 }}>
          Loading Square payment result…
        </p>
      </section>
    </main>
  );
}

export default function SquareCallbackPage() {
  return (
    <Suspense fallback={<SquareCallbackLoading />}>
      <SquareCallbackContent />
    </Suspense>
  );
}

"use client";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useLiveQuery } from "@/lib/hooks/useLiveQuery";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import {
  updateOrderItemQty,
  deleteOrderItem,
  startCheckout,
  cancelCheckout,
  markPaid,
} from "@/lib/server/actions/staff";
import { formatUSD } from "@/lib/money";
import {
  getSquareConfig,
  buildSquarePosUrl,
  savePendingCheckout,
  clearPendingCheckout,
} from "@/lib/squarePos";
import type { BillDetail, BillItem } from "@/lib/types";

interface Props {
  tableCode: string;
  initialBill: BillDetail | null;
}

// Status badge styling (matching design)
const STATUS_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  open:     { bg: "#F6EFE0", color: "#8A6B2E",  label: "使用中" },
  paying:   { bg: "#EDEBF6", color: "#6E66A8",  label: "结账中" },
  paid:     { bg: "#E6F1EA", color: "#3F8763",  label: "已付 ✓" },
  closed:   { bg: "#EEE8E5", color: "#8A7873",  label: "已关闭" },
  cleared:  { bg: "#E6F1EA", color: "#3F8763",  label: "空闲" },
};

export function TableDetail({ tableCode, initialBill }: Props) {
  const t = useTranslations("staff");
  const tPay = useTranslations("payment");
  const pathname = usePathname();

  // Poll via /api/staff/table/[code]/bill to keep bill live.
  const fetcher = useCallback(
    () =>
      fetch(`/api/staff/table/${tableCode}/bill`).then((r) => {
        if (!r.ok) throw new Error("bill fetch failed");
        return r.json() as Promise<BillDetail | null>;
      }),
    [tableCode],
  );

  const { data: liveBill, isStale, hasFetched, refetch } = useLiveQuery(fetcher, {
    intervalMs: 5000,
  });

  // Once the poller has successfully fetched at least once, trust the live value.
  // Before first fetch, fall back to the SSR initialBill.
  const bill = hasFetched ? liveBill : initialBill;

  // ─── Confirm dialog ─────────────────────────────────────────────────────────
  const { confirm, dialog: confirmDialog } = useConfirm();

  // ─── Payment state ─────────────────────────────────────────────────────────
  const [squarePending, setSquarePending] = useState(false);
  const [markPaidPending, setMarkPaidPending] = useState(false);
  const [cancelCheckoutPending, setCancelCheckoutPending] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const squareResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // When user returns from Square POS, reset the Square button.
  useEffect(() => {
    function reset() {
      setSquarePending(false);
      setPayError(null);
      refetch();
    }
    const onFocus = () => reset();
    const onVis = () => {
      if (document.visibilityState === "visible") reset();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refetch]);

  async function handleSquarePayment() {
    if (!bill || squarePending || markPaidPending || cancelCheckoutPending) return;
    setPayError(null);
    setSquarePending(true);

    squareResetTimer.current = setTimeout(() => {
      setSquarePending(false);
    }, 4000);

    try {
      try {
        getSquareConfig();
      } catch {
        clearTimeout(squareResetTimer.current!);
        setSquarePending(false);
        const next = encodeURIComponent(pathname);
        window.location.href = `/staff/square-settings?next=${next}`;
        return;
      }

      const res = await startCheckout(tableCode);
      if (!res.ok) {
        clearTimeout(squareResetTimer.current!);
        setSquarePending(false);
        setPayError(res.error);
        return;
      }

      const billId = res.data.bill_id;
      // Use the authoritative server-side total snapshot, not the potentially stale bill.total.
      const total = res.data.checkout_total;

      savePendingCheckout({
        tableCode,
        billId,
        total,
        createdAt: new Date().toISOString(),
      });

      const url = buildSquarePosUrl({ total, tableCode, billId });
      window.location.href = url;
    } catch (e) {
      clearTimeout(squareResetTimer.current!);
      setSquarePending(false);
      setPayError(e instanceof Error ? e.message : tPay("genericError"));
    }
  }

  async function handleManualMarkPaid() {
    if (!bill || squarePending || markPaidPending || cancelCheckoutPending) return;
    const confirmed = await confirm({
      title: tPay("confirmManualTitle"),
      description: tPay("confirmManualDesc"),
    });
    if (!confirmed) return;

    setPayError(null);
    setMarkPaidPending(true);

    const timer = setTimeout(() => setMarkPaidPending(false), 4000);
    try {
      const res = await markPaid(tableCode, { manual: true });
      clearTimeout(timer);
      setMarkPaidPending(false);
      if (!res.ok) {
        setPayError(res.error);
      } else {
        refetch();
      }
    } catch (e) {
      clearTimeout(timer);
      setMarkPaidPending(false);
      setPayError(e instanceof Error ? e.message : tPay("genericError"));
    }
  }

  async function handleCancelCheckout() {
    if (!bill || cancelCheckoutPending || squarePending || markPaidPending) return;
    const confirmed = await confirm({
      title: tPay("confirmCancelCheckoutTitle"),
      description: tPay("confirmCancelCheckoutDesc"),
    });
    if (!confirmed) return;

    setPayError(null);
    setCancelCheckoutPending(true);
    try {
      const res = await cancelCheckout(tableCode);
      setCancelCheckoutPending(false);
      if (!res.ok) {
        // Surface 409 (payment already exists) with a dedicated message.
        if (res.error.includes("payment") || res.error.includes("Payment")) {
          setPayError(tPay("cancelCheckoutPaymentExists"));
        } else {
          setPayError(res.error);
        }
      } else {
        clearPendingCheckout();
        refetch();
      }
    } catch (e) {
      setCancelCheckoutPending(false);
      setPayError(e instanceof Error ? e.message : tPay("genericError"));
    }
  }

  const billPaid = bill?.status === "paid";
  const billPaying = bill?.status === "paying";
  // If poller has fetched at least once and bill is null, the table has been cleared/released.
  const isCleared = hasFetched && !bill;
  const statusKey = isCleared ? "cleared" : (bill?.status ?? "open");
  const badge = STATUS_BADGE[statusKey] ?? STATUS_BADGE.open;

  return (
    <>
    {confirmDialog}
    <div
      style={{ background: "#FBF6F3", minHeight: "100vh", display: "flex", flexDirection: "column" }}
    >
      {/* ── Top bar ──────────────────────────────────────────────────── */}
      <div
        style={{
          padding: "18px 24px 14px",
          borderBottom: "1px solid rgba(58,42,48,0.07)",
          background: "#fff",
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}
      >
        <Link
          href="/staff/floor"
          aria-label={t("table.backToFloor")}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 36,
            height: 36,
            borderRadius: 10,
            border: "1px solid var(--line)",
            color: "var(--muted)",
            textDecoration: "none",
            flexShrink: 0,
            fontSize: 18,
          }}
        >
          ←
        </Link>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <h1
              style={{
                fontFamily: "var(--font-display-stack)",
                fontWeight: 700,
                fontSize: 20,
                color: "var(--foreground)",
                lineHeight: 1.2,
                margin: 0,
              }}
            >
              {tableCode} 号桌
            </h1>
            {/* Status badge */}
            <span
              style={{
                background: badge.bg,
                color: badge.color,
                fontSize: 11.5,
                fontWeight: 600,
                padding: "6px 12px",
                borderRadius: 999,
                flexShrink: 0,
              }}
            >
              {badge.label}
            </span>
          </div>
          <p
            style={{
              fontSize: 12,
              color: isStale ? "var(--cooking)" : "var(--muted-2)",
              marginTop: 2,
            }}
          >
            {isStale ? t("table.stale") : t("table.live")}
          </p>
        </div>
      </div>

      {/* ── Bill content ──────────────────────────────────────────────── */}
      <div style={{ flex: 1, padding: "20px 20px 24px" }}>
        {!bill || bill.items.length === 0 ? (
          <div
            style={{
              display: "flex",
              minHeight: 200,
              alignItems: "center",
              justifyContent: "center",
              background: "#fff",
              border: "1px solid var(--line)",
              borderRadius: 18,
            }}
          >
            <p style={{ fontSize: 14, color: "#B0989E" }}>{t("table.noBill")}</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Bill items */}
            <div
              style={{
                background: "#fff",
                borderRadius: 18,
                border: "1px solid rgba(58,42,48,0.06)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "14px 16px 10px",
                  borderBottom: "1px solid rgba(58,42,48,0.06)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-display-stack)",
                    fontWeight: 700,
                    fontSize: 15,
                    color: "var(--foreground)",
                  }}
                >
                  账单明细
                </span>
                <span style={{ fontSize: 11, color: "#C2ADB3" }}>
                  {bill.items.length} 项
                </span>
              </div>

              <ul style={{ display: "flex", flexDirection: "column" }}>
                {bill.items.map((item, i) => (
                  <BillItemRow
                    key={item.order_item_id}
                    item={item}
                    billStatus={bill.status}
                    onRefetch={refetch}
                    isLast={i === bill.items.length - 1}
                    confirm={confirm}
                  />
                ))}
              </ul>

              {/* Total row */}
              <div
                style={{
                  padding: "13px 16px 14px",
                  borderTop: "1px dashed rgba(58,42,48,0.14)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-display-stack)",
                    fontWeight: 700,
                    fontSize: 16,
                    color: "var(--foreground)",
                  }}
                >
                  合计
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-num-stack)",
                    fontWeight: 700,
                    fontSize: 22,
                    color: "var(--brand)",
                  }}
                >
                  {formatUSD(bill.total)}
                </span>
              </div>
            </div>

            {/* ── Payment panel ─────────────────────────────────── */}
            <div
              style={{
                background: "#fff",
                borderRadius: 18,
                border: "1px solid rgba(58,42,48,0.06)",
                padding: "16px",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              {payError && (
                <div
                  style={{
                    background: "#fef2f2",
                    borderRadius: 10,
                    padding: "10px 12px",
                    fontSize: 12,
                    color: "#b91c1c",
                  }}
                >
                  {payError}
                </div>
              )}

              {billPaying && !squarePending && (
                <>
                  <p style={{ fontSize: 11.5, color: "var(--cooking)", textAlign: "center" }}>
                    {tPay("payingStatus")}
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleCancelCheckout()}
                    disabled={cancelCheckoutPending}
                    style={{
                      border: "1.5px solid rgba(201,72,106,0.3)",
                      background: "transparent",
                      color: cancelCheckoutPending ? "var(--muted)" : "#C9486A",
                      borderRadius: 14,
                      padding: "12px",
                      fontWeight: 600,
                      fontSize: 13,
                      cursor: cancelCheckoutPending ? "not-allowed" : "pointer",
                      opacity: cancelCheckoutPending ? 0.7 : 1,
                      minHeight: "var(--tap-min)",
                      transition: "opacity 0.15s",
                    }}
                  >
                    {cancelCheckoutPending ? tPay("processing") : tPay("cancelCheckout")}
                  </button>
                </>
              )}

              {billPaid ? (
                <div
                  style={{
                    background: "var(--ready)",
                    color: "#fff",
                    borderRadius: 14,
                    padding: "15px",
                    textAlign: "center",
                    fontFamily: "var(--font-display-stack)",
                    fontWeight: 700,
                    fontSize: 15,
                  }}
                >
                  {tPay("billPaid")}
                </div>
              ) : (
                <>
                  {/* Square payment button */}
                  <button
                    type="button"
                    onClick={() => void handleSquarePayment()}
                    disabled={squarePending || markPaidPending || cancelCheckoutPending || billPaid}
                    style={{
                      background: squarePending || cancelCheckoutPending ? "var(--muted)" : "#C9486A",
                      color: "#fff",
                      borderRadius: 14,
                      padding: "15px",
                      fontFamily: "var(--font-display-stack)",
                      fontWeight: 700,
                      fontSize: 15,
                      border: "none",
                      cursor: squarePending || markPaidPending || cancelCheckoutPending ? "not-allowed" : "pointer",
                      opacity: squarePending || markPaidPending || cancelCheckoutPending ? 0.7 : 1,
                      minHeight: "var(--tap-min)",
                      boxShadow: squarePending || markPaidPending || cancelCheckoutPending
                        ? "none"
                        : "0 12px 24px -12px rgba(201,72,106,0.8)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 9,
                      transition: "opacity 0.15s, background 0.15s",
                    }}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#fff"
                      strokeWidth={1.8}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ width: 18, height: 18, flexShrink: 0 }}
                      aria-hidden="true"
                    >
                      <rect x="2" y="5" width="20" height="14" rx="2" />
                      <path d="M2 10h20" />
                    </svg>
                    {squarePending ? tPay("squareLaunching") : t("table.squarePayment")}
                  </button>

                  {/* Manual mark paid */}
                  <button
                    type="button"
                    onClick={() => void handleManualMarkPaid()}
                    disabled={squarePending || markPaidPending || cancelCheckoutPending || billPaid}
                    style={{
                      border: "1.5px solid rgba(58,42,48,0.14)",
                      background: "transparent",
                      color: markPaidPending || cancelCheckoutPending ? "var(--muted)" : "#3A2A30",
                      borderRadius: 14,
                      padding: "12px",
                      fontWeight: 600,
                      fontSize: 13,
                      cursor: squarePending || markPaidPending || cancelCheckoutPending ? "not-allowed" : "pointer",
                      opacity: squarePending || markPaidPending || cancelCheckoutPending ? 0.7 : 1,
                      minHeight: "var(--tap-min)",
                      transition: "opacity 0.15s",
                    }}
                  >
                    {markPaidPending ? tPay("processing") : t("table.markPaid")}
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
    </>
  );
}

// ── Bill item row ────────────────────────────────────────────────────────────

type ConfirmFn = (opts: { title: ReactNode; description?: ReactNode; confirmLabel?: string; cancelLabel?: string }) => Promise<boolean>;

function BillItemRow({
  item,
  billStatus,
  onRefetch,
  isLast,
  confirm,
}: {
  item: BillItem;
  billStatus: string;
  onRefetch: () => void;
  isLast: boolean;
  confirm: ConfirmFn;
}) {
  const t = useTranslations("staff");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isEditable = billStatus === "open";

  function handleQty(delta: number) {
    if (!isEditable || isPending) return;
    const newQty = item.quantity + delta;
    setError(null);
    if (newQty <= 0) {
      // Removing the last unit is equivalent to deletion — confirm first.
      void confirm({
        title: t("action.confirmDelete"),
        description: t("action.confirmDeleteDesc"),
      }).then((ok) => {
        if (!ok) return;
        startTransition(async () => {
          const res = await deleteOrderItem(item.order_item_id);
          if (!res.ok) setError(t("action.actionFailed"));
          onRefetch();
        });
      });
    } else {
      startTransition(async () => {
        const res = await updateOrderItemQty(item.order_item_id, newQty);
        if (!res.ok) setError(t("action.actionFailed"));
        onRefetch();
      });
    }
  }

  function handleDelete() {
    if (!isEditable || isPending) return;
    setError(null);
    void confirm({
      title: t("action.confirmDelete"),
      description: t("action.confirmDeleteDesc"),
    }).then((ok) => {
      if (!ok) return;
      startTransition(async () => {
        const res = await deleteOrderItem(item.order_item_id);
        if (!res.ok) setError(t("action.actionFailed"));
        onRefetch();
      });
    });
  }

  return (
    <li
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        background: "#FBF6F3",
        borderRadius: 13,
        padding: "12px 14px",
        margin: "4px 8px",
        marginBottom: isLast ? 4 : 0,
        opacity: isPending ? 0.6 : 1,
        transition: "opacity 0.15s",
        gap: 12,
      }}
    >
      {/* Name + maids + notes */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            fontWeight: 600,
            fontSize: 13.5,
            color: "var(--foreground)",
            lineHeight: 1.3,
            margin: 0,
          }}
        >
          {item.menu_item_name}
          {!isEditable && ` ×${item.quantity}`}
        </p>
        {item.selected_maids.length > 0 && (
          <p style={{ marginTop: 2, fontSize: 11, color: "var(--maid)" }}>
            ♡ {item.selected_maids.map((m) => m.maid_name).join(", ")}
          </p>
        )}
        {item.notes && (
          <p style={{ marginTop: 2, fontSize: 11, fontStyle: "italic", color: "var(--muted)" }}>
            {item.notes}
          </p>
        )}
        {error && (
          <p style={{ marginTop: 2, fontSize: 11, color: "var(--brand)" }}>{error}</p>
        )}
        {isEditable && (
          <p style={{ marginTop: 2, fontSize: 10.5, color: "#A8959A" }}>可改 / 删数量</p>
        )}
      </div>

      {/* Qty controls (if editable) */}
      {isEditable && (
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => handleQty(-1)}
            disabled={isPending}
            aria-label={t("action.updateQty")}
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              border: "1px solid var(--line)",
              background: "#fff",
              color: "var(--muted)",
              fontWeight: 700,
              fontSize: 16,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            −
          </button>
          <span
            style={{
              width: 24,
              textAlign: "center",
              fontWeight: 600,
              fontSize: 13.5,
              color: "var(--foreground)",
            }}
          >
            {item.quantity}
          </span>
          <button
            type="button"
            onClick={() => handleQty(1)}
            disabled={isPending}
            aria-label={t("action.updateQty")}
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              border: "none",
              background: "var(--foreground)",
              color: "#fff",
              fontWeight: 700,
              fontSize: 16,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            +
          </button>
        </div>
      )}

      {/* Price + delete */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 4,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-num-stack)",
            fontWeight: 700,
            fontSize: 14,
            color: item.selected_maids.length > 0 ? "var(--maid)" : "var(--foreground)",
          }}
        >
          {formatUSD(item.total_price)}
        </span>
        {isEditable && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={isPending}
            aria-label={t("action.delete")}
            style={{
              fontSize: 11,
              color: "var(--muted-2)",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: "2px 4px",
            }}
          >
            ✕
          </button>
        )}
      </div>
    </li>
  );
}

"use client";

import DeleteBillItemButton from "@/components/staff/DeleteBillItemButton";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useState,
} from "react";

import {
  apiGet,
  apiPostNoBody,
} from "@/lib/api";
import {
  buildSquarePosUrl,
  SQUARE_PENDING_CHECKOUT_KEY,
  type PendingSquareCheckout,
} from "@/lib/squarePos";
import type { BillDetail } from "@/lib/types";

type Props = {
  params: Promise<{ tableCode: string }>;
};

function money(value?: string | null) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function isMissingSquareConfigError(
  error: unknown,
) {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.includes(
      "Square Application ID is not configured",
    ) ||
    error.message.includes(
      "Square callback URL is not configured",
    )
  );
}

export default function StaffSingleTablePage({
  params,
}: Props) {
  const router = useRouter();

  const [tableCode, setTableCode] =
    useState("");
  const [bill, setBill] =
    useState<BillDetail | null>(null);
  const [loading, setLoading] =
    useState(true);
  const [
    actionLoading,
    setActionLoading,
  ] = useState<
    "square" | "paid" | null
  >(null);
  const [error, setError] =
    useState("");
  const [message, setMessage] =
    useState("");

  useEffect(() => {
    params.then((value) => {
      setTableCode(value.tableCode);
    });
  }, [params]);

  /*
   * When Square opens, Safari/WKWebView goes into the
   * background. If the user cancels or returns without a
   * callback, reset the button from "Opening Square...".
   */
  useEffect(() => {
    function resetSquareButton() {
      setActionLoading((current) =>
        current === "square"
          ? null
          : current,
      );
    }

    function handleVisibilityChange() {
      if (
        document.visibilityState ===
        "visible"
      ) {
        window.setTimeout(
          resetSquareButton,
          150,
        );
      }
    }

    window.addEventListener(
      "focus",
      resetSquareButton,
    );
    window.addEventListener(
      "pageshow",
      resetSquareButton,
    );
    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange,
    );

    return () => {
      window.removeEventListener(
        "focus",
        resetSquareButton,
      );
      window.removeEventListener(
        "pageshow",
        resetSquareButton,
      );
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange,
      );
    };
  }, []);

  async function loadBill(code: string) {
    setLoading(true);
    setError("");

    try {
      const result =
        await apiGet<BillDetail>(
          `/customer-orders/customer/table/${encodeURIComponent(
            code,
          )}/bill`,
        );

      setBill(result);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load bill",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (tableCode) {
      void loadBill(tableCode);
    }
  }, [tableCode]);

  async function payInSquare() {
    if (!bill || !tableCode) {
      return;
    }

    try {
      setActionLoading("square");
      setError("");
      setMessage("");

      const squareUrl =
        buildSquarePosUrl({
          total: bill.total,
          tableCode,
          billId: bill.id,
        });

      await apiPostNoBody(
        `/staff/table/${encodeURIComponent(
          tableCode,
        )}/start-checkout`,
      );

      const pending:
        PendingSquareCheckout = {
        tableCode,
        billId: bill.id,
        total: bill.total,
        createdAt:
          new Date().toISOString(),
      };

      window.localStorage.setItem(
        SQUARE_PENDING_CHECKOUT_KEY,
        JSON.stringify(pending),
      );

      /*
       * Fallback reset in case the browser blocks the
       * deep link and never backgrounds.
       */
      window.setTimeout(() => {
        setActionLoading((current) =>
          current === "square"
            ? null
            : current,
        );
      }, 4000);

      window.location.href = squareUrl;
    } catch (err) {
      if (
        isMissingSquareConfigError(err)
      ) {
        const returnPath =
          `/staff/table/${encodeURIComponent(
            tableCode,
          )}`;

        router.push(
          `/staff/square-settings?next=${encodeURIComponent(
            returnPath,
          )}`,
        );
        return;
      }

      setError(
        err instanceof Error
          ? err.message
          : "Could not open Square Point of Sale",
      );
      setActionLoading(null);
    }
  }

  async function markPaidManually() {
    if (!tableCode) {
      return;
    }

    const confirmed =
      window.confirm(
        "Only continue after Square shows a successful payment. Mark this bill paid?",
      );

    if (!confirmed) {
      return;
    }

    try {
      setActionLoading("paid");
      setError("");
      setMessage("");

      await apiPostNoBody(
        `/staff/table/${encodeURIComponent(
          tableCode,
        )}/mark-paid`,
      );

      window.localStorage.removeItem(
        SQUARE_PENDING_CHECKOUT_KEY,
      );

      setMessage(
        "Payment recorded. The table is available again.",
      );

      await loadBill(tableCode);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to mark bill paid",
      );
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <main
      style={{
        maxWidth: 960,
        margin: "0 auto",
        padding: "24px 18px 64px",
        color: "#111827",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent:
            "space-between",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: 20,
        }}
      >
        <div>
          <h1 style={{ margin: 0 }}>
            Table {tableCode}
          </h1>

          <p
            style={{
              margin: "7px 0 0",
              color: "#64748b",
            }}
          >
            iPad checkout with Square Reader
          </p>
        </div>

        <div
          style={{
            display: "flex",
            gap: 9,
            flexWrap: "wrap",
          }}
        >
          <Link
            href={`/staff/square-settings?next=${encodeURIComponent(
              `/staff/table/${tableCode}`,
            )}`}
            style={{
              padding: "10px 14px",
              borderRadius: 11,
              border:
                "1px solid #d1d5db",
              background: "#ffffff",
              color: "#111827",
              textDecoration: "none",
              fontWeight: 800,
            }}
          >
            Square Settings
          </Link>

          <Link
            href="/staff/floor"
            style={{
              padding: "10px 14px",
              borderRadius: 11,
              border:
                "1px solid #d1d5db",
              background: "#ffffff",
              color: "#111827",
              textDecoration: "none",
              fontWeight: 800,
            }}
          >
            Back to Floor
          </Link>
        </div>
      </div>

      {error ? (
        <div
          style={{
            marginBottom: 16,
            padding: 13,
            borderRadius: 12,
            background: "#fef2f2",
            color: "#b91c1c",
          }}
        >
          {error}
        </div>
      ) : null}

      {message ? (
        <div
          style={{
            marginBottom: 16,
            padding: 13,
            borderRadius: 12,
            background: "#ecfdf5",
            color: "#047857",
          }}
        >
          {message}
        </div>
      ) : null}

      {loading ? (
        <p>Loading bill...</p>
      ) : null}

      {!loading && bill ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "minmax(0,1fr) minmax(280px,340px)",
            gap: 20,
            alignItems: "start",
          }}
        >
          <section
            style={{
              background: "#ffffff",
              border:
                "1px solid #e5e7eb",
              borderRadius: 18,
              padding: 18,
            }}
          >
            <h2 style={{ marginTop: 0 }}>
              Bill Items
            </h2>

            {bill.items.length === 0 ? (
              <p
                style={{
                  color: "#64748b",
                }}
              >
                No items yet.
              </p>
            ) : (
              <div
                style={{
                  display: "grid",
                  gap: 11,
                }}
              >
                {bill.items.map((item) => (
                  <article
                    key={
                      item.order_item_id
                    }
                    style={{
                      padding: 13,
                      borderRadius: 12,
                      background: "#f8fafc",
                      display: "flex",
                      justifyContent:
                        "space-between",
                      gap: 12,
                    }}
                  >
                    <div>
                      <strong>
                        {
                          item.menu_item_name
                        }
                      </strong>

                      <div
                        style={{
                          marginTop: 4,
                          color: "#64748b",
                          fontSize: 13,
                        }}
                      >
                        Qty {item.quantity}
                        {" · "}Unit{" "}
                        {money(
                          item.unit_price,
                        )}
                      </div>
                    </div>

                    <strong>
                      <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "flex-end",
                        gap: 10,
                        flexWrap: "wrap",
                      }}
                    >
                      <strong>
                        {money(item.total_price)}
                      </strong>

                      <DeleteBillItemButton
                        orderItemId={item.order_item_id}
                        itemName={item.menu_item_name}
                        quantity={item.quantity}
                        onDeleted={() => loadBill(tableCode)}
                      />
                    </div>
                    </strong>
                  </article>
                ))}
              </div>
            )}
          </section>

          <aside
            style={{
              background: "#ffffff",
              border:
                "1px solid #e5e7eb",
              borderRadius: 18,
              padding: 18,
              display: "grid",
              gap: 12,
            }}
          >
            <h2 style={{ margin: 0 }}>
              Checkout
            </h2>

            <div
              style={{
                display: "grid",
                gap: 7,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent:
                    "space-between",
                }}
              >
                <span>Subtotal</span>
                <strong>
                  {money(bill.subtotal)}
                </strong>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent:
                    "space-between",
                }}
              >
                <span>Tax</span>
                <strong>
                  {money(bill.tax)}
                </strong>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent:
                    "space-between",
                }}
              >
                <span>Service</span>
                <strong>
                  {money(
                    bill.service_charge,
                  )}
                </strong>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent:
                    "space-between",
                  paddingTop: 10,
                  borderTop:
                    "1px solid #e5e7eb",
                  fontSize: 22,
                }}
              >
                <span>Total</span>
                <strong>
                  {money(bill.total)}
                </strong>
              </div>
            </div>

            <button
              type="button"
              disabled={
                actionLoading !== null ||
                bill.items.length === 0 ||
                bill.status === "paid"
              }
              onClick={() =>
                void payInSquare()
              }
              style={{
                minHeight: 54,
                border: 0,
                borderRadius: 13,
                background: "#111827",
                color: "#ffffff",
                fontWeight: 900,
                fontSize: 16,
                cursor: "pointer",
                opacity:
                  actionLoading !== null ||
                  bill.items.length === 0
                    ? 0.55
                    : 1,
              }}
            >
              {actionLoading === "square"
                ? "Opening Square..."
                : "Pay with iPad Square Reader"}
            </button>

            <button
              type="button"
              disabled={
                actionLoading !== null ||
                bill.status === "paid"
              }
              onClick={() =>
                void markPaidManually()
              }
              style={{
                minHeight: 46,
                borderRadius: 12,
                border:
                  "1px solid #d1d5db",
                background: "#ffffff",
                color: "#111827",
                fontWeight: 850,
                cursor: "pointer",
              }}
            >
              {actionLoading === "paid"
                ? "Saving..."
                : "Square Paid · Mark Bill Paid"}
            </button>
          </aside>
        </div>
      ) : null}
    </main>
  );
}

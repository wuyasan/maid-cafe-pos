"use client";
import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { formatUSD } from "@/lib/money";
import { maidServiceUnitPrice } from "@/lib/maidPricing";
import { useLiveQuery } from "@/lib/hooks/useLiveQuery";
import { submitOrderAction } from "@/lib/server/actions/orders";
import { LiveDot } from "@/components/ui/LiveDot";
import { StateCard } from "@/components/ui/StateCard";
import type {
  BillDetail,
  BillItem,
  Category,
  Maid,
  MenuItem,
  OrderPayload,
  ProductionStatus,
} from "@/lib/types";

// ─── Types ───────────────────────────────────────────────────────────────────

type CartLine = {
  key: string;
  item: MenuItem;
  quantity: number;
  selectedMaidIds: number[];
  /** Per-item special request / dietary note */
  notes: string;
};

let keySeq = 0;
const nextKey = () => `l${++keySeq}`;

// ─── Gradient palette for image placeholders (cycles by item id) ─────────────
const GRADIENTS = [
  "linear-gradient(135deg,#F4E7E9,#EFE0E3)",
  "linear-gradient(135deg,#E8F0EA,#DEEAE1)",
  "linear-gradient(135deg,#ECE7F4,#E2DAEF)",
  "linear-gradient(135deg,#F4EDE2,#EFE5D6)",
];
const itemGradient = (id: number) => GRADIENTS[id % GRADIENTS.length];

// ─── Quick-add preset chips (shown in NoteSheet) ──────────────────────────────
const QUICK_NOTES_ZH = ["少糖", "不要葱", "多加爱心 ♡", "去冰", "微辣"];

// ─── Root export ─────────────────────────────────────────────────────────────

export function OrderClient({
  tableCode,
  items,
  maids,
  initialBill,
  source = "qr",
}: {
  tableCode: string;
  items: MenuItem[];
  categories: Category[];
  maids: Maid[];
  initialBill: BillDetail | null;
  source?: "qr" | "staff";
}) {
  const t = useTranslations("customer");
  const [tab, setTab] = useState<"all" | "maid">("all");
  const [cart, setCart] = useState<CartLine[]>([]);

  // Which view is showing: "menu" | "cart" | "bill"
  // If there's an existing unpaid bill with items, show it immediately.
  const [view, setView] = useState<"menu" | "cart" | "bill">(
    initialBill && initialBill.items.length > 0 ? "bill" : "menu",
  );

  // Maid picker modal
  const [maidModalItem, setMaidModalItem] = useState<MenuItem | null>(null);

  // Note sheet
  const [noteTarget, setNoteTarget] = useState<CartLine | null>(null);

  // Submit states
  const [submitting, setSubmitting] = useState(false);
  const [placed, setPlaced] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Live bill polling
  const billFetcher = useCallback(
    () =>
      fetch(`/api/customer/${tableCode}/bill`).then((r) => {
        if (!r.ok) throw new Error("bill fetch failed");
        return r.json() as Promise<BillDetail | null>;
      }),
    [tableCode],
  );
  const { data: liveBill, hasFetched, refetch } = useLiveQuery<BillDetail | null>(billFetcher, {
    intervalMs: 8000,
  });
  const bill = hasFetched ? liveBill : initialBill;

  // Items split by tab
  const shown = useMemo(
    () =>
      items.filter((i) =>
        tab === "maid" ? i.item_type === "maid_service" : i.item_type !== "maid_service",
      ),
    [items, tab],
  );

  // Maid-service lines price by base + per-extra-maid surcharge (mirrors backend);
  // non-maid lines fall back to base price. maids.length = on-duty count for the cap.
  const maidNameById = useMemo(() => new Map(maids.map((m) => [m.id, m.name])), [maids]);
  const cartTotal = useMemo(
    () =>
      cart.reduce(
        (sum, l) =>
          sum +
          maidServiceUnitPrice(l.item, l.selectedMaidIds.length, maids.length) * l.quantity,
        0,
      ),
    [cart, maids.length],
  );
  const cartCount = useMemo(() => cart.reduce((n, l) => n + l.quantity, 0), [cart]);

  // ── Cart mutations ──────────────────────────────────────────────────────────

  function addItem(item: MenuItem, selectedMaidIds: number[] = []) {
    setPlaced(false);
    if (
      (item.item_type === "maid_service" || item.requires_maid_selection) &&
      selectedMaidIds.length === 0
    ) {
      setMaidModalItem(item);
      return;
    }
    setCart((prev) => {
      if (item.item_type !== "maid_service") {
        const existing = prev.find((l) => l.item.id === item.id);
        if (existing) {
          return prev.map((l) =>
            l.key === existing.key ? { ...l, quantity: l.quantity + 1 } : l,
          );
        }
      }
      return [...prev, { key: nextKey(), item, quantity: 1, selectedMaidIds, notes: "" }];
    });
  }

  function setQty(key: string, delta: number) {
    setCart((prev) =>
      prev
        .map((l) => (l.key === key ? { ...l, quantity: l.quantity + delta } : l))
        .filter((l) => l.quantity > 0),
    );
  }

  function saveNote(key: string, note: string) {
    setCart((prev) => prev.map((l) => (l.key === key ? { ...l, notes: note } : l)));
    setNoteTarget(null);
  }

  // ── Submit ──────────────────────────────────────────────────────────────────

  async function submit() {
    if (cart.length === 0 || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload: OrderPayload = {
        source,
        items: cart.map((l) => ({
          menu_item_id: l.item.id,
          quantity: l.quantity,
          notes: l.notes.trim() || null,
          selected_maid_ids: l.selectedMaidIds,
        })),
      };
      const res = await submitOrderAction(tableCode, payload);
      if (!res.ok) {
        setSubmitError(res.error);
        return;
      }
      setCart([]);
      setPlaced(true);
      setView("bill");
      refetch();
    } catch {
      setSubmitError(t("submitFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  // ── View routing ────────────────────────────────────────────────────────────

  if (view === "cart") {
    return (
      <>
        <CartView
          cart={cart}
          cartTotal={cartTotal}
          cartCount={cartCount}
          maidNameById={maidNameById}
          totalAvailableMaids={maids.length}
          onBack={() => setView("menu")}
          onSetQty={setQty}
          onOpenNote={(line) => setNoteTarget(line)}
          onSubmit={submit}
          submitting={submitting}
          placed={placed}
          submitError={submitError}
          t={t}
        />
        {noteTarget && (
          <NoteSheet
            line={noteTarget}
            onCancel={() => setNoteTarget(null)}
            onSave={(note) => saveNote(noteTarget.key, note)}
            t={t}
          />
        )}
      </>
    );
  }

  if (view === "bill") {
    return (
      <BillView
        bill={bill}
        onAddMore={() => setView("menu")}
        t={t}
      />
    );
  }

  // ── Menu view (default) ─────────────────────────────────────────────────────
  return (
    <div className="flex flex-col" style={{ gap: 0 }}>
      {/* Category tabs */}
      <div
        style={{
          display: "flex",
          gap: 20,
          padding: "0 0 0 0",
          borderBottom: "1px solid var(--line)",
          fontSize: 13.5,
          marginBottom: 0,
        }}
      >
        {(["all", "maid"] as const).map((k) => {
          const active = tab === k;
          return (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              style={{
                fontWeight: active ? 700 : 400,
                color: active ? "var(--foreground)" : (k === "maid" ? "var(--maid)" : "var(--muted-2)"),
                paddingBottom: 11,
                background: "none",
                border: "none",
                borderBottom: active ? "2px solid var(--brand)" : "2px solid transparent",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontFamily: active ? "var(--font-display-stack)" : undefined,
              }}
            >
              {k === "maid" && (
                <svg width={12} height={12} viewBox="0 0 24 24" aria-hidden>
                  <path
                    d="M12 20s-7-4.6-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.4-7 10-7 10Z"
                    fill="var(--maid)"
                  />
                </svg>
              )}
              {k === "all" ? t("all") : t("maidService")}
            </button>
          );
        })}
      </div>

      {/* Menu items */}
      {shown.length === 0 ? (
        <div style={{ marginTop: 24 }}>
          <StateCard variant="empty" title={t("empty")} hint={t("noSessionHint")} />
        </div>
      ) : (
        // LAYOUT B — single-column large-image feature list (all tabs)
        <ul style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 16, listStyle: "none", padding: 0, margin: "16px 0 0" }}>
          {shown.map((item, i) => (
            <MaidServiceCard key={item.id} item={item} index={i} onAdd={() => addItem(item)} t={t} />
          ))}
        </ul>
      )}

      {/* Cart bar at bottom */}
      {cart.length > 0 && (
        <button
          type="button"
          onClick={() => setView("cart")}
          style={{
            position: "sticky",
            bottom: 12,
            marginTop: 16,
            padding: "13px 16px",
            background: "var(--foreground)",
            borderRadius: 18,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            boxShadow: "0 12px 26px -10px rgba(58,42,48,0.6)",
            border: "none",
            cursor: "pointer",
            width: "100%",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--background)" }}>
            <span style={{ position: "relative" }}>
              <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="var(--background)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M6 7h13l-1.4 8.4a2 2 0 0 1-2 1.6H9.4a2 2 0 0 1-2-1.6L6 5H3.5" />
              </svg>
              <span
                style={{
                  position: "absolute",
                  top: -6,
                  right: -7,
                  background: "var(--brand)",
                  color: "#fff",
                  fontSize: 9,
                  fontWeight: 700,
                  width: 15,
                  height: 15,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "var(--font-num-stack)",
                }}
              >
                {cartCount}
              </span>
            </span>
            <span style={{ fontSize: 13, fontWeight: 500 }}>{t("cart")}</span>
          </div>
          <span
            style={{
              fontFamily: "var(--font-num-stack)",
              fontWeight: 700,
              fontSize: 16,
              color: "var(--background)",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {formatUSD(cartTotal)}
            <svg width={16} height={16} viewBox="0 0 24 24" stroke="var(--brand-soft)" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m9 6 6 6-6 6" />
            </svg>
          </span>
        </button>
      )}

      {/* Maid picker modal */}
      {maidModalItem && (
        <MaidPicker
          item={maidModalItem}
          maids={maids}
          onCancel={() => setMaidModalItem(null)}
          onConfirm={(ids) => {
            const item = maidModalItem;
            setMaidModalItem(null);
            addItem(item, ids);
          }}
          t={t}
        />
      )}
    </div>
  );
}

// ─── LAYOUT A: Menu grid card ────────────────────────────────────────────────

// (Menu grid card removed — all menu tabs now use single-column layout B / MaidServiceCard.)

// ─── LAYOUT B: Maid service feature card ─────────────────────────────────────

function MaidServiceCard({
  item,
  index,
  onAdd,
  t,
}: {
  item: MenuItem;
  index: number;
  onAdd: () => void;
  t: ReturnType<typeof useTranslations<"customer">>;
}) {
  const grad = itemGradient(item.id);
  const isHero = index === 0;
  const accent = item.item_type === "maid_service" ? "var(--maid)" : "var(--brand)";

  return (
    <li
      style={{
        borderRadius: 20,
        overflow: "hidden",
        background: "#fff",
        border: "1px solid rgba(58,42,48,0.05)",
        boxShadow: "0 10px 26px -12px rgba(58,42,48,0.22)",
        ...(isHero ? {} : { display: "flex" }),
      }}
    >
      {isHero ? (
        // Tall hero card
        <>
          <div
            style={{
              height: 158,
              background: item.image_url ? undefined : grad,
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {item.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.image_url} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : null}
            {item.item_type === "maid_service" && (
              <span
                style={{
                  position: "absolute",
                  top: 11,
                  left: 11,
                  background: "rgba(142,134,201,0.92)",
                  color: "#fff",
                  fontSize: 10,
                  fontWeight: 600,
                  padding: "4px 9px",
                  borderRadius: 999,
                  backdropFilter: "blur(4px)",
                }}
              >
                女仆服务
              </span>
            )}
          </div>
          <div style={{ padding: "13px 15px", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, fontFamily: "var(--font-display-stack)" }}>{item.name}</div>
              {item.description && (
                <div style={{ fontSize: 11.5, color: "var(--muted-2)", marginTop: 2 }}>{item.description}</div>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 11, flexShrink: 0, marginLeft: 12 }}>
              <span className="num" style={{ fontWeight: 700, fontSize: 17, color: accent }}>
                {formatUSD(item.price)}
              </span>
              <button
                type="button"
                onClick={onAdd}
                aria-label={t("add")}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 11,
                  background: accent,
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "none",
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                <svg width={17} height={17} viewBox="0 0 24 24" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
            </div>
          </div>
        </>
      ) : (
        // Horizontal compact card
        <>
          <div
            style={{
              width: 118,
              flexShrink: 0,
              background: item.image_url ? undefined : grad,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
            }}
          >
            {item.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.image_url} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            )}
          </div>
          <div style={{ flex: 1, padding: "14px 15px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, fontFamily: "var(--font-display-stack)" }}>{item.name}</div>
              {item.description && (
                <div style={{ fontSize: 11, color: "var(--muted-2)", marginTop: 2 }}>{item.description}</div>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0, marginLeft: 10 }}>
              <span className="num" style={{ fontWeight: 700, fontSize: 16, color: accent }}>
                {formatUSD(item.price)}
              </span>
              <button
                type="button"
                onClick={onAdd}
                aria-label={t("add")}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  background: accent,
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "none",
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                <svg width={16} height={16} viewBox="0 0 24 24" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
            </div>
          </div>
        </>
      )}
    </li>
  );
}

// ─── Cart view ────────────────────────────────────────────────────────────────

function CartView({
  cart,
  cartTotal,
  cartCount,
  maidNameById,
  totalAvailableMaids,
  onBack,
  onSetQty,
  onOpenNote,
  onSubmit,
  submitting,
  placed,
  submitError,
  t,
}: {
  cart: CartLine[];
  cartTotal: number;
  cartCount: number;
  maidNameById: Map<number, string>;
  totalAvailableMaids: number;
  onBack: () => void;
  onSetQty: (key: string, delta: number) => void;
  onOpenNote: (line: CartLine) => void;
  onSubmit: () => void;
  submitting: boolean;
  placed: boolean;
  submitError: string | null;
  t: ReturnType<typeof useTranslations<"customer">>;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      {/* Header */}
      <div style={{ padding: "6px 0 14px", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h2
          style={{
            fontFamily: "var(--font-display-stack)",
            fontWeight: 700,
            fontSize: 24,
            color: "var(--foreground)",
            margin: 0,
          }}
        >
          {t("cart")}
        </h2>
        <span style={{ fontSize: 12, color: "var(--muted-2)" }}>
          {t("items", { count: cartCount })}
        </span>
      </div>

      {/* Cart lines */}
      {cart.length === 0 ? (
        <StateCard variant="empty" title={t("empty")} hint={t("noSessionHint")} style={{ marginBottom: 16 }} />
      ) : (
        <ul style={{ display: "flex", flexDirection: "column", gap: 12, listStyle: "none", padding: 0, margin: "0 0 12px" }}>
          {cart.map((line) => {
            const isMaid = line.item.item_type === "maid_service";
            const grad = itemGradient(line.item.id);
            return (
              <li
                key={line.key}
                style={{
                  background: "#fff",
                  border: isMaid ? "1px solid rgba(142,134,201,0.25)" : "1px solid rgba(58,42,48,0.05)",
                  borderRadius: 18,
                  padding: 13,
                  boxShadow: isMaid
                    ? "0 6px 16px -10px rgba(142,134,201,0.3)"
                    : "0 6px 16px -10px rgba(58,42,48,0.18)",
                }}
              >
                {/* Top row: thumb + name + price */}
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <div
                    style={{
                      width: 54,
                      height: 54,
                      borderRadius: 13,
                      flexShrink: 0,
                      background: grad,
                      overflow: "hidden",
                    }}
                  >
                    {line.item.image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={line.item.image_url} alt={line.item.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: 14,
                        fontFamily: "var(--font-display-stack)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {line.item.name}
                    </div>
                    {isMaid && line.selectedMaidIds.length > 0 ? (
                      <div style={{ fontSize: 11, color: "var(--maid)", fontWeight: 500, marginTop: 1 }}>
                        ♡{" "}
                        {line.selectedMaidIds
                          .map((id) => maidNameById.get(id))
                          .filter(Boolean)
                          .join(", ") ||
                          t("maidSelected", { count: line.selectedMaidIds.length })}
                      </div>
                    ) : (
                      <div style={{ fontSize: 11, color: "var(--muted-2)", marginTop: 1 }}>
                        {formatUSD(line.item.price)} · ×{line.quantity}
                      </div>
                    )}
                  </div>
                  <span
                    className="num"
                    style={{
                      fontWeight: 700,
                      fontSize: 15,
                      color: isMaid ? "var(--maid)" : "var(--foreground)",
                      flexShrink: 0,
                    }}
                  >
                    {formatUSD(
                      maidServiceUnitPrice(
                        line.item,
                        line.selectedMaidIds.length,
                        totalAvailableMaids,
                      ) * line.quantity,
                    )}
                  </span>
                </div>

                {/* Second row: qty stepper + note button (non-maid items) */}
                {!isMaid && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 11 }}>
                    {/* Qty stepper */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        border: "1px solid rgba(58,42,48,0.12)",
                        borderRadius: 10,
                        overflow: "hidden",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => onSetQty(line.key, -1)}
                        style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", color: "var(--muted)" }}
                        aria-label="Decrease quantity"
                      >
                        <svg width={14} height={14} viewBox="0 0 24 24" stroke="var(--muted)" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
                          <path d="M5 12h14" />
                        </svg>
                      </button>
                      <span
                        className="num"
                        style={{ width: 30, textAlign: "center", fontWeight: 600, fontSize: 14 }}
                      >
                        {line.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => onSetQty(line.key, 1)}
                        style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--foreground)", border: "none", cursor: "pointer", color: "#fff" }}
                        aria-label="Increase quantity"
                      >
                        <svg width={14} height={14} viewBox="0 0 24 24" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                      </button>
                    </div>

                    {/* Note button */}
                    <button
                      type="button"
                      onClick={() => onOpenNote(line)}
                      style={{
                        fontSize: 11,
                        color: "var(--brand)",
                        fontWeight: 600,
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: "4px 0",
                      }}
                    >
                      <svg width={13} height={13} viewBox="0 0 24 24" stroke="var(--brand)" strokeWidth="2" fill="none" strokeLinecap="round" aria-hidden>
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                      {t("note")}
                    </button>
                  </div>
                )}

                {/* Saved note display */}
                {line.notes && (
                  <div
                    style={{
                      marginTop: 9,
                      background: "var(--background)",
                      border: "1px dashed rgba(58,42,48,0.14)",
                      borderRadius: 10,
                      padding: "8px 11px",
                      fontSize: 11,
                      color: "var(--muted)",
                    }}
                  >
                    {line.notes}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Totals */}
      <div
        style={{
          background: "#fff",
          borderTop: "1px solid rgba(58,42,48,0.07)",
          padding: "16px 0 6px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--muted)", marginBottom: 7 }}>
          <span>{t("subtotal")}</span>
          <span className="num" style={{ fontWeight: 600, color: "var(--foreground)" }}>{formatUSD(cartTotal)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--muted-2)", marginBottom: 7 }}>
          <span>{t("taxLine")}</span>
          <span className="num">$0.00</span>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            borderTop: "1px dashed rgba(58,42,48,0.14)",
            paddingTop: 11,
          }}
        >
          <span style={{ fontFamily: "var(--font-display-stack)", fontWeight: 700, fontSize: 17 }}>{t("total")}</span>
          <span className="num" style={{ fontWeight: 700, fontSize: 22, color: "var(--brand)" }}>{formatUSD(cartTotal)}</span>
        </div>
      </div>

      {/* Submit CTA */}
      <button
        type="button"
        onClick={onSubmit}
        disabled={cart.length === 0 || submitting}
        style={{
          marginTop: 12,
          padding: "15px",
          background: cart.length === 0 ? "var(--muted-2)" : "var(--brand)",
          borderRadius: 18,
          textAlign: "center",
          color: "#fff",
          fontFamily: "var(--font-display-stack)",
          fontWeight: 700,
          fontSize: 16,
          boxShadow: cart.length === 0 ? "none" : "0 14px 28px -12px rgba(201,72,106,0.8)",
          border: "none",
          cursor: cart.length === 0 ? "default" : "pointer",
          width: "100%",
          opacity: submitting ? 0.7 : 1,
          transition: "opacity 0.15s",
        }}
      >
        {submitting ? t("loading") : t("placeOrder")}
      </button>

      {submitError && (
        <div role="alert" style={{ marginTop: 10, textAlign: "center", fontSize: 12, color: "var(--brand)" }}>
          {submitError}
        </div>
      )}

      {placed && (
        <div style={{ marginTop: 10, textAlign: "center", fontSize: 12, fontWeight: 500, color: "var(--ready)" }}>
          {t("orderPlaced")} — {t("orderPlacedHint")}
        </div>
      )}

      {/* Back link */}
      <button
        type="button"
        onClick={onBack}
        style={{
          marginTop: 10,
          padding: "14px",
          border: "1.5px solid rgba(58,42,48,0.14)",
          borderRadius: 18,
          textAlign: "center",
          color: "var(--foreground)",
          fontWeight: 600,
          fontSize: 14,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          background: "none",
          cursor: "pointer",
          width: "100%",
        }}
      >
        <svg width={16} height={16} viewBox="0 0 24 24" stroke="var(--foreground)" strokeWidth="2" fill="none" strokeLinecap="round" aria-hidden>
          <path d="m15 6-6 6 6 6" />
        </svg>
        {t("addMore")}
      </button>
    </div>
  );
}

// ─── Bill + status view ───────────────────────────────────────────────────────

function BillView({
  bill,
  onAddMore,
  t,
}: {
  bill: BillDetail | null;
  onAddMore: () => void;
  t: ReturnType<typeof useTranslations<"customer">>;
}) {
  // Bill is null after polling — means it was paid/closed; show thank-you state.
  if (bill === null) {
    return (
      <div style={{ paddingTop: 40, textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>✓</div>
        <StateCard variant="empty" title={t("billPaid")} hint={t("billPaidHint")} />
      </div>
    );
  }

  if (bill.items.length === 0) {
    return (
      <div style={{ paddingTop: 24 }}>
        <StateCard variant="empty" title={t("currentBill")} hint={t("noSessionHint")} />
        <button
          type="button"
          onClick={onAddMore}
          style={{
            marginTop: 16,
            padding: "14px",
            border: "1.5px solid rgba(58,42,48,0.14)",
            borderRadius: 18,
            textAlign: "center",
            color: "var(--foreground)",
            fontWeight: 600,
            fontSize: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            background: "none",
            cursor: "pointer",
            width: "100%",
          }}
        >
          <svg width={16} height={16} viewBox="0 0 24 24" stroke="var(--foreground)" strokeWidth="2" fill="none" strokeLinecap="round" aria-hidden>
            <path d="M12 5v14M5 12h14" />
          </svg>
          {t("addMore")}
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ padding: "6px 0 16px" }}>
        <h2 style={{ fontFamily: "var(--font-display-stack)", fontWeight: 700, fontSize: 24, margin: 0 }}>
          {t("currentBill")}
        </h2>
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: "var(--ready)", marginTop: 4 }}>
          <LiveDot color="var(--ready)" size={7} />
          {t("live")}
        </div>
      </div>

      {/* Bill lines */}
      <ul style={{ display: "flex", flexDirection: "column", gap: 11, listStyle: "none", padding: 0, margin: "0 0 12px" }}>
        {bill.items.map((bi) => (
          <BillItemRow key={bi.order_item_id} item={bi} t={t} />
        ))}
      </ul>

      {/* Totals */}
      <div style={{ background: "#fff", borderTop: "1px solid rgba(58,42,48,0.07)", padding: "16px 0 6px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--muted)", marginBottom: 9 }}>
          <span>{t("subtotal")}</span>
          <span className="num" style={{ fontWeight: 600, color: "var(--foreground)" }}>{formatUSD(bill.subtotal)}</span>
        </div>
        {bill.discount_type !== "none" && (
          <div
            style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--maid)", marginBottom: 9 }}
            data-testid="customer-discount-row"
          >
            <span>
              {t("discount")}
              {bill.discount_note ? ` · ${bill.discount_note}` : ""}
            </span>
            <span className="num" style={{ fontWeight: 600 }}>−{formatUSD(bill.discount_amount)}</span>
          </div>
        )}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            borderTop: "1px dashed rgba(58,42,48,0.14)",
            paddingTop: 11,
          }}
        >
          <span style={{ fontFamily: "var(--font-display-stack)", fontWeight: 700, fontSize: 17 }}>{t("total")}</span>
          <span className="num" style={{ fontWeight: 700, fontSize: 22, color: "var(--brand)" }}>{formatUSD(bill.total)}</span>
        </div>
      </div>

      {/* Add more */}
      <button
        type="button"
        onClick={onAddMore}
        style={{
          marginTop: 12,
          padding: "14px",
          border: "1.5px solid rgba(58,42,48,0.14)",
          borderRadius: 18,
          textAlign: "center",
          color: "var(--foreground)",
          fontWeight: 600,
          fontSize: 14,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          background: "none",
          cursor: "pointer",
          width: "100%",
        }}
      >
        <svg width={16} height={16} viewBox="0 0 24 24" stroke="var(--foreground)" strokeWidth="2" fill="none" strokeLinecap="round" aria-hidden>
          <path d="M12 5v14M5 12h14" />
        </svg>
        {t("addMore")}
      </button>
    </div>
  );
}

// ─── Bill item row with production status ─────────────────────────────────────

function BillItemRow({
  item,
  t,
}: {
  item: BillItem;
  t: ReturnType<typeof useTranslations<"customer">>;
}) {
  const grad = itemGradient(item.menu_item_id);
  const isMaid = item.item_type === "maid_service";

  return (
    <li
      style={{
        background: "#fff",
        border: "1px solid rgba(58,42,48,0.05)",
        borderRadius: 18,
        padding: "13px 14px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        boxShadow: "0 6px 16px -10px rgba(58,42,48,0.16)",
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          background: grad,
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: 700,
            fontSize: 13.5,
            fontFamily: "var(--font-display-stack)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {item.menu_item_name}{" "}
          <span style={{ color: "var(--muted-2)", fontWeight: 500 }}>×{item.quantity}</span>
        </div>
        {isMaid && item.selected_maids.length > 0 ? (
          <div style={{ fontSize: 11, color: "var(--maid)", marginTop: 1 }}>
            {item.selected_maids.map((m) => m.maid_name).join("、")}
          </div>
        ) : (
          <div className="num" style={{ fontSize: 11, color: "var(--muted-2)" }}>
            {formatUSD(item.unit_price)}
          </div>
        )}
      </div>
      <ProductionStatusBadge status={item.production_status} t={t} />
    </li>
  );
}

// ─── Production status badge ──────────────────────────────────────────────────

function ProductionStatusBadge({
  status,
  t,
}: {
  status: ProductionStatus | null;
  t: ReturnType<typeof useTranslations<"customer">>;
}) {
  if (!status) return null;

  const styles: Record<ProductionStatus, { bg: string; color: string; dot?: string; icon?: "check" }> = {
    pending: { bg: "#EDEBF6", color: "#6E66A8" },
    preparing: { bg: "#FAEFDD", color: "#B57E2E", dot: "#D69A4E" },
    completed: { bg: "#E6F1EA", color: "#3F8763", icon: "check" },
  };

  const label: Record<ProductionStatus, string> = {
    pending: t("statusPending"),
    preparing: t("statusPreparing"),
    completed: t("statusCompleted"),
  };

  const s = styles[status];

  return (
    <span
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        background: s.bg,
        color: s.color,
        fontSize: 11,
        fontWeight: 600,
        padding: "6px 11px",
        borderRadius: 999,
        flexShrink: 0,
      }}
    >
      {s.dot && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: s.dot,
            animation: "liveDot 1.2s ease-in-out infinite",
            flexShrink: 0,
          }}
        />
      )}
      {s.icon === "check" && (
        <svg width={12} height={12} viewBox="0 0 24 24" stroke={s.color} strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m5 12 5 5L20 7" />
        </svg>
      )}
      {label[status]}
    </span>
  );
}

// ─── Maid picker modal ────────────────────────────────────────────────────────

function MaidPicker({
  item,
  maids,
  onCancel,
  onConfirm,
  t,
}: {
  item: MenuItem;
  maids: Maid[];
  onCancel: () => void;
  onConfirm: (ids: number[]) => void;
  t: ReturnType<typeof useTranslations<"customer">>;
}) {
  const [selected, setSelected] = useState<number[]>([]);
  const toggle = (id: number) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const selectAll = () => setSelected(maids.map((m) => m.id));

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        background: "var(--background)",
      }}
    >
      {/* Gradient header */}
      <div style={{ background: "linear-gradient(150deg,#8E86C9,#736BB3)", paddingBottom: 16 }}>
        {/* Fake status bar */}
        <div style={{ height: 42, display: "flex", alignItems: "flex-end", justifyContent: "space-between", padding: "0 24px 7px", fontSize: 12, fontWeight: 600, color: "#fff" }}>
          <span className="num">9:41</span>
        </div>
        {/* Back + title */}
        <div style={{ padding: "4px 22px 0", color: "#fff" }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13,
              opacity: 0.9,
              background: "none",
              border: "none",
              color: "#fff",
              cursor: "pointer",
              padding: 0,
            }}
          >
            <svg width={16} height={16} viewBox="0 0 24 24" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m15 6-6 6 6 6" />
            </svg>
            {t("back")}
          </button>
          <div style={{ fontFamily: "var(--font-display-stack)", fontWeight: 700, fontSize: 23, marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
            {item.name}
            <svg width={18} height={18} viewBox="0 0 24 24" aria-hidden>
              <path d="M12 20s-7-4.6-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.4-7 10-7 10Z" fill="#fff" />
            </svg>
          </div>
          <div style={{ fontSize: 12, opacity: 0.9, marginTop: 2 }}>{t("maidRequired")}</div>
        </div>
      </div>

      {/* On-duty header row */}
      <div style={{ padding: "10px 22px 8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>
          {t("onDuty")}{" "}
          <span style={{ color: "var(--muted-2)", fontWeight: 500, fontSize: 12 }}>
            · {maids.length}
          </span>
        </span>
        <button
          type="button"
          onClick={selectAll}
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "var(--maid)",
            border: "1px solid #D6D1EC",
            borderRadius: 999,
            padding: "5px 12px",
            background: "none",
            cursor: "pointer",
          }}
        >
          {t("selectAll")}
        </button>
      </div>

      {/* Maid grid */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: "4px 22px 0",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          alignContent: "start",
        }}
      >
        {maids.map((m) => {
          const on = selected.includes(m.id);
          const grad = itemGradient(m.id);
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => toggle(m.id)}
              style={{
                background: "#fff",
                borderRadius: 16,
                overflow: "hidden",
                border: on ? "2px solid var(--maid)" : "1px solid rgba(58,42,48,0.06)",
                boxShadow: on ? "0 8px 20px -10px rgba(142,134,201,0.5)" : "none",
                position: "relative",
                textAlign: "left",
                cursor: "pointer",
                padding: 0,
              }}
            >
              {/* Photo area */}
              <div style={{ height: 112, background: m.photoUrl ? undefined : grad, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {m.photoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.photoUrl} alt={m.name} style={{ width: "100%", height: 220, objectFit: "contain" }} />
                )}
              </div>
              {/* Check indicator */}
              <div
                style={{
                  position: "absolute",
                  top: 8,
                  right: 8,
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  background: on ? "var(--maid)" : "rgba(255,255,255,0.7)",
                  border: on ? "none" : "1.5px solid #D8CBD0",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {on && (
                  <svg width={14} height={14} viewBox="0 0 24 24" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="m5 12 5 5L20 7" />
                  </svg>
                )}
              </div>
              {/* Name */}
              <div style={{ padding: "8px 10px 10px" }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: "var(--foreground)" }}>{m.name}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Confirm CTA */}
      <div style={{ padding: "10px 14px 14px" }}>
        <button
          type="button"
          disabled={selected.length === 0}
          onClick={() => onConfirm(selected)}
          style={{
            width: "100%",
            padding: 14,
            background: selected.length === 0 ? "var(--muted-2)" : "var(--maid)",
            borderRadius: 16,
            textAlign: "center",
            color: "#fff",
            fontWeight: 700,
            fontSize: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            boxShadow: selected.length === 0 ? "none" : "0 12px 24px -10px rgba(142,134,201,0.7)",
            border: "none",
            cursor: selected.length === 0 ? "default" : "pointer",
          }}
        >
          {t("add")}
          {selected.length > 0 && (
            <span className="num"> · {formatUSD(maidServiceUnitPrice(item, selected.length, maids.length))}</span>
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Note sheet (bottom sheet) ────────────────────────────────────────────────

function NoteSheet({
  line,
  onCancel,
  onSave,
  t,
}: {
  line: CartLine;
  onCancel: () => void;
  onSave: (note: string) => void;
  t: ReturnType<typeof useTranslations<"customer">>;
}) {
  const [text, setText] = useState(line.notes);
  // locale detection via Intl — use zh quick notes if first quick note is Chinese
  const quickNotes = QUICK_NOTES_ZH; // will show zh; if user is EN they map to same concepts

  function toggleQuick(chip: string) {
    setText((prev) => {
      const already = prev.includes(chip);
      if (already) {
        return prev.replace(chip, "").replace(/[·,，]\s*/g, "").trim();
      }
      return prev ? `${prev} · ${chip}` : chip;
    });
  }

  return (
    // Backdrop
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(35,25,29,0.5)",
        backdropFilter: "blur(2px)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
      }}
      onClick={onCancel}
    >
      {/* Sheet */}
      <div
        style={{
          background: "#fff",
          borderRadius: "26px 26px 0 0",
          padding: "20px 20px 34px",
          boxShadow: "0 -16px 40px -16px rgba(58,42,48,0.4)",
          maxWidth: 480,
          width: "100%",
          margin: "0 auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div style={{ width: 40, height: 4, borderRadius: 999, background: "rgba(58,42,48,0.18)", margin: "0 auto 16px" }} />

        {/* Item info */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 13,
              background: itemGradient(line.item.id),
              flexShrink: 0,
              overflow: "hidden",
            }}
          >
            {line.item.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={line.item.image_url} alt={line.item.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            )}
          </div>
          <div>
            <div style={{ fontFamily: "var(--font-display-stack)", fontWeight: 700, fontSize: 16 }}>{line.item.name}</div>
            <div style={{ fontSize: 12, color: "var(--muted-2)" }}>{t("noteHint")}</div>
          </div>
        </div>

        {/* Quick chips */}
        <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600, marginBottom: 9 }}>{t("quickAdd")}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          {quickNotes.map((chip) => {
            const active = text.includes(chip);
            return (
              <button
                key={chip}
                type="button"
                onClick={() => toggleQuick(chip)}
                style={{
                  fontSize: 13,
                  fontWeight: active ? 600 : 500,
                  color: active ? "#fff" : "var(--muted)",
                  background: active ? "var(--brand)" : "none",
                  border: active ? "none" : "1.5px solid rgba(58,42,48,0.14)",
                  padding: "8px 14px",
                  borderRadius: 999,
                  cursor: "pointer",
                }}
              >
                {chip}
              </button>
            );
          })}
        </div>

        {/* Free-text input */}
        <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600, marginBottom: 9 }}>{t("other")}</div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("notePlaceholder")}
          rows={3}
          style={{
            width: "100%",
            border: "1.5px solid rgba(58,42,48,0.14)",
            borderRadius: 14,
            padding: "13px 15px",
            fontSize: 13,
            color: "var(--foreground)",
            background: "var(--background)",
            resize: "none",
            fontFamily: "var(--font-body-stack)",
            outline: "none",
            boxSizing: "border-box",
          }}
        />

        {/* Buttons */}
        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              flex: 1,
              border: "1.5px solid rgba(58,42,48,0.14)",
              color: "var(--muted)",
              textAlign: "center",
              borderRadius: 14,
              padding: 14,
              fontWeight: 600,
              fontSize: 14,
              background: "none",
              cursor: "pointer",
            }}
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            onClick={() => onSave(text)}
            style={{
              flex: 2,
              background: "var(--brand)",
              color: "#fff",
              textAlign: "center",
              borderRadius: 14,
              padding: 14,
              fontFamily: "var(--font-display-stack)",
              fontWeight: 700,
              fontSize: 15,
              boxShadow: "0 12px 24px -12px rgba(201,72,106,0.8)",
              border: "none",
              cursor: "pointer",
            }}
          >
            {t("saveNote")}
          </button>
        </div>
      </div>
    </div>
  );
}

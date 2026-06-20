"use client";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition, useState } from "react";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import {
  createMaidServicePricing,
  updateMaidServicePricing,
  deleteMaidServicePricing,
} from "@/lib/server/actions/admin";
import { formatUSD } from "@/lib/money";
import {
  adminCard,
  adminInput,
  adminLabel,
  btnPrimary,
  btnPrimaryDisabled,
  btnSecondary,
  btnDanger,
  pageTitle,
  pageSubtitle,
  errorBanner,
} from "@/components/admin/adminStyles";
import type { MaidServicePricing, MenuItemAdmin, MaidServicePricingCreate, MaidServicePricingUpdate } from "@/lib/types";

interface PricingFormProps {
  initial?: MaidServicePricing;
  maidItems: MenuItemAdmin[];
  existingItemIds: Set<number>;
  onDone: (pricing: MaidServicePricing) => void;
  onCancel: () => void;
}

function PricingForm({ initial, maidItems, existingItemIds, onDone, onCancel }: PricingFormProps) {
  const t = useTranslations("admin");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const availableItems = initial
    ? maidItems.filter((i) => i.id === initial.menu_item_id || !existingItemIds.has(i.id))
    : maidItems.filter((i) => !existingItemIds.has(i.id));

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const additional_maid_price = (fd.get("additional_maid_price") as string).trim() || "0";
    const all_maids_price_raw = (fd.get("all_maids_price") as string).trim();
    const all_maids_price = all_maids_price_raw || null;

    startTransition(async () => {
      if (initial) {
        const body: MaidServicePricingUpdate = { additional_maid_price, all_maids_price };
        const result = await updateMaidServicePricing(initial.id, body);
        if (!result.ok) { setError(result.error); return; }
        onDone(result.data);
      } else {
        const menu_item_id = parseInt((fd.get("menu_item_id") as string), 10);
        const body: MaidServicePricingCreate = { menu_item_id, additional_maid_price, all_maids_price };
        const result = await createMaidServicePricing(body);
        if (!result.ok) { setError(result.error); return; }
        onDone(result.data);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
      <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--foreground)", fontFamily: "var(--font-display-stack)" }}>
        {initial ? t("maidPricing.editPricing") : t("maidPricing.newPricing")}
      </h3>
      {error ? <div style={errorBanner}>{error}</div> : null}
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
        {!initial ? (
          <div style={{ gridColumn: "1 / -1" }}>
            <label htmlFor="mp-item" style={adminLabel}>{t("maidPricing.fields.menuItem")}</label>
            <select id="mp-item" name="menu_item_id" required style={{ ...adminInput, paddingRight: 36 }} disabled={pending}>
              <option value="">— Select item —</option>
              {availableItems.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
            {availableItems.length === 0 ? (
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--muted)" }}>
                {t("maidPricing.allItemsHavePricing")}
              </p>
            ) : null}
          </div>
        ) : (
          <div style={{ gridColumn: "1 / -1" }}>
            <span style={adminLabel}>{t("maidPricing.fields.menuItem")}</span>
            <div style={{ fontSize: 14, color: "var(--foreground)", fontWeight: 700 }}>
              {maidItems.find((i) => i.id === initial.menu_item_id)?.name ?? `#${initial.menu_item_id}`}
            </div>
          </div>
        )}
        <div>
          <label htmlFor="mp-addl" style={adminLabel}>{t("maidPricing.fields.additionalMaidPrice")}</label>
          <input id="mp-addl" name="additional_maid_price" type="number" step="0.01" min="0" defaultValue={initial?.additional_maid_price ?? "0"} style={adminInput} disabled={pending} />
        </div>
        <div>
          <label htmlFor="mp-allmaids" style={adminLabel}>{t("maidPricing.fields.allMaidsPrice")}</label>
          <input id="mp-allmaids" name="all_maids_price" type="number" step="0.01" min="0" defaultValue={initial?.all_maids_price ?? ""} placeholder={t("maidPricing.optional")} style={adminInput} disabled={pending} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingTop: 4 }}>
        <button type="button" onClick={onCancel} disabled={pending} style={btnSecondary}>
          {t("maidPricing.cancel")}
        </button>
        <button type="submit" disabled={pending} style={pending ? btnPrimaryDisabled : btnPrimary}>
          {pending ? t("maidPricing.saving") : t("maidPricing.save")}
        </button>
      </div>
    </form>
  );
}

interface MaidPricingClientProps {
  initialPricing: MaidServicePricing[];
  maidItems: MenuItemAdmin[];
  allItems: MenuItemAdmin[];
}

export function MaidPricingClient({ initialPricing, maidItems }: MaidPricingClientProps) {
  const t = useTranslations("admin");
  const router = useRouter();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [showForm, setShowForm] = useState(false);
  const [editingPricing, setEditingPricing] = useState<MaidServicePricing | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [items, setItems] = useState<MaidServicePricing[]>(initialPricing);

  function upsertPricing(list: MaidServicePricing[], pricing: MaidServicePricing): MaidServicePricing[] {
    const idx = list.findIndex((p) => p.id === pricing.id);
    if (idx === -1) return [pricing, ...list];
    return list.map((p) => (p.id === pricing.id ? pricing : p));
  }

  const existingItemIds = new Set(items.map((p) => p.menu_item_id));
  const [, startTransition] = useTransition();

  async function handleDelete(pricing: MaidServicePricing) {
    const item = maidItems.find((i) => i.id === pricing.menu_item_id);
    if (!await confirm({
      title: t("maidPricing.confirmDeleteTitle", { name: item?.name ?? `#${pricing.menu_item_id}` }),
      description: t("maidPricing.confirmDeleteDesc"),
    })) return;
    setActionError(null);
    setBusyId(pricing.id);
    setItems((prev) => prev.filter((p) => p.id !== pricing.id));
    startTransition(async () => {
      const result = await deleteMaidServicePricing(pricing.id);
      setBusyId(null);
      if (!result.ok) {
        setActionError(result.error);
        setItems((prev) => [...prev, pricing]);
      }
      if (editingPricing?.id === pricing.id) setEditingPricing(null);
      router.refresh();
    });
  }

  return (
    <>
    {confirmDialog}
    <div style={{ display: "grid", gap: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
        <div>
          <h1 style={pageTitle}>{t("maidPricing.title")}</h1>
          <p style={pageSubtitle}>{t("maidPricing.subtitle")}</p>
        </div>
        {!showForm && !editingPricing ? (
          <button type="button" onClick={() => setShowForm(true)} style={btnPrimary}>
            ＋ {t("maidPricing.newPricing")}
          </button>
        ) : null}
      </div>

      {actionError ? <div style={errorBanner}>{actionError}</div> : null}

      {showForm ? (
        <div style={adminCard}>
          <PricingForm
            maidItems={maidItems}
            existingItemIds={existingItemIds}
            onDone={(pricing) => {
              setItems((prev) => upsertPricing(prev, pricing));
              setShowForm(false);
              router.refresh();
            }}
            onCancel={() => setShowForm(false)}
          />
        </div>
      ) : null}

      {editingPricing ? (
        <div style={adminCard}>
          <PricingForm
            initial={editingPricing}
            maidItems={maidItems}
            existingItemIds={existingItemIds}
            onDone={(pricing) => {
              setItems((prev) => upsertPricing(prev, pricing));
              setEditingPricing(null);
              router.refresh();
            }}
            onCancel={() => setEditingPricing(null)}
          />
        </div>
      ) : null}

      {items.length === 0 ? (
        <div style={adminCard}>{t("maidPricing.noPricing")}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {items.map((pricing) => {
            const busy = busyId === pricing.id;
            const item = maidItems.find((i) => i.id === pricing.menu_item_id);
            return (
              <article key={pricing.id} style={{ background: "var(--background)", border: "1px solid var(--line)", borderRadius: 14, padding: "15px 18px" }}>
                {/* Header */}
                <div style={{ fontWeight: 700, fontSize: 15.5, color: "var(--foreground)", marginBottom: 10 }}>
                  {item?.name ?? `Menu Item #${pricing.menu_item_id}`}
                </div>

                {/* Pricing breakdown cards — mirrors design spec sub-cards */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 14 }}>
                  <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, padding: "12px 14px" }}>
                    <div style={{ fontSize: 11, color: "var(--muted-2)", marginBottom: 4 }}>{t("maidPricing.fields.additionalMaidPrice")}</div>
                    <div className="num" style={{ fontSize: 22, fontWeight: 700, color: "var(--brand)" }}>{formatUSD(pricing.additional_maid_price)}</div>
                  </div>
                  {pricing.all_maids_price ? (
                    <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, padding: "12px 14px" }}>
                      <div style={{ fontSize: 11, color: "var(--muted-2)", marginBottom: 4 }}>{t("maidPricing.fields.allMaidsPrice")}</div>
                      <div className="num" style={{ fontSize: 22, fontWeight: 700, color: "var(--maid)" }}>{formatUSD(pricing.all_maids_price)}</div>
                    </div>
                  ) : (
                    <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, padding: "12px 14px", opacity: 0.6 }}>
                      <div style={{ fontSize: 11, color: "var(--muted-2)", marginBottom: 4 }}>{t("maidPricing.fields.allMaidsPrice")}</div>
                      <div style={{ fontSize: 13, color: "var(--muted-2)" }}>{t("maidPricing.noAllMaidsPrice")}</div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" onClick={() => { setShowForm(false); setEditingPricing(pricing); }} disabled={busy} style={btnSecondary}>
                    {t("maidPricing.edit")}
                  </button>
                  <button type="button" onClick={() => void handleDelete(pricing)} disabled={busy} style={btnDanger}>
                    {busy ? t("maidPricing.deleting") : t("maidPricing.delete")}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
    </>
  );
}

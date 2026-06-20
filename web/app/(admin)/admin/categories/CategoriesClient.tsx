"use client";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition, useState } from "react";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import {
  createCategory,
  updateCategory,
  deleteCategory,
} from "@/lib/server/actions/admin";
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
  pillBadge,
  stationBadgeStyle,
} from "@/components/admin/adminStyles";
import type { CategoryAdmin, CategoryCreate, CategoryUpdate, ProductionStation } from "@/lib/types";

interface CategoryFormProps {
  initial?: CategoryAdmin;
  onDone: (category: CategoryAdmin) => void;
  onCancel: () => void;
}

function CategoryForm({ initial, onDone, onCancel }: CategoryFormProps) {
  const t = useTranslations("admin");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const name = (fd.get("name") as string).trim();
    const display_order = parseInt((fd.get("display_order") as string) || "0", 10);
    const production_station = (fd.get("production_station") as ProductionStation) || "none";

    startTransition(async () => {
      if (initial) {
        const body: CategoryUpdate = { name, display_order, production_station };
        const result = await updateCategory(initial.id, body);
        if (!result.ok) { setError(result.error); return; }
        onDone(result.data);
      } else {
        const body: CategoryCreate = { name, display_order, production_station };
        const result = await createCategory(body);
        if (!result.ok) { setError(result.error); return; }
        onDone(result.data);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
      <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--foreground)", fontFamily: "var(--font-display-stack)" }}>
        {initial ? t("categories.editCategory") : t("categories.newCategory")}
      </h3>
      {error ? <div style={errorBanner}>{error}</div> : null}
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
        <div style={{ gridColumn: "1 / -1" }}>
          <label htmlFor="cat-name" style={adminLabel}>{t("categories.fields.name")}</label>
          <input id="cat-name" name="name" required defaultValue={initial?.name ?? ""} style={adminInput} disabled={pending} />
        </div>
        <div>
          <label htmlFor="cat-order" style={adminLabel}>{t("categories.fields.displayOrder")}</label>
          <input id="cat-order" name="display_order" type="number" min={0} defaultValue={initial?.display_order ?? 0} style={adminInput} disabled={pending} />
        </div>
        <div>
          <label htmlFor="cat-station" style={adminLabel}>{t("categories.fields.productionStation")}</label>
          <select id="cat-station" name="production_station" defaultValue={initial?.production_station ?? "none"} style={{ ...adminInput, paddingRight: 36 }} disabled={pending}>
            <option value="kitchen">{t("categories.station.kitchen")}</option>
            <option value="bar">{t("categories.station.bar")}</option>
            <option value="none">{t("categories.station.none")}</option>
          </select>
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingTop: 4 }}>
        <button type="button" onClick={onCancel} disabled={pending} style={btnSecondary}>
          {t("categories.cancel")}
        </button>
        <button type="submit" disabled={pending} style={pending ? btnPrimaryDisabled : btnPrimary}>
          {pending ? t("categories.saving") : t("categories.save")}
        </button>
      </div>
    </form>
  );
}

interface CategoriesClientProps {
  initialCategories: CategoryAdmin[];
}

export function CategoriesClient({ initialCategories }: CategoriesClientProps) {
  const t = useTranslations("admin");
  const router = useRouter();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [showForm, setShowForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryAdmin | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [items, setItems] = useState<CategoryAdmin[]>(initialCategories);

  function upsertCategory(list: CategoryAdmin[], category: CategoryAdmin): CategoryAdmin[] {
    const idx = list.findIndex((c) => c.id === category.id);
    if (idx === -1) return [...list, category];
    return list.map((c) => (c.id === category.id ? category : c));
  }

  const sorted = [...items].sort((a, b) => a.display_order - b.display_order || a.id - b.id);

  const [, startTransition] = useTransition();

  async function handleDelete(cat: CategoryAdmin) {
    if (!await confirm({
      title: t("categories.confirmDeleteTitle", { name: cat.name }),
      description: t("categories.confirmDeleteDesc"),
    })) return;
    setActionError(null);
    setBusyId(cat.id);
    // Immediately remove from local state — this persists even after transition ends
    setItems((prev) => prev.filter((c) => c.id !== cat.id));
    startTransition(async () => {
      const result = await deleteCategory(cat.id);
      setBusyId(null);
      if (!result.ok) {
        setActionError(result.error);
        // Restore the item on failure
        setItems((prev) => [...prev, cat]);
      }
      if (editingCategory?.id === cat.id) setEditingCategory(null);
      router.refresh();
    });
  }

  return (
    <>
    {confirmDialog}
    <div style={{ display: "grid", gap: 24 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
        <div>
          <h1 style={pageTitle}>{t("categories.title")}</h1>
          <p style={pageSubtitle}>{t("categories.subtitle")}</p>
        </div>
        {!showForm && !editingCategory ? (
          <button type="button" onClick={() => setShowForm(true)} style={btnPrimary}>
            ＋ {t("categories.newCategory")}
          </button>
        ) : null}
      </div>

      {actionError ? <div style={errorBanner}>{actionError}</div> : null}

      {showForm ? (
        <div style={adminCard}>
          <CategoryForm
            onDone={(category) => {
              setItems((prev) => upsertCategory(prev, category));
              setShowForm(false);
              router.refresh();
            }}
            onCancel={() => setShowForm(false)}
          />
        </div>
      ) : null}

      {editingCategory ? (
        <div style={adminCard}>
          <CategoryForm
            initial={editingCategory}
            onDone={(category) => {
              setItems((prev) => upsertCategory(prev, category));
              setEditingCategory(null);
              router.refresh();
            }}
            onCancel={() => setEditingCategory(null)}
          />
        </div>
      ) : null}

      {sorted.length === 0 ? (
        <div style={adminCard}>{t("categories.noCategories")}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sorted.map((cat) => {
            const busy = busyId === cat.id;
            const stBadge = stationBadgeStyle(cat.production_station);
            return (
              <article key={cat.id} style={{ display: "flex", alignItems: "center", gap: 14, background: "var(--background)", border: "1px solid var(--line)", borderRadius: 14, padding: "14px 18px", flexWrap: "wrap" }}>
                {/* Order number badge */}
                <div style={{ width: 28, height: 28, borderRadius: 8, background: "var(--card)", border: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12, color: "var(--muted)", flexShrink: 0 }}>
                  {cat.display_order}
                </div>

                {/* Name + badges */}
                <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 700, fontSize: 15.5, color: "var(--foreground)" }}>{cat.name}</span>
                  <span style={{ ...pillBadge, ...stBadge, fontSize: 11, padding: "4px 10px" }}>
                    {cat.production_station}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--muted-2)" }}>{cat.item_count} items</span>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <button type="button" onClick={() => { setShowForm(false); setEditingCategory(cat); }} disabled={busy} style={btnSecondary}>
                    {t("categories.edit")}
                  </button>
                  <button type="button" onClick={() => void handleDelete(cat)} disabled={busy} style={btnDanger}>
                    {busy ? t("categories.deleting") : t("categories.delete")}
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

"use client";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition, useState, useRef } from "react";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { createMenuItem, updateMenuItem, deleteMenuItem } from "@/lib/server/actions/admin";
import { formatUSD } from "@/lib/money";
import {
  adminCard,
  adminInput,
  adminLabel,
  btnPrimary,
  btnPrimaryDisabled,
  btnSecondary,
  btnDanger,
  btnIndigo,
  pageTitle,
  pageSubtitle,
  errorBanner,
  pillBadge,
} from "@/components/admin/adminStyles";
import type {
  MenuItemAdmin,
  CategoryAdmin,
  MenuItemType,
  BundleComponentWrite,
  MenuItemWithPricingCreate,
  MenuItemWithPricingUpdate,
} from "@/lib/types";

// ─── Image upload field ────────────────────────────────────────────────────────

interface ImageFieldProps {
  value: string;
  onChange: (v: string) => void;
  uploadPath: "/api/admin/upload/menu-image";
  disabled?: boolean;
  label: string;
}

function ImageField({ value, onChange, uploadPath, disabled, label }: ImageFieldProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { setUploadError("Please select an image file."); return; }
    if (file.size > 8 * 1024 * 1024) { setUploadError("Maximum image size is 8 MB."); return; }
    setUploadError("");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const res = await fetch(uploadPath, { method: "POST", body: fd });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? "Upload failed");
      }
      const { image_url } = await res.json() as { image_url: string };
      onChange(image_url);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <span style={adminLabel}>{label}</span>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="Preview" style={{ width: 80, height: 60, objectFit: "cover", borderRadius: 10, border: "1px solid var(--line)", flexShrink: 0 }} />
        ) : (
          <div style={{ width: 80, height: 60, borderRadius: 10, background: "var(--background)", border: "1px dashed var(--line)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "var(--muted-2)", flexShrink: 0 }}>No image</div>
        )}
        <div style={{ flex: 1, display: "grid", gap: 8 }}>
          <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="https://..." style={{ ...adminInput, minHeight: 40, padding: "8px 12px" }} disabled={disabled || uploading} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(e) => void handleFileChange(e)} hidden />
            <button type="button" disabled={uploading || disabled} onClick={() => fileInputRef.current?.click()} style={btnIndigo}>
              {uploading ? "Uploading…" : "Choose image"}
            </button>
            {value ? (
              <button type="button" onClick={() => onChange("")} disabled={disabled} style={btnSecondary}>Remove</button>
            ) : null}
          </div>
          {uploadError ? <div style={{ color: "#b91c1c", fontSize: 12 }}>{uploadError}</div> : null}
        </div>
      </div>
    </div>
  );
}

// ─── Menu item form ────────────────────────────────────────────────────────────

interface MenuItemFormProps {
  initial?: MenuItemAdmin;
  categories: CategoryAdmin[];
  allItems: MenuItemAdmin[];
  onDone: (item: MenuItemAdmin) => void;
  onCancel: () => void;
}

function MenuItemForm({ initial, categories, allItems, onDone, onCancel }: MenuItemFormProps) {
  const t = useTranslations("admin");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [itemType, setItemType] = useState<MenuItemType>(initial?.item_type ?? "regular");
  const [isBundle, setIsBundle] = useState(initial?.is_bundle ?? false);
  const [imageUrl, setImageUrl] = useState(initial?.image_url ?? "");
  const [components, setComponents] = useState<BundleComponentWrite[]>(
    (initial?.components ?? []).map((c) => ({ menu_item_id: c.menu_item_id, quantity: c.quantity }))
  );

  const componentChoices = allItems.filter(
    (item) => item.id !== initial?.id && !item.is_bundle && item.is_active
  );

  function addComponent() {
    const firstUnused = componentChoices.find((item) => !components.some((c) => c.menu_item_id === item.id));
    if (!firstUnused) return;
    setComponents((prev) => [...prev, { menu_item_id: firstUnused.id, quantity: 1 }]);
  }

  function updateComponent(index: number, patch: Partial<BundleComponentWrite>) {
    setComponents((prev) => prev.map((c, i) => i === index ? { ...c, ...patch } : c));
  }

  function removeComponent(index: number) {
    setComponents((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);

    const name = (fd.get("name") as string).trim();
    const description = ((fd.get("description") as string) ?? "").trim() || null;
    const price = (fd.get("price") as string).trim();
    const category_id_raw = (fd.get("category_id") as string).trim();
    const category_id = category_id_raw ? parseInt(category_id_raw, 10) : null;
    const is_active = fd.get("is_active") === "on";
    const additional_maid_price = ((fd.get("additional_maid_price") as string) ?? "").trim() || null;
    const all_maids_price_raw = ((fd.get("all_maids_price") as string) ?? "").trim();
    const all_maids_price = all_maids_price_raw || null;

    if (isBundle && components.length === 0) {
      setError("A bundle must contain at least one component.");
      return;
    }

    startTransition(async () => {
      if (initial) {
        const body: MenuItemWithPricingUpdate = {
          name, description, price, image_url: imageUrl || null, category_id,
          item_type: itemType, is_active, is_bundle: isBundle,
          components: isBundle ? components : [],
          ...(itemType === "maid_service" ? { additional_maid_price: additional_maid_price ?? "0", all_maids_price } : {}),
        };
        const result = await updateMenuItem(initial.id, body);
        if (!result.ok) { setError(result.error); return; }
        onDone(result.data);
      } else {
        const body: MenuItemWithPricingCreate = {
          name, description, price, image_url: imageUrl || null, category_id,
          item_type: itemType, is_active, is_bundle: isBundle,
          components: isBundle ? components : [],
          ...(itemType === "maid_service" ? { additional_maid_price: additional_maid_price ?? "0", all_maids_price } : {}),
        };
        const result = await createMenuItem(body);
        if (!result.ok) { setError(result.error); return; }
        onDone(result.data);
      }
    });
  }

  const categoryChoices = itemType === "maid_service"
    ? categories
    : categories.filter((c) => c.name.trim().toLowerCase() !== "maid service");

  return (
    <form onSubmit={handleSubmit} style={{ display: "grid", gap: 16 }}>
      <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--foreground)", fontFamily: "var(--font-display-stack)" }}>
        {initial ? t("menuItems.editItem") : t("menuItems.newItem")}
      </h3>

      {error ? <div style={errorBanner}>{error}</div> : null}

      {/* Item type */}
      <div>
        <label htmlFor="mi-type" style={adminLabel}>{t("menuItems.fields.itemType")}</label>
        <select
          id="mi-type"
          value={itemType}
          onChange={(e) => {
            const newType = e.target.value as MenuItemType;
            setItemType(newType);
            if (newType === "maid_service") { setIsBundle(false); setComponents([]); }
          }}
          style={{ ...adminInput, paddingRight: 36 }}
          disabled={pending}
        >
          <option value="regular">{t("menuItems.type.regular")}</option>
          <option value="maid_service">{t("menuItems.type.maidService")}</option>
        </select>
      </div>

      {/* Bundle checkbox (regular only) */}
      {itemType === "regular" ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input
            id="mi-bundle" type="checkbox" checked={isBundle}
            onChange={(e) => { setIsBundle(e.target.checked); if (!e.target.checked) setComponents([]); }}
            style={{ width: 18, height: 18, cursor: "pointer" }}
            disabled={pending}
          />
          <label htmlFor="mi-bundle" style={{ ...adminLabel, margin: 0, cursor: "pointer" }}>
            {t("menuItems.fields.isBundle")}
          </label>
        </div>
      ) : null}

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
        <div style={{ gridColumn: "1 / -1" }}>
          <label htmlFor="mi-name" style={adminLabel}>{t("menuItems.fields.name")}</label>
          <input id="mi-name" name="name" required defaultValue={initial?.name ?? ""} style={adminInput} disabled={pending} />
        </div>

        <div style={{ gridColumn: "1 / -1" }}>
          <label htmlFor="mi-desc" style={adminLabel}>{t("menuItems.fields.description")}</label>
          <textarea id="mi-desc" name="description" defaultValue={initial?.description ?? ""} rows={2} style={{ ...adminInput, minHeight: 60, resize: "vertical" }} disabled={pending} />
        </div>

        <div>
          <label htmlFor="mi-price" style={adminLabel}>{t("menuItems.fields.price")}</label>
          <input id="mi-price" name="price" type="number" step="0.01" min="0" required defaultValue={initial?.price ?? ""} style={adminInput} disabled={pending} />
        </div>

        <div>
          <label htmlFor="mi-category" style={adminLabel}>{t("menuItems.fields.category")}</label>
          <select id="mi-category" name="category_id" defaultValue={initial?.category_id ?? ""} style={{ ...adminInput, paddingRight: 36 }} disabled={pending}>
            <option value="">{t("menuItems.noCategory")}</option>
            {categoryChoices.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div style={{ gridColumn: "1 / -1" }}>
          <ImageField value={imageUrl} onChange={setImageUrl} uploadPath="/api/admin/upload/menu-image" disabled={pending} label={t("menuItems.fields.image")} />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input id="mi-active" name="is_active" type="checkbox" defaultChecked={initial?.is_active ?? true} style={{ width: 18, height: 18, cursor: "pointer" }} disabled={pending} />
          <label htmlFor="mi-active" style={{ ...adminLabel, margin: 0, cursor: "pointer" }}>
            {t("menuItems.fields.isActive")}
          </label>
        </div>
      </div>

      {/* Bundle components */}
      {isBundle ? (
        <section style={{ display: "grid", gap: 12, padding: 14, border: "1px solid #C4B5FD", borderRadius: 12, background: "#FAF5FF" }}>
          <div>
            <strong style={{ color: "var(--foreground)" }}>{t("menuItems.bundleComponents")}</strong>
            <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: 13 }}>{t("menuItems.bundleHint")}</p>
          </div>
          {components.map((comp, idx) => {
            const selectedIds = new Set(components.map((c) => c.menu_item_id));
            return (
              <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 80px 44px", gap: 8, alignItems: "center" }}>
                <select value={comp.menu_item_id} onChange={(e) => updateComponent(idx, { menu_item_id: Number(e.target.value) })} style={{ ...adminInput, paddingRight: 28 }} disabled={pending}>
                  {componentChoices
                    .filter((item) => item.id === comp.menu_item_id || !selectedIds.has(item.id))
                    .map((item) => {
                      const cat = categories.find((c) => c.id === item.category_id);
                      return (
                        <option key={item.id} value={item.id}>
                          {item.name} ({item.item_type === "maid_service" ? "Maid Service" : (cat?.production_station ?? "none")})
                        </option>
                      );
                    })}
                </select>
                <input type="number" min={1} value={comp.quantity} onChange={(e) => updateComponent(idx, { quantity: Math.max(1, Number(e.target.value || 1)) })} style={{ ...adminInput, textAlign: "center" }} disabled={pending} />
                <button type="button" onClick={() => removeComponent(idx)} disabled={pending} style={{ minHeight: "var(--tap-min)", width: 44, borderRadius: 10, border: "1px solid #fecaca", background: "#fff7f7", color: "#b91c1c", fontWeight: 700, cursor: "pointer", fontSize: 16 }}>
                  ×
                </button>
              </div>
            );
          })}
          <button type="button" onClick={addComponent} disabled={pending || components.length >= componentChoices.length} style={{ ...btnSecondary, justifySelf: "start" }}>
            ＋ {t("menuItems.addComponent")}
          </button>
        </section>
      ) : null}

      {/* Maid service pricing */}
      {itemType === "maid_service" ? (
        <section style={{ display: "grid", gap: 12, padding: 14, border: "1px solid var(--line)", borderRadius: 12, background: "rgba(142,134,201,0.06)" }}>
          <strong style={{ color: "var(--foreground)" }}>{t("menuItems.maidPricing")}</strong>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
            <div>
              <label htmlFor="mi-addl" style={adminLabel}>{t("menuItems.fields.additionalMaidPrice")}</label>
              <input id="mi-addl" name="additional_maid_price" type="number" step="0.01" min="0" defaultValue={initial?.maid_service_pricing?.additional_maid_price ?? "0"} style={adminInput} disabled={pending} />
            </div>
            <div>
              <label htmlFor="mi-allmaids" style={adminLabel}>{t("menuItems.fields.allMaidsPrice")}</label>
              <input id="mi-allmaids" name="all_maids_price" type="number" step="0.01" min="0" defaultValue={initial?.maid_service_pricing?.all_maids_price ?? ""} placeholder={t("menuItems.allMaidsPricePlaceholder")} style={adminInput} disabled={pending} />
            </div>
          </div>
        </section>
      ) : null}

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingTop: 4 }}>
        <button type="button" onClick={onCancel} disabled={pending} style={btnSecondary}>
          {t("menuItems.cancel")}
        </button>
        <button type="submit" disabled={pending} style={pending ? btnPrimaryDisabled : btnPrimary}>
          {pending ? t("menuItems.saving") : t("menuItems.save")}
        </button>
      </div>
    </form>
  );
}

// ─── Main client island ────────────────────────────────────────────────────────

type FilterType = "all" | "regular" | "maid_service" | "bundle";

interface MenuItemsClientProps {
  initialItems: MenuItemAdmin[];
  categories: CategoryAdmin[];
}

export function MenuItemsClient({ initialItems, categories }: MenuItemsClientProps) {
  const t = useTranslations("admin");
  const router = useRouter();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItemAdmin | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>("all");

  const [items, setItems] = useState<MenuItemAdmin[]>(initialItems);

  function upsertItem(list: MenuItemAdmin[], item: MenuItemAdmin): MenuItemAdmin[] {
    const idx = list.findIndex((i) => i.id === item.id);
    if (idx === -1) return [item, ...list];
    return list.map((i) => (i.id === item.id ? item : i));
  }

  const filtered = items.filter((item) => {
    if (filter === "all") return true;
    if (filter === "regular") return item.item_type === "regular" && !item.is_bundle;
    if (filter === "maid_service") return item.item_type === "maid_service";
    if (filter === "bundle") return item.is_bundle;
    return true;
  });

  const [, startTransition] = useTransition();

  async function handleDelete(item: MenuItemAdmin) {
    if (!await confirm({
      title: t("menuItems.confirmDeleteTitle", { name: item.name }),
      description: t("menuItems.confirmDeleteDesc"),
    })) return;
    setActionError(null);
    setBusyId(item.id);
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    startTransition(async () => {
      const result = await deleteMenuItem(item.id);
      setBusyId(null);
      if (!result.ok) {
        setActionError(result.error);
        setItems((prev) => [item, ...prev]);
      }
      if (editingItem?.id === item.id) setEditingItem(null);
      router.refresh();
    });
  }

  function typeBadgeStyle(type: MenuItemType, isBundle: boolean): React.CSSProperties {
    if (isBundle) return { background: "#EDE9FE", color: "#5B21B6" };
    if (type === "maid_service") return { background: "rgba(142,134,201,0.15)", color: "#5B4EA5" };
    return { background: "#F3F4F6", color: "#374151" };
  }

  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  return (
    <>
    {confirmDialog}
    <div style={{ display: "grid", gap: 24 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
        <div>
          <h1 style={pageTitle}>{t("menuItems.title")}</h1>
          <p style={pageSubtitle}>{t("menuItems.subtitle")}</p>
        </div>
        {!showForm && !editingItem ? (
          <button type="button" onClick={() => setShowForm(true)} style={btnPrimary}>
            ＋ {t("menuItems.newItem")}
          </button>
        ) : null}
      </div>

      {/* Filter pills — design spec style */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {(["all", "regular", "maid_service", "bundle"] as FilterType[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            style={{
              minHeight: "var(--tap-min)",
              padding: "0 16px",
              borderRadius: 999,
              border: filter === f ? "none" : "1px solid var(--line)",
              background: filter === f ? "var(--brand)" : "var(--card)",
              color: filter === f ? "#fff" : "var(--foreground)",
              fontWeight: filter === f ? 700 : 600,
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            {t(`menuItems.filter.${f}`)}
          </button>
        ))}
      </div>

      {actionError ? <div style={errorBanner}>{actionError}</div> : null}

      {showForm ? (
        <div style={adminCard}>
          <MenuItemForm
            categories={categories}
            allItems={items}
            onDone={(item) => {
              setItems((prev) => upsertItem(prev, item));
              setShowForm(false);
              router.refresh();
            }}
            onCancel={() => setShowForm(false)}
          />
        </div>
      ) : null}

      {editingItem ? (
        <div style={adminCard}>
          <MenuItemForm
            key={editingItem.id}
            initial={editingItem}
            categories={categories}
            allItems={items}
            onDone={(item) => {
              setItems((prev) => upsertItem(prev, item));
              setEditingItem(null);
              router.refresh();
            }}
            onCancel={() => setEditingItem(null)}
          />
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <div style={adminCard}>{t("menuItems.noItems")}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map((item) => {
            const busy = busyId === item.id;
            const cat = item.category_id ? categoryMap.get(item.category_id) : null;
            const typeStyle = typeBadgeStyle(item.item_type, item.is_bundle);
            const typeLabel = item.is_bundle ? t("menuItems.type.bundle") : item.item_type === "maid_service" ? t("menuItems.type.maidService") : t("menuItems.type.regular");

            return (
              <article key={item.id} style={{ display: "flex", gap: 14, alignItems: "flex-start", background: "var(--background)", border: "1px solid var(--line)", borderRadius: 14, padding: "14px 18px", flexWrap: "wrap" }}>
                {/* Thumbnail */}
                {item.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.image_url} alt={item.name} style={{ width: 64, height: 48, objectFit: "cover", borderRadius: 10, flexShrink: 0, border: "1px solid var(--line)" }} />
                ) : (
                  <div style={{ width: 64, height: 48, borderRadius: 10, background: "var(--card)", border: "1px solid var(--line)", flexShrink: 0 }} />
                )}

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 700, fontSize: 15, color: "var(--foreground)" }}>{item.name}</span>
                    <span style={{ ...pillBadge, ...typeStyle, fontSize: 11, padding: "3px 9px" }}>{typeLabel}</span>
                    <span style={{ ...pillBadge, fontSize: 11, padding: "3px 9px", background: item.is_active ? "#dcfce7" : "#f3f4f6", color: item.is_active ? "#166534" : "#4b5563" }}>
                      {item.is_active ? "Active" : "Inactive"}
                    </span>
                    <span className="num" style={{ fontSize: 13, fontWeight: 700, color: "var(--brand)" }}>{formatUSD(item.price)}</span>
                  </div>
                  {cat ? <div style={{ fontSize: 12, color: "var(--muted-2)", marginTop: 3 }}>{cat.name} · {cat.production_station}</div> : null}
                  {item.description ? <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 400 }}>{item.description}</div> : null}
                  {item.maid_service_pricing ? (
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                      +{formatUSD(item.maid_service_pricing.additional_maid_price)}/maid
                      {item.maid_service_pricing.all_maids_price ? ` · all ${formatUSD(item.maid_service_pricing.all_maids_price)}` : ""}
                    </div>
                  ) : null}
                  {item.is_bundle && item.components.length > 0 ? (
                    <div style={{ fontSize: 12, color: "var(--muted-2)", marginTop: 4 }}>
                      {item.components.map((c) => `${c.menu_item_name} ×${c.quantity}`).join(", ")}
                    </div>
                  ) : null}
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <button type="button" onClick={() => { setShowForm(false); setEditingItem(item); }} disabled={busy} style={btnSecondary}>
                    {t("menuItems.edit")}
                  </button>
                  <button type="button" onClick={() => void handleDelete(item)} disabled={busy} style={btnDanger}>
                    {busy ? t("menuItems.deleting") : t("menuItems.delete")}
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

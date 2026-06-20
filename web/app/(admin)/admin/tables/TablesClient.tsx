"use client";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition, useState } from "react";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { createTable, updateTable, deleteTable } from "@/lib/server/actions/admin";
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
} from "@/components/admin/adminStyles";
import type { TableRead, TableCreate, TableUpdate } from "@/lib/types";

interface TableFormProps {
  initial?: TableRead;
  onDone: (table: TableRead) => void;
  onCancel: () => void;
}

function TableForm({ initial, onDone, onCancel }: TableFormProps) {
  const t = useTranslations("admin.tables");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const fv = (name: string) => (fd.get(name) as string | null) ?? "";

    startTransition(async () => {
      if (initial) {
        const body: TableUpdate = {
          code: fv("code").trim() || undefined,
          seats: fv("seats") ? parseInt(fv("seats"), 10) : undefined,
          is_active: fv("is_active") === "true",
          is_shareable: fv("is_shareable") === "true",
        };
        const result = await updateTable(initial.id, body);
        if (!result.ok) { setError(result.error); return; }
        onDone(result.data);
      } else {
        const body: TableCreate = {
          code: fv("code").trim(),
          seats: parseInt(fv("seats"), 10) || 2,
          is_active: fv("is_active") === "true",
          is_shareable: fv("is_shareable") === "true",
        };
        const result = await createTable(body);
        if (!result.ok) { setError(result.error); return; }
        onDone(result.data);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
      <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--foreground)", fontFamily: "var(--font-display-stack)" }}>
        {initial ? t("editTable") : t("newTable")}
      </h3>
      {error ? <div style={{ padding: "10px 14px", borderRadius: 10, background: "#fff0f0", color: "#b91c1c", fontSize: 13, border: "1px solid #fecaca" }}>{error}</div> : null}

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
        <div>
          <label htmlFor="tf-code" style={adminLabel}>{t("fields.code")}</label>
          <input id="tf-code" name="code" required={!initial} maxLength={10} defaultValue={initial?.code ?? ""} style={adminInput} disabled={pending} />
        </div>
        <div>
          <label htmlFor="tf-seats" style={adminLabel}>{t("fields.seats")}</label>
          <input id="tf-seats" name="seats" type="number" min={1} required={!initial} defaultValue={initial?.seats ?? 2} style={adminInput} disabled={pending} />
        </div>
        <div>
          <label htmlFor="tf-active" style={adminLabel}>{t("fields.isActive")}</label>
          <select id="tf-active" name="is_active" defaultValue={String(initial?.is_active ?? true)} style={{ ...adminInput, paddingRight: 36 }} disabled={pending}>
            <option value="true">{t("yes")}</option>
            <option value="false">{t("no")}</option>
          </select>
        </div>
        <div>
          <label htmlFor="tf-shareable" style={adminLabel}>{t("fields.isShareable")}</label>
          <select id="tf-shareable" name="is_shareable" defaultValue={String(initial?.is_shareable ?? false)} style={{ ...adminInput, paddingRight: 36 }} disabled={pending}>
            <option value="true">{t("yes")}</option>
            <option value="false">{t("no")}</option>
          </select>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingTop: 4 }}>
        <button type="button" onClick={onCancel} disabled={pending} style={btnSecondary}>
          {t("cancel")}
        </button>
        <button type="submit" disabled={pending} style={pending ? btnPrimaryDisabled : btnPrimary}>
          {pending ? t("saving") : t("save")}
        </button>
      </div>
    </form>
  );
}

interface TablesClientProps {
  initialTables: TableRead[];
}

export function TablesClient({ initialTables }: TablesClientProps) {
  const t = useTranslations("admin.tables");
  const router = useRouter();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [showForm, setShowForm] = useState(false);
  const [editingTable, setEditingTable] = useState<TableRead | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionPending, startTransition] = useTransition();

  const [items, setItems] = useState<TableRead[]>(initialTables);

  function upsertTable(list: TableRead[], table: TableRead): TableRead[] {
    const idx = list.findIndex((tb) => tb.id === table.id);
    if (idx === -1) return [table, ...list];
    return list.map((tb) => (tb.id === table.id ? table : tb));
  }

  async function handleDelete(table: TableRead) {
    if (!await confirm({
      title: t("confirmDeleteTitle", { code: table.code }),
      description: t("confirmDeleteDesc"),
    })) return;
    setActionError(null);
    setBusyId(table.id);
    setItems((prev) => prev.filter((tb) => tb.id !== table.id));
    startTransition(async () => {
      const result = await deleteTable(table.id);
      setBusyId(null);
      if (!result.ok) {
        setActionError(result.error);
        setItems((prev) => [...prev, table]);
      }
      if (editingTable?.id === table.id) setEditingTable(null);
      router.refresh();
    });
  }

  const sorted = [...items].sort((a, b) =>
    a.code.localeCompare(b.code, undefined, { numeric: true }),
  );

  return (
    <>
    {confirmDialog}
    <div style={{ display: "grid", gap: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
        <div>
          <h1 style={pageTitle}>{t("title")}</h1>
          <p style={pageSubtitle}>{t("subtitle")}</p>
        </div>
        {!showForm && !editingTable ? (
          <button type="button" onClick={() => setShowForm(true)} style={btnPrimary}>
            ＋ {t("newTable")}
          </button>
        ) : null}
      </div>

      {actionError ? <div style={errorBanner}>{actionError}</div> : null}

      {showForm ? (
        <div style={adminCard}>
          <TableForm
            onDone={(table) => {
              setItems((prev) => upsertTable(prev, table));
              setShowForm(false);
              router.refresh();
            }}
            onCancel={() => setShowForm(false)}
          />
        </div>
      ) : null}

      {editingTable ? (
        <div style={adminCard}>
          <TableForm
            initial={editingTable}
            onDone={(table) => {
              setItems((prev) => upsertTable(prev, table));
              setEditingTable(null);
              router.refresh();
            }}
            onCancel={() => setEditingTable(null)}
          />
        </div>
      ) : null}

      {sorted.length === 0 ? (
        <div style={adminCard}>{t("noTables")}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sorted.map((table) => {
            const busy = busyId === table.id || (actionPending && busyId === table.id);
            return (
              <article key={table.id} style={{ display: "flex", alignItems: "center", gap: 14, background: "var(--background)", border: "1px solid var(--line)", borderRadius: 14, padding: "14px 18px", flexWrap: "wrap" }}>
                {/* Table code badge */}
                <div style={{
                  minWidth: 52, height: 52, borderRadius: 12,
                  background: table.is_active ? "rgba(201,72,106,0.10)" : "var(--card)",
                  border: table.is_active ? "2px solid var(--brand)" : "1px solid var(--line)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 900, fontSize: 18, color: table.is_active ? "var(--brand)" : "var(--muted-2)",
                  flexShrink: 0,
                }}>
                  {table.code}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ ...pillBadge, fontSize: 11, padding: "4px 10px", background: table.is_active ? "#dcfce7" : "#fee2e2", color: table.is_active ? "#166534" : "#991b1b" }}>
                      {table.is_active ? t("active") : t("inactive")}
                    </span>
                    {table.is_shareable ? (
                      <span style={{ ...pillBadge, fontSize: 11, padding: "4px 10px", background: "#dbeafe", color: "#1d4ed8" }}>
                        {t("shareable")}
                      </span>
                    ) : null}
                  </div>
                  <div style={{ color: "var(--muted)", marginTop: 4, fontSize: 13 }}>
                    {t("fields.seats")}: <strong style={{ color: "var(--foreground)" }}>{table.seats}</strong>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <button type="button" onClick={() => { setShowForm(false); setEditingTable(table); }} disabled={busy} style={btnSecondary}>
                    {t("edit")}
                  </button>
                  <button type="button" onClick={() => handleDelete(table)} disabled={busy} style={btnDanger}>
                    {busy ? t("deleting") : t("delete")}
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

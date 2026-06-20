"use client";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition, useState, useRef } from "react";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { createMaid, updateMaid, deleteMaid } from "@/lib/server/actions/admin";
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
import type { MaidAdmin, MaidCreate, MaidUpdate } from "@/lib/types";

interface MaidFormProps {
  initial?: MaidAdmin;
  onDone: (maid: MaidAdmin) => void;
  onCancel: () => void;
}

function MaidForm({ initial, onDone, onCancel }: MaidFormProps) {
  const t = useTranslations("admin");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState(initial?.photo_url ?? "");
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
      const res = await fetch("/api/admin/upload/maid-image", { method: "POST", body: fd });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? "Upload failed");
      }
      const { image_url } = await res.json() as { image_url: string };
      setPhotoUrl(image_url);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const name = (fd.get("name") as string).trim();
    const bio = (fd.get("bio") as string).trim() || null;
    const display_order = parseInt((fd.get("display_order") as string) || "0", 10);
    const is_active = fd.get("is_active") === "on";

    startTransition(async () => {
      if (initial) {
        const body: MaidUpdate = { name, bio, display_order, is_active, photo_url: photoUrl || null };
        const result = await updateMaid(initial.id, body);
        if (!result.ok) { setError(result.error); return; }
        onDone(result.data);
      } else {
        const body: MaidCreate = { name, bio, display_order, is_active, photo_url: photoUrl || null };
        const result = await createMaid(body);
        if (!result.ok) { setError(result.error); return; }
        onDone(result.data);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
      <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--foreground)", fontFamily: "var(--font-display-stack)" }}>
        {initial ? t("maids.editMaid") : t("maids.newMaid")}
      </h3>
      {error ? <div style={errorBanner}>{error}</div> : null}

      {/* Photo upload */}
      <div>
        <label style={adminLabel}>{t("maids.fields.photoUrl")}</label>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt="Maid preview" style={{ width: 80, height: 80, objectFit: "cover", borderRadius: "50%", border: "2px solid var(--line)", flexShrink: 0 }} />
          ) : (
            <div style={{ width: 80, height: 80, borderRadius: "50%", background: "var(--background)", border: "2px dashed var(--line)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted-2)", fontSize: 11, flexShrink: 0 }}>No photo</div>
          )}
          <div style={{ flex: 1, display: "grid", gap: 8 }}>
            <input value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} placeholder="https://..." style={{ ...adminInput, minHeight: 40, padding: "8px 12px" }} disabled={pending || uploading} />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(e) => void handleFileChange(e)} hidden />
              <button type="button" disabled={uploading || pending} onClick={() => fileInputRef.current?.click()} style={btnIndigo}>
                {uploading ? "Uploading…" : "Choose photo"}
              </button>
              {photoUrl ? (
                <button type="button" onClick={() => setPhotoUrl("")} style={btnSecondary}>Remove</button>
              ) : null}
            </div>
            {uploadError ? <div style={{ color: "#b91c1c", fontSize: 12 }}>{uploadError}</div> : null}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
        <div style={{ gridColumn: "1 / -1" }}>
          <label htmlFor="maid-name" style={adminLabel}>{t("maids.fields.name")}</label>
          <input id="maid-name" name="name" required defaultValue={initial?.name ?? ""} style={adminInput} disabled={pending} />
        </div>
        <div>
          <label htmlFor="maid-order" style={adminLabel}>{t("maids.fields.displayOrder")}</label>
          <input id="maid-order" name="display_order" type="number" min={0} defaultValue={initial?.display_order ?? 0} style={adminInput} disabled={pending} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 20 }}>
          <input id="maid-active" name="is_active" type="checkbox" defaultChecked={initial?.is_active ?? true} style={{ width: 18, height: 18, cursor: "pointer" }} disabled={pending} />
          <label htmlFor="maid-active" style={{ ...adminLabel, margin: 0, cursor: "pointer" }}>{t("maids.fields.isActive")}</label>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label htmlFor="maid-bio" style={adminLabel}>{t("maids.fields.bio")}</label>
          <textarea id="maid-bio" name="bio" defaultValue={initial?.bio ?? ""} rows={3} style={{ ...adminInput, minHeight: 80, resize: "vertical" }} disabled={pending} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingTop: 4 }}>
        <button type="button" onClick={onCancel} disabled={pending} style={btnSecondary}>
          {t("maids.cancel")}
        </button>
        <button type="submit" disabled={pending || uploading} style={pending ? btnPrimaryDisabled : btnPrimary}>
          {pending ? t("maids.saving") : t("maids.save")}
        </button>
      </div>
    </form>
  );
}

interface MaidsClientProps {
  initialMaids: MaidAdmin[];
}

export function MaidsClient({ initialMaids }: MaidsClientProps) {
  const t = useTranslations("admin");
  const router = useRouter();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [showForm, setShowForm] = useState(false);
  const [editingMaid, setEditingMaid] = useState<MaidAdmin | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [items, setItems] = useState<MaidAdmin[]>(initialMaids);

  function upsertMaid(list: MaidAdmin[], maid: MaidAdmin): MaidAdmin[] {
    const idx = list.findIndex((m) => m.id === maid.id);
    if (idx === -1) return [...list, maid];
    return list.map((m) => (m.id === maid.id ? maid : m));
  }

  const sorted = [...items].sort((a, b) => a.display_order - b.display_order || a.id - b.id);

  const [, startTransition] = useTransition();

  async function handleDelete(maid: MaidAdmin) {
    if (!await confirm({
      title: t("maids.confirmDeleteTitle", { name: maid.name }),
      description: t("maids.confirmDeleteDesc"),
    })) return;
    setActionError(null);
    setBusyId(maid.id);
    setItems((prev) => prev.filter((m) => m.id !== maid.id));
    startTransition(async () => {
      const result = await deleteMaid(maid.id);
      setBusyId(null);
      if (!result.ok) {
        setActionError(result.error);
        setItems((prev) => [...prev, maid]);
      }
      if (editingMaid?.id === maid.id) setEditingMaid(null);
      router.refresh();
    });
  }

  return (
    <>
    {confirmDialog}
    <div style={{ display: "grid", gap: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
        <div>
          <h1 style={pageTitle}>{t("maids.title")}</h1>
          <p style={pageSubtitle}>{t("maids.subtitle")}</p>
        </div>
        {!showForm && !editingMaid ? (
          <button type="button" onClick={() => setShowForm(true)} style={btnPrimary}>
            ＋ {t("maids.newMaid")}
          </button>
        ) : null}
      </div>

      {actionError ? <div style={errorBanner}>{actionError}</div> : null}

      {showForm ? (
        <div style={adminCard}>
          <MaidForm
            onDone={(maid) => {
              setItems((prev) => upsertMaid(prev, maid));
              setShowForm(false);
              router.refresh();
            }}
            onCancel={() => setShowForm(false)}
          />
        </div>
      ) : null}

      {editingMaid ? (
        <div style={adminCard}>
          <MaidForm
            key={editingMaid.id}
            initial={editingMaid}
            onDone={(maid) => {
              setItems((prev) => upsertMaid(prev, maid));
              setEditingMaid(null);
              router.refresh();
            }}
            onCancel={() => setEditingMaid(null)}
          />
        </div>
      ) : null}

      {sorted.length === 0 ? (
        <div style={adminCard}>{t("maids.noMaids")}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sorted.map((maid) => {
            const busy = busyId === maid.id;
            return (
              <article key={maid.id} style={{ display: "flex", alignItems: "center", gap: 14, background: "var(--background)", border: "1px solid var(--line)", borderRadius: 14, padding: "14px 18px", flexWrap: "wrap" }}>
                {/* Avatar */}
                {maid.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={maid.photo_url} alt={maid.name} style={{ width: 50, height: 50, borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: "2px solid var(--line)" }} />
                ) : (
                  <div style={{ width: 50, height: 50, borderRadius: "50%", background: "var(--maid)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 20, color: "#fff", flexShrink: 0 }}>
                    {maid.name.slice(0, 1).toUpperCase()}
                  </div>
                )}

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 700, fontSize: 15.5, color: "var(--foreground)" }}>{maid.name}</span>
                    <span style={{ ...pillBadge, fontSize: 11, padding: "4px 10px", background: maid.is_active ? "#dcfce7" : "#f3f4f6", color: maid.is_active ? "#166534" : "#4b5563" }}>
                      {maid.is_active ? t("maids.active") : t("maids.inactive")}
                    </span>
                    <span style={{ fontSize: 12, color: "var(--muted-2)" }}>#{maid.display_order}</span>
                  </div>
                  {maid.bio ? (
                    <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 340 }}>
                      {maid.bio}
                    </p>
                  ) : null}
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <button type="button" onClick={() => { setShowForm(false); setEditingMaid(maid); }} disabled={busy} style={btnSecondary}>
                    {t("maids.edit")}
                  </button>
                  <button type="button" onClick={() => void handleDelete(maid)} disabled={busy} style={btnDanger}>
                    {busy ? t("maids.deleting") : t("maids.delete")}
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

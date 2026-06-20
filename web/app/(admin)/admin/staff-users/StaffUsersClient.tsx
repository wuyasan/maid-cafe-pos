"use client";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { StateCard } from "@/components/ui/StateCard";
import {
  createStaffUser,
  updateStaffUser,
  setStaffUserActive,
  resetStaffUserPin,
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
} from "@/components/admin/adminStyles";
import type {
  StaffUserAdmin,
  StaffUserCreate,
  StaffUserRole,
  StaffUserUpdate,
} from "@/lib/types";

const ROLES: StaffUserRole[] = ["staff", "manager", "admin"];

function roleBadge(role: StaffUserRole): React.CSSProperties {
  switch (role) {
    case "admin":
      return { background: "#FCE7F0", color: "#9D174D" };
    case "manager":
      return { background: "#EDEBF6", color: "#6E66A8" };
    default:
      return { background: "#E6F1EA", color: "#3F8763" };
  }
}

// ── Create / edit form ──────────────────────────────────────────────────────────

interface UserFormProps {
  initial?: StaffUserAdmin;
  onDone: (user: StaffUserAdmin) => void;
  onCancel: () => void;
}

function UserForm({ initial, onDone, onCancel }: UserFormProps) {
  const t = useTranslations("admin");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const display_name = (fd.get("display_name") as string).trim();
    const role = (fd.get("role") as StaffUserRole) || "staff";

    startTransition(async () => {
      if (initial) {
        const body: StaffUserUpdate = { display_name, role };
        const result = await updateStaffUser(initial.id, body);
        if (!result.ok) { setError(result.error); return; }
        onDone(result.data);
      } else {
        const username = (fd.get("username") as string).trim();
        const pin = (fd.get("pin") as string).trim();
        const body: StaffUserCreate = { username, display_name, role, pin };
        const result = await createStaffUser(body);
        if (!result.ok) { setError(result.error); return; }
        onDone(result.data);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
      <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--foreground)", fontFamily: "var(--font-display-stack)" }}>
        {initial ? t("staffUsers.editUser") : t("staffUsers.newUser")}
      </h3>
      {error ? <div style={errorBanner}>{error}</div> : null}
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
        <div>
          <label htmlFor="su-username" style={adminLabel}>{t("staffUsers.fields.username")}</label>
          <input
            id="su-username"
            name="username"
            required={!initial}
            defaultValue={initial?.username ?? ""}
            readOnly={!!initial}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            pattern="[a-z0-9_.-]{3,50}"
            title={t("staffUsers.hints.username")}
            style={{ ...adminInput, opacity: initial ? 0.6 : 1 }}
            disabled={pending}
          />
        </div>
        <div>
          <label htmlFor="su-name" style={adminLabel}>{t("staffUsers.fields.displayName")}</label>
          <input
            id="su-name"
            name="display_name"
            required
            minLength={1}
            maxLength={100}
            defaultValue={initial?.display_name ?? ""}
            style={adminInput}
            disabled={pending}
          />
        </div>
        <div>
          <label htmlFor="su-role" style={adminLabel}>{t("staffUsers.fields.role")}</label>
          <select id="su-role" name="role" defaultValue={initial?.role ?? "staff"} style={{ ...adminInput, paddingRight: 36 }} disabled={pending}>
            {ROLES.map((r) => (
              <option key={r} value={r}>{t(`staffUsers.role.${r}`)}</option>
            ))}
          </select>
        </div>
        {!initial ? (
          <div>
            <label htmlFor="su-pin" style={adminLabel}>{t("staffUsers.fields.pin")}</label>
            <input
              id="su-pin"
              name="pin"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              required
              pattern="\d{4,12}"
              title={t("staffUsers.hints.pin")}
              style={adminInput}
              disabled={pending}
            />
          </div>
        ) : null}
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingTop: 4 }}>
        <button type="button" onClick={onCancel} disabled={pending} style={btnSecondary}>
          {t("staffUsers.cancel")}
        </button>
        <button type="submit" disabled={pending} style={pending ? btnPrimaryDisabled : btnPrimary}>
          {pending ? t("staffUsers.saving") : t("staffUsers.save")}
        </button>
      </div>
    </form>
  );
}

// ── Reset-PIN form ──────────────────────────────────────────────────────────────

interface ResetPinFormProps {
  user: StaffUserAdmin;
  onDone: () => void;
  onCancel: () => void;
}

function ResetPinForm({ user, onDone, onCancel }: ResetPinFormProps) {
  const t = useTranslations("admin");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const pin = (fd.get("pin") as string).trim();
    startTransition(async () => {
      const result = await resetStaffUserPin(user.id, pin);
      if (!result.ok) { setError(result.error); return; }
      onDone();
    });
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
      <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--foreground)", fontFamily: "var(--font-display-stack)" }}>
        {t("staffUsers.resetPinFor", { name: user.display_name })}
      </h3>
      {error ? <div style={errorBanner}>{error}</div> : null}
      <div style={{ maxWidth: 240 }}>
        <label htmlFor="reset-pin" style={adminLabel}>{t("staffUsers.fields.newPin")}</label>
        <input
          id="reset-pin"
          name="pin"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          required
          pattern="\d{4,12}"
          title={t("staffUsers.hints.pin")}
          style={adminInput}
          disabled={pending}
        />
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingTop: 4 }}>
        <button type="button" onClick={onCancel} disabled={pending} style={btnSecondary}>
          {t("staffUsers.cancel")}
        </button>
        <button type="submit" disabled={pending} style={pending ? btnPrimaryDisabled : btnPrimary}>
          {pending ? t("staffUsers.saving") : t("staffUsers.resetPin")}
        </button>
      </div>
    </form>
  );
}

// ── List ────────────────────────────────────────────────────────────────────────

interface StaffUsersClientProps {
  initialUsers: StaffUserAdmin[];
  /** True when the server failed to fetch the list (vs. a genuine empty list). */
  loadError?: boolean;
}

export function StaffUsersClient({ initialUsers, loadError = false }: StaffUsersClientProps) {
  const t = useTranslations("admin");
  const router = useRouter();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [items, setItems] = useState<StaffUserAdmin[]>(initialUsers);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<StaffUserAdmin | null>(null);
  const [resettingUser, setResettingUser] = useState<StaffUserAdmin | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function upsert(list: StaffUserAdmin[], user: StaffUserAdmin): StaffUserAdmin[] {
    const idx = list.findIndex((u) => u.id === user.id);
    if (idx === -1) return [...list, user];
    return list.map((u) => (u.id === user.id ? user : u));
  }

  const sorted = [...items].sort((a, b) => a.id - b.id);

  async function handleToggleActive(user: StaffUserAdmin) {
    const next = !user.is_active;
    if (next === false) {
      const ok = await confirm({
        title: t("staffUsers.confirmDisableTitle", { name: user.display_name }),
        description: t("staffUsers.confirmDisableDesc"),
      });
      if (!ok) return;
    }
    setActionError(null);
    setBusyId(user.id);
    // Optimistic
    setItems((prev) => prev.map((u) => (u.id === user.id ? { ...u, is_active: next } : u)));
    startTransition(async () => {
      const result = await setStaffUserActive(user.id, next);
      setBusyId(null);
      if (!result.ok) {
        setActionError(result.error);
        setItems((prev) => prev.map((u) => (u.id === user.id ? { ...u, is_active: user.is_active } : u)));
        return;
      }
      setItems((prev) => upsert(prev, result.data));
      router.refresh();
    });
  }

  function closeForms() {
    setShowForm(false);
    setEditingUser(null);
    setResettingUser(null);
  }

  return (
    <>
    {confirmDialog}
    <div style={{ display: "grid", gap: 24 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
        <div>
          <h1 style={pageTitle}>{t("staffUsers.title")}</h1>
          <p style={pageSubtitle}>{t("staffUsers.subtitle")}</p>
        </div>
        {!loadError && !showForm && !editingUser && !resettingUser ? (
          <button type="button" onClick={() => setShowForm(true)} style={btnPrimary}>
            ＋ {t("staffUsers.newUser")}
          </button>
        ) : null}
      </div>

      {actionError ? <div style={errorBanner}>{actionError}</div> : null}

      {loadError ? (
        <StateCard
          variant="error"
          title={t("staffUsers.loadErrorTitle")}
          hint={t("staffUsers.loadErrorHint")}
          onRetry={() => router.refresh()}
        />
      ) : (
      <>

      {showForm ? (
        <div style={adminCard}>
          <UserForm
            onDone={(user) => {
              setItems((prev) => upsert(prev, user));
              closeForms();
              router.refresh();
            }}
            onCancel={closeForms}
          />
        </div>
      ) : null}

      {editingUser ? (
        <div style={adminCard}>
          <UserForm
            initial={editingUser}
            onDone={(user) => {
              setItems((prev) => upsert(prev, user));
              closeForms();
              router.refresh();
            }}
            onCancel={closeForms}
          />
        </div>
      ) : null}

      {resettingUser ? (
        <div style={adminCard}>
          <ResetPinForm
            user={resettingUser}
            onDone={() => { closeForms(); router.refresh(); }}
            onCancel={closeForms}
          />
        </div>
      ) : null}

      {sorted.length === 0 ? (
        <div style={adminCard}>{t("staffUsers.noUsers")}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sorted.map((user) => {
            const busy = busyId === user.id;
            return (
              <article
                key={user.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  background: "var(--background)",
                  border: "1px solid var(--line)",
                  borderRadius: 14,
                  padding: "14px 18px",
                  flexWrap: "wrap",
                  opacity: user.is_active ? 1 : 0.6,
                }}
              >
                <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 700, fontSize: 15.5, color: "var(--foreground)" }}>{user.display_name}</span>
                  <span style={{ fontSize: 12.5, color: "var(--muted-2)" }}>@{user.username}</span>
                  <span style={{ ...pillBadge, ...roleBadge(user.role), fontSize: 11, padding: "4px 10px" }}>
                    {t(`staffUsers.role.${user.role}`)}
                  </span>
                  {!user.is_active ? (
                    <span style={{ ...pillBadge, background: "#EEE8E5", color: "#8A7873", fontSize: 11, padding: "4px 10px" }}>
                      {t("staffUsers.disabled")}
                    </span>
                  ) : null}
                </div>

                <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => { closeForms(); setEditingUser(user); }}
                    disabled={busy}
                    aria-label={t("staffUsers.editAria", { name: user.display_name })}
                    style={btnSecondary}
                  >
                    {t("staffUsers.edit")}
                  </button>
                  <button
                    type="button"
                    onClick={() => { closeForms(); setResettingUser(user); }}
                    disabled={busy}
                    aria-label={t("staffUsers.resetPinAria", { name: user.display_name })}
                    style={btnSecondary}
                  >
                    {t("staffUsers.resetPin")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleToggleActive(user)}
                    disabled={busy}
                    aria-label={
                      user.is_active
                        ? t("staffUsers.disableAria", { name: user.display_name })
                        : t("staffUsers.enableAria", { name: user.display_name })
                    }
                    style={user.is_active ? btnDanger : btnSecondary}
                  >
                    {busy
                      ? t("staffUsers.saving")
                      : user.is_active
                        ? t("staffUsers.disable")
                        : t("staffUsers.enable")}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
      </>
      )}
    </div>
    </>
  );
}

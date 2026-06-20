"use client";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition, useState, useSyncExternalStore } from "react";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import {
  createSession,
  updateSession,
  deleteSession,
  setCurrentSession,
  setSessionScheduled,
  setSessionClosed,
} from "@/lib/server/actions/admin";
import { LiveDot } from "@/components/ui";
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
  sessionStatusStyle,
  pillBadge,
  errorBanner,
} from "@/components/admin/adminStyles";
import type { SessionRead, SessionCreate, SessionUpdate, SessionStatus } from "@/lib/types";

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Format a time value for display.
 * @param value - ISO datetime string or "HH:MM" time string.
 * @param mounted - true after client hydration; when false, ISO strings render as
 *   a stable UTC placeholder to avoid SSR/client toLocaleTimeString mismatch. */
function formatTime(value: string | null | undefined, mounted: boolean): string {
  if (!value) return "—";
  if (value.includes("T")) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) {
      if (!mounted) {
        // During SSR / before hydration: render a stable UTC time to avoid mismatch.
        return d.toISOString().slice(11, 16) + " UTC";
      }
      return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    }
  }
  const [h, m] = value.split(":");
  const hour = parseInt(h, 10);
  const min = m ?? "00";
  const suffix = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 || 12;
  return `${h12}:${min} ${suffix}`;
}

type StatusAction = "" | "current" | "scheduled" | "closed";

// ─── Session form ──────────────────────────────────────────────────────────────

interface SessionFormProps {
  initial?: SessionRead;
  onDone: () => void;
  onCancel: () => void;
}

function SessionForm({ initial, onDone, onCancel }: SessionFormProps) {
  const t = useTranslations("admin.sessions");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);

    function fv(name: string): string {
      return (fd.get(name) as string | null) ?? "";
    }
    function fvNull(name: string): string | null {
      const v = fv(name).trim();
      return v === "" ? null : v;
    }

    startTransition(async () => {
      if (initial) {
        const body: SessionUpdate = {
          name: fv("name").trim() || undefined,
          service_date: fv("service_date").trim() || undefined,
          start_time: fvNull("start_time"),
          end_time: fvNull("end_time"),
          kitchen_last_order_time: fvNull("kitchen_last_order_time"),
          bar_last_order_time: fvNull("bar_last_order_time"),
          status: (fvNull("status") as SessionStatus) ?? undefined,
        };
        const result = await updateSession(initial.id, body);
        if (!result.ok) { setError(result.error); return; }
      } else {
        const body: SessionCreate = {
          name: fv("name").trim(),
          service_date: fv("service_date").trim(),
          start_time: fvNull("start_time"),
          end_time: fvNull("end_time"),
          kitchen_last_order_time: fvNull("kitchen_last_order_time"),
          bar_last_order_time: fvNull("bar_last_order_time"),
          status: (fvNull("status") as SessionStatus) ?? "scheduled",
        };
        const result = await createSession(body);
        if (!result.ok) { setError(result.error); return; }
      }
      onDone();
    });
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "grid", gap: 16 }}>
      <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--foreground)", fontFamily: "var(--font-display-stack)" }}>
        {initial ? t("editSession") : t("newSession")}
      </h3>

      {error ? (
        <div style={errorBanner}>{error}</div>
      ) : null}

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
        <div style={{ gridColumn: "1 / -1" }}>
          <label htmlFor="sf-name" style={adminLabel}>{t("fields.name")}</label>
          <input id="sf-name" name="name" required={!initial} defaultValue={initial?.name ?? ""} style={adminInput} disabled={pending} />
        </div>

        <div>
          <label htmlFor="sf-service-date" style={adminLabel}>{t("fields.serviceDate")}</label>
          <input id="sf-service-date" name="service_date" type="date" required={!initial} defaultValue={initial?.service_date ?? ""} style={adminInput} disabled={pending} />
        </div>

        <div>
          <label htmlFor="sf-status" style={adminLabel}>{t("fields.status")}</label>
          <select id="sf-status" name="status" defaultValue={initial?.status ?? "scheduled"} style={{ ...adminInput, paddingRight: 36 }} disabled={pending}>
            <option value="scheduled">{t("status.scheduled")}</option>
            <option value="active">{t("status.active")}</option>
            <option value="winding_down">{t("status.winding_down")}</option>
            <option value="closed">{t("status.closed")}</option>
          </select>
        </div>

        <div>
          <label htmlFor="sf-start" style={adminLabel}>{t("fields.startTime")}</label>
          <input id="sf-start" name="start_time" type="datetime-local" defaultValue={initial?.start_time ? new Date(initial.start_time).toISOString().slice(0, 16) : ""} style={adminInput} disabled={pending} />
        </div>

        <div>
          <label htmlFor="sf-end" style={adminLabel}>{t("fields.endTime")}</label>
          <input id="sf-end" name="end_time" type="datetime-local" defaultValue={initial?.end_time ? new Date(initial.end_time).toISOString().slice(0, 16) : ""} style={adminInput} disabled={pending} />
        </div>

        <div>
          <label htmlFor="sf-kitchen" style={adminLabel}>{t("fields.kitchenCutoff")}</label>
          <input id="sf-kitchen" name="kitchen_last_order_time" type="time" defaultValue={initial?.kitchen_last_order_time?.slice(0, 5) ?? ""} style={adminInput} disabled={pending} />
        </div>

        <div>
          <label htmlFor="sf-bar" style={adminLabel}>{t("fields.barCutoff")}</label>
          <input id="sf-bar" name="bar_last_order_time" type="time" defaultValue={initial?.bar_last_order_time?.slice(0, 5) ?? ""} style={adminInput} disabled={pending} />
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

// ─── Sessions client island ───────────────────────────────────────────────────

interface SessionsClientProps {
  initialSessions: SessionRead[];
}

export function SessionsClient({ initialSessions }: SessionsClientProps) {
  const t = useTranslations("admin.sessions");
  const router = useRouter();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [showForm, setShowForm] = useState(false);
  const [editingSession, setEditingSession] = useState<SessionRead | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [statusActions, setStatusActions] = useState<Record<number, StatusAction>>({});
  // Mounted flag via useSyncExternalStore: toLocaleTimeString differs between SSR and client
  // runtimes. Render stable UTC strings during SSR; switch to locale-aware display after hydration.
  // useSyncExternalStore is the lint-safe way to read client-only state with a stable server snapshot.
  const mounted = useSyncExternalStore(
    () => () => {},         // no external events to subscribe to
    () => true,             // client snapshot: always mounted after hydration
    () => false,            // server snapshot: not yet mounted
  );

  const [sessions, setSessions] = useState<SessionRead[]>(initialSessions);

  function upsertSession(list: SessionRead[], session: SessionRead): SessionRead[] {
    const idx = list.findIndex((s) => s.id === session.id);
    if (idx === -1) return [session, ...list];
    return list.map((s) => (s.id === session.id ? session : s));
  }

  const sorted = [...sessions].sort((a, b) => {
    if (a.status === "active" && b.status !== "active") return -1;
    if (b.status === "active" && a.status !== "active") return 1;
    return b.service_date.localeCompare(a.service_date) || b.id - a.id;
  });

  const [actionPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleDelete(session: SessionRead) {
    if (!await confirm({
      title: t("confirmDeleteTitle", { name: session.name }),
      description: t("confirmDeleteDesc"),
    })) return;

    setActionError(null);
    setBusyId(session.id);
    setSessions((prev) => prev.filter((s) => s.id !== session.id));
    startTransition(async () => {
      const result = await deleteSession(session.id);
      setBusyId(null);
      if (!result.ok) {
        setActionError(result.error);
        setSessions((prev) => [session, ...prev]);
        return;
      }
      if (editingSession?.id === session.id) setEditingSession(null);
      router.refresh();
    });
  }

  async function handleStatusAction(session: SessionRead) {
    const action = statusActions[session.id] ?? "";
    if (!action) return;

    setActionError(null);
    setBusyId(session.id);
    startTransition(async () => {
      let result;
      if (action === "current") result = await setCurrentSession(session.id);
      else if (action === "scheduled") result = await setSessionScheduled(session.id);
      else result = await setSessionClosed(session.id);

      setBusyId(null);
      if (!result.ok) {
        setActionError(result.error);
      } else {
        setSessions((prev) => upsertSession(prev, result.data));
        setStatusActions((prev) => ({ ...prev, [session.id]: "" }));
        router.refresh();
      }
    });
  }

  return (
    <>
    {confirmDialog}
    <div style={{ display: "grid", gap: 24 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
        <div>
          <h1 style={pageTitle}>{t("title")}</h1>
          <p style={pageSubtitle}>{t("subtitle")}</p>
        </div>
        {!showForm && !editingSession ? (
          <button type="button" onClick={() => setShowForm(true)} style={btnPrimary}>
            ＋ {t("newSession")}
          </button>
        ) : null}
      </div>

      {actionError ? (
        <div style={errorBanner}>{actionError}</div>
      ) : null}

      {/* Create form */}
      {showForm ? (
        <div style={adminCard}>
          <SessionForm onDone={() => { setShowForm(false); router.refresh(); }} onCancel={() => setShowForm(false)} />
        </div>
      ) : null}

      {/* Edit form */}
      {editingSession ? (
        <div style={adminCard}>
          <SessionForm
            initial={editingSession}
            onDone={() => { setEditingSession(null); router.refresh(); }}
            onCancel={() => setEditingSession(null)}
          />
        </div>
      ) : null}

      {/* Session list */}
      {sorted.length === 0 ? (
        <div style={adminCard}>{t("noSessions")}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sorted.map((session) => {
            const busy = busyId === session.id || (actionPending && busyId === session.id);
            const selectedAction = statusActions[session.id] ?? "";
            const badgeStyle = sessionStatusStyle(session.status);
            const isActive = session.status === "active";
            const isClosed = session.status === "closed";

            return (
              <article
                key={session.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  background: isActive ? "#FCF1F4" : "var(--background)",
                  border: isActive ? "1.5px solid #E0607E" : "1px solid var(--line)",
                  borderRadius: 14,
                  padding: "15px 18px",
                  flexWrap: "wrap",
                  opacity: isClosed ? 0.66 : 1,
                  transition: "opacity 0.2s",
                }}
              >
                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 700, fontSize: 15.5, color: "var(--foreground)" }}>
                      {session.name}
                    </span>
                    <span style={{ ...pillBadge, ...badgeStyle, display: "inline-flex" }}>
                      {isActive && (
                        <LiveDot color="#7BAE8E" size={6} />
                      )}
                      {t(`status.${session.status}`)}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted-2)", marginTop: 4 }}>
                    {session.service_date}
                    {session.start_time ? ` · ${formatTime(session.start_time, mounted)}–${formatTime(session.end_time, mounted)}` : ""}
                    {session.kitchen_last_order_time ? ` · 后厨 ${formatTime(session.kitchen_last_order_time, mounted)}` : ""}
                    {session.bar_last_order_time ? ` · 吧台 ${formatTime(session.bar_last_order_time, mounted)}` : ""}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => { setShowForm(false); setEditingSession(session); }}
                    disabled={busy}
                    style={btnSecondary}
                  >
                    {t("edit")}
                  </button>

                  <Link href={`/admin/sessions/${session.id}/summary`} style={btnSecondary}>
                    {t("viewSummary")}
                  </Link>

                  {/* Status picker */}
                  {!isClosed && (
                    <select
                      value={selectedAction}
                      onChange={(e) =>
                        setStatusActions((prev) => ({ ...prev, [session.id]: e.target.value as StatusAction }))
                      }
                      disabled={busy}
                      aria-label={`${t("changeStatus")} — ${session.name}`}
                      style={{
                        ...adminInput,
                        width: "auto",
                        minHeight: "var(--tap-min)",
                        padding: "0 10px",
                        fontSize: 12.5,
                        color: "var(--foreground)",
                      }}
                    >
                      <option value="">{t("changeStatus")}</option>
                      <option value="current">{t("makeCurrent")}</option>
                      <option value="scheduled">{t("setScheduled")}</option>
                      <option value="closed">{t("setClosed")}</option>
                    </select>
                  )}

                  {!isClosed && (
                    <button
                      type="button"
                      onClick={() => void handleStatusAction(session)}
                      disabled={busy || !selectedAction}
                      style={{
                        minHeight: "var(--tap-min)",
                        padding: "0 14px",
                        borderRadius: 10,
                        border: "none",
                        background: busy || !selectedAction ? "var(--muted-2)" : "#3A2A30",
                        color: "#fff",
                        fontWeight: 700,
                        cursor: busy || !selectedAction ? "not-allowed" : "pointer",
                        fontSize: 12.5,
                      }}
                    >
                      {busy ? t("applying") : (isActive ? "当前 ★" : t("applyStatus"))}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => void handleDelete(session)}
                    disabled={busy}
                    style={btnDanger}
                  >
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

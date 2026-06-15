"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import SessionForm from "@/components/admin/SessionForm";
import {
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  apiPostNoBody,
} from "@/lib/api";
import type {
  SessionCreatePayload,
  SessionItem,
  SessionUpdatePayload,
} from "@/lib/types";

type SessionAction = "" | "current" | "scheduled" | "closed";

const cardStyle = {
  border: "1px solid #e5e7eb",
  borderRadius: 18,
  background: "#ffffff",
  padding: 18,
  boxShadow: "0 5px 18px rgba(17, 24, 39, 0.05)",
} as const;

const secondaryButtonStyle = {
  minHeight: 40,
  padding: "9px 14px",
  borderRadius: 11,
  border: "1px solid #d1d5db",
  background: "#ffffff",
  color: "#111827",
  fontWeight: 700,
  cursor: "pointer",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
} as const;

function statusLabel(status: SessionItem["status"]) {
  switch (status) {
    case "scheduled":
      return "Scheduled";
    case "active":
      return "Current";
    case "winding_down":
      return "Winding Down";
    case "closed":
      return "Closed";
    default:
      return status;
  }
}

function statusStyle(status: SessionItem["status"]) {
  if (status === "active") {
    return { background: "#dcfce7", color: "#166534" };
  }
  if (status === "closed") {
    return { background: "#f3f4f6", color: "#4b5563" };
  }
  if (status === "winding_down") {
    return { background: "#ffedd5", color: "#9a3412" };
  }
  return { background: "#dbeafe", color: "#1d4ed8" };
}

function formatTime(value?: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function AdminSessionsPage() {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingSession, setEditingSession] = useState<SessionItem | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
  const [selectedActions, setSelectedActions] = useState<
    Record<number, SessionAction>
  >({});

  const sortedSessions = useMemo(
    () =>
      [...sessions].sort((a, b) => {
        if (a.status === "active" && b.status !== "active") return -1;
        if (b.status === "active" && a.status !== "active") return 1;
        return b.service_date.localeCompare(a.service_date) || b.id - a.id;
      }),
    [sessions],
  );

  async function loadSessions() {
    setLoading(true);
    setError("");
    try {
      const data = await apiGet<SessionItem[]>("/sessions");
      if (!Array.isArray(data)) {
        throw new Error("Expected an array from /sessions");
      }
      setSessions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sessions");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSessions();
  }, []);

  async function handleCreateSession(payload: SessionCreatePayload) {
    await apiPost<SessionItem>("/sessions", payload);
    await loadSessions();
  }

  async function handleUpdateSession(
    sessionId: number,
    payload: SessionUpdatePayload,
  ) {
    await apiPatch<SessionItem>(`/sessions/${sessionId}`, payload);
    setEditingSession(null);
    await loadSessions();
  }

  async function handleDelete(session: SessionItem) {
    const confirmed = window.confirm(`Delete session "${session.name}"?`);
    if (!confirmed) return;

    try {
      setActionLoadingId(session.id);
      await apiDelete<{ success: boolean; deleted_id: number }>(
        `/sessions/${session.id}`,
      );
      if (editingSession?.id === session.id) setEditingSession(null);
      await loadSessions();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Failed to delete session");
    } finally {
      setActionLoadingId(null);
    }
  }

  async function applyStatusAction(session: SessionItem) {
    const action = selectedActions[session.id] ?? "";
    if (!action) return;

    try {
      setActionLoadingId(session.id);
      if (action === "current") {
        await apiPostNoBody(`/sessions/${session.id}/set-current`);
      } else if (action === "scheduled") {
        await apiPostNoBody(`/sessions/${session.id}/set-scheduled`);
      } else if (action === "closed") {
        await apiPostNoBody(`/sessions/${session.id}/set-closed`);
      }
      setSelectedActions((current) => ({ ...current, [session.id]: "" }));
      await loadSessions();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Failed to change status");
    } finally {
      setActionLoadingId(null);
    }
  }

  return (
    <section style={{ display: "grid", gap: 22 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 30 }}>Sessions</h1>
        <p style={{ color: "#6b7280", margin: "8px 0 0" }}>
          Create event sessions, set the current session, and review summaries.
        </p>
      </div>

      <div style={cardStyle}>
        <SessionForm
          editingSession={editingSession}
          onCreate={handleCreateSession}
          onUpdate={handleUpdateSession}
          onCancelEdit={() => setEditingSession(null)}
        />
      </div>

      <div>
        <h2 style={{ margin: "0 0 12px", fontSize: 22 }}>Session List</h2>

        {loading ? <div style={cardStyle}>Loading...</div> : null}
        {error ? (
          <div style={{ ...cardStyle, borderColor: "#fecaca", color: "#b91c1c" }}>
            {error}
          </div>
        ) : null}
        {!loading && !error && sortedSessions.length === 0 ? (
          <div style={cardStyle}>No sessions yet.</div>
        ) : null}

        <div style={{ display: "grid", gap: 14 }}>
          {sortedSessions.map((session) => {
            const busy = actionLoadingId === session.id;
            const selectedAction = selectedActions[session.id] ?? "";
            const badgeStyle = statusStyle(session.status);

            return (
              <article key={session.id} style={cardStyle}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 14,
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        flexWrap: "wrap",
                      }}
                    >
                      <h3 style={{ margin: 0, fontSize: 20 }}>{session.name}</h3>
                      <span
                        style={{
                          ...badgeStyle,
                          padding: "5px 10px",
                          borderRadius: 999,
                          fontSize: 12,
                          fontWeight: 800,
                        }}
                      >
                        {statusLabel(session.status)}
                      </span>
                    </div>
                    <div style={{ color: "#6b7280", marginTop: 6 }}>
                      {session.service_date} · {formatTime(session.start_time)}–
                      {formatTime(session.end_time)}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: 16,
                        flexWrap: "wrap",
                        marginTop: 10,
                        fontSize: 13,
                        color: "#4b5563",
                      }}
                    >
                      <span>
                        Kitchen cutoff: {formatTime(session.kitchen_last_order_time)}
                      </span>
                      <span>Bar cutoff: {formatTime(session.bar_last_order_time)}</span>
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 9,
                    flexWrap: "wrap",
                    alignItems: "center",
                    marginTop: 16,
                    paddingTop: 16,
                    borderTop: "1px solid #f0f1f4",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setEditingSession(session)}
                    disabled={busy}
                    style={secondaryButtonStyle}
                  >
                    Edit
                  </button>

                  <Link
                    href={`/admin/sessions/${session.id}/summary`}
                    style={secondaryButtonStyle}
                  >
                    View Summary
                  </Link>

                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      flexWrap: "wrap",
                      marginLeft: "auto",
                    }}
                  >
                    <select
                      value={selectedAction}
                      onChange={(event) =>
                        setSelectedActions((current) => ({
                          ...current,
                          [session.id]: event.target.value as SessionAction,
                        }))
                      }
                      disabled={busy}
                      aria-label={`Change status for ${session.name}`}
                      style={{
                        minHeight: 40,
                        padding: "8px 36px 8px 12px",
                        borderRadius: 11,
                        border: "1px solid #d1d5db",
                        background: "#ffffff",
                        color: "#111827",
                      }}
                    >
                      <option value="">Change status…</option>
                      <option value="current">Make current</option>
                      <option value="scheduled">Set scheduled</option>
                      <option value="closed">Set closed</option>
                    </select>

                    <button
                      type="button"
                      onClick={() => void applyStatusAction(session)}
                      disabled={busy || !selectedAction}
                      style={{
                        minHeight: 40,
                        padding: "9px 15px",
                        borderRadius: 11,
                        border: "none",
                        background: busy || !selectedAction ? "#c7c9d1" : "#4f46e5",
                        color: "#ffffff",
                        fontWeight: 800,
                        cursor: busy || !selectedAction ? "not-allowed" : "pointer",
                      }}
                    >
                      {busy ? "Saving..." : "Apply"}
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleDelete(session)}
                      disabled={busy}
                      style={{
                        minHeight: 40,
                        padding: "9px 14px",
                        borderRadius: 11,
                        border: "1px solid #fecaca",
                        background: "#fff7f7",
                        color: "#b91c1c",
                        fontWeight: 800,
                        cursor: busy ? "not-allowed" : "pointer",
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

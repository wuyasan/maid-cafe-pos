"use client";

import { useEffect, useState } from "react";
import SessionForm from "@/components/admin/SessionForm";
import { apiDelete, apiGet, apiPatch, apiPost, apiPostNoBody } from "@/lib/api";
import type { SessionCreatePayload, SessionItem, SessionUpdatePayload } from "@/lib/types";
import Link from "next/link";

export default function AdminSessionsPage() {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingSession, setEditingSession] = useState<SessionItem | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);

  async function loadSessions() {
    setLoading(true);
    setError("");

    try {
      const data = await apiGet<unknown>("/sessions");

      if (!Array.isArray(data)) {
        console.error("Unexpected /sessions response:", data);
        throw new Error("Expected an array from /sessions");
      }

      setSessions(data as SessionItem[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sessions");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSessions();
  }, []);

  async function handleCreateSession(payload: SessionCreatePayload) {
    await apiPost<SessionItem>("/sessions", payload);
    await loadSessions();
  }

  async function handleUpdateSession(sessionId: number, payload: SessionUpdatePayload) {
    await apiPatch<SessionItem>(`/sessions/${sessionId}`, payload);
    setEditingSession(null);
    await loadSessions();
  }

  async function handleSetCurrent(session: SessionItem) {
    try {
      setActionLoadingId(session.id);
      await apiPostNoBody<SessionItem>(`/sessions/${session.id}/set-current`);
      if (editingSession?.id === session.id) {
        setEditingSession({
          ...editingSession,
          status: "active",
        });
      }
      await loadSessions();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to set current session");
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleDelete(session: SessionItem) {
    const confirmed = window.confirm(`Delete session "${session.name}"?`);
    if (!confirmed) return;

    try {
      setActionLoadingId(session.id);
      await apiDelete<{ success: boolean; deleted_id: number }>(`/sessions/${session.id}`);
      if (editingSession?.id === session.id) {
        setEditingSession(null);
      }
      await loadSessions();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete session");
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleSetScheduled(session: SessionItem) {
    try {
      setActionLoadingId(session.id);
      await apiPostNoBody<SessionItem>(`/sessions/${session.id}/set-scheduled`);
      await loadSessions();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to set session scheduled");
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleSetClosed(session: SessionItem) {
    try {
      setActionLoadingId(session.id);
      await apiPostNoBody<SessionItem>(`/sessions/${session.id}/set-closed`);
      await loadSessions();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to set session closed");
    } finally {
      setActionLoadingId(null);
    }
  }

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <div>
        <h1 style={{ marginBottom: 8 }}>Sessions</h1>
        <p style={{ marginTop: 0, color: "#4b5563" }}>
          Create, edit, set current, and delete service sessions.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "380px 1fr",
          gap: 24,
          alignItems: "start",
        }}
      >
        <SessionForm
          editingSession={editingSession}
          onCreate={handleCreateSession}
          onUpdate={handleUpdateSession}
          onCancelEdit={() => setEditingSession(null)}
        />

        <section
          style={{
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            padding: 20,
          }}
        >
          <h3 style={{ marginTop: 0 }}>Session List</h3>

          {loading ? <p>Loading...</p> : null}
          {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}

          {!loading && !error && sessions.length === 0 ? <p>No sessions yet.</p> : null}

          <div style={{ display: "grid", gap: 16 }}>
            {sessions.map((session) => (
              <div
                key={session.id}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 14,
                  padding: 16,
                  display: "grid",
                  gap: 10,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <strong>{session.name}</strong>
                  <span
                    style={{
                      fontSize: 12,
                      padding: "2px 8px",
                      borderRadius: 999,
                      background:
                        session.status === "active"
                          ? "#dcfce7"
                          : session.status === "scheduled"
                          ? "#e0f2fe"
                          : session.status === "winding_down"
                          ? "#fef3c7"
                          : "#f3f4f6",
                    }}
                  >
                    {session.status}
                  </span>
                </div>

                <div style={{ fontSize: 14, color: "#4b5563" }}>
                  <div>ID: {session.id}</div>
                  <div>Service Date: {session.service_date}</div>
                  <div>Start: {session.start_time || "—"}</div>
                  <div>End: {session.end_time || "—"}</div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => setEditingSession(session)}
                    disabled={actionLoadingId === session.id}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 10,
                      border: "1px solid #d1d5db",
                      background: "#fff",
                      cursor: "pointer",
                    }}
                  >
                    Edit
                  </button>

                  <Link
                    href={`/admin/sessions/${session.id}/summary`}
                    style={{
                      textDecoration: "none",
                      padding: "8px 12px",
                      borderRadius: 10,
                      border: "1px solid #d1d5db",
                      background: "#fff",
                      color: "#111827",
                    }}
                  >
                    Summary
                  </Link>

                  <button
                    type="button"
                    onClick={() => handleSetCurrent(session)}
                    disabled={actionLoadingId === session.id}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 10,
                      border: "none",
                      background: "#2563eb",
                      color: "#fff",
                      cursor: "pointer",
                    }}
                  >
                    {actionLoadingId === session.id ? "Saving..." : "Set Current"}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSetScheduled(session)}
                    disabled={actionLoadingId === session.id}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 10,
                      border: "none",
                      background: "#6b7280",
                      color: "#fff",
                      cursor: "pointer",
                    }}
                  >
                    {actionLoadingId === session.id ? "Saving..." : "Set Scheduled"}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSetClosed(session)}
                    disabled={actionLoadingId === session.id}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 10,
                      border: "none",
                      background: "#111827",
                      color: "#fff",
                      cursor: "pointer",
                    }}
                  >
                    {actionLoadingId === session.id ? "Saving..." : "Set Closed"}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDelete(session)}
                    disabled={actionLoadingId === session.id}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 10,
                      border: "none",
                      background: "#dc2626",
                      color: "#fff",
                      cursor: "pointer",
                    }}
                  >
                    {actionLoadingId === session.id ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
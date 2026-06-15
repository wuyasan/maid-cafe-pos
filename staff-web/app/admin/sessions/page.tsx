"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

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

function formatCutoff(value?: string | null) {
  if (!value) return "No cutoff";
  return value.slice(0, 5);
}

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
    loadSessions();
  }, []);

  async function handleCreateSession(payload: SessionCreatePayload) {
    await apiPost("/sessions", payload);
    await loadSessions();
  }

  async function handleUpdateSession(
    sessionId: number,
    payload: SessionUpdatePayload
  ) {
    await apiPatch(`/sessions/${sessionId}`, payload);
    setEditingSession(null);
    await loadSessions();
  }

  async function handleSetCurrent(session: SessionItem) {
    try {
      setActionLoadingId(session.id);
      await apiPostNoBody(`/sessions/${session.id}/set-current`);
      await loadSessions();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to set current session");
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleSetScheduled(session: SessionItem) {
    try {
      setActionLoadingId(session.id);
      await apiPostNoBody(`/sessions/${session.id}/set-scheduled`);
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
      await apiPostNoBody(`/sessions/${session.id}/set-closed`);
      await loadSessions();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to set session closed");
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleDelete(session: SessionItem) {
    const confirmed = window.confirm(`Delete session "${session.name}"?`);
    if (!confirmed) return;

    try {
      setActionLoadingId(session.id);
      await apiDelete<{ success: boolean; deleted_id: number }>(
        `/sessions/${session.id}`
      );
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

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: 24 }}>
      <h1>Sessions</h1>
      <p style={{ color: "#6b7280" }}>
        Set separate Kitchen and Bar last-order times for each service session.
      </p>

      <SessionForm
        editingSession={editingSession}
        onCreate={handleCreateSession}
        onUpdate={handleUpdateSession}
        onCancelEdit={() => setEditingSession(null)}
      />

      <section style={{ marginTop: 24 }}>
        <h3>Session List</h3>
        {loading ? <p>Loading...</p> : null}
        {error ? <p style={{ color: "#dc2626" }}>{error}</p> : null}
        {!loading && !error && sessions.length === 0 ? (
          <p>No sessions yet.</p>
        ) : null}

        <div style={{ display: "grid", gap: 12 }}>
          {sessions.map((session) => (
            <article
              key={session.id}
              style={{
                padding: 16,
                border: "1px solid #e5e7eb",
                borderRadius: 14,
                background: "#fff",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ display: "grid", gap: 5 }}>
                  <strong>
                    {session.name} · {session.status}
                  </strong>
                  <span style={{ color: "#4b5563", fontSize: 14 }}>
                    Service Date: {session.service_date}
                  </span>
                  <span style={{ color: "#4b5563", fontSize: 14 }}>
                    Start: {session.start_time || "—"} · End: {session.end_time || "—"}
                  </span>
                  <span style={{ fontSize: 14 }}>
                    Kitchen Last Order: <strong>{formatCutoff(session.kitchen_last_order_time)}</strong>
                  </span>
                  <span style={{ fontSize: 14 }}>
                    Bar Last Order: <strong>{formatCutoff(session.bar_last_order_time)}</strong>
                  </span>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button onClick={() => setEditingSession(session)}>Edit</button>
                  <Link href={`/admin/sessions/${session.id}/summary`}>Summary</Link>
                  <button onClick={() => handleSetCurrent(session)}>
                    {actionLoadingId === session.id ? "Saving..." : "Set Current"}
                  </button>
                  <button onClick={() => handleSetScheduled(session)}>
                    Set Scheduled
                  </button>
                  <button onClick={() => handleSetClosed(session)}>Set Closed</button>
                  <button
                    onClick={() => handleDelete(session)}
                    style={{ background: "#dc2626", color: "#fff" }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

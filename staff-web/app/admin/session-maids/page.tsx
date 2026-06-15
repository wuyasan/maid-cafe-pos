"use client";

import { useEffect, useState } from "react";
import SessionMaidForm from "@/components/admin/SessionMaidForm";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import type { Maid, SessionItem, SessionMaidCreatePayload, SessionMaidItem } from "@/lib/types";

export default function AdminSessionMaidsPage() {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [maids, setMaids] = useState<Maid[]>([]);
  const [sessionMaids, setSessionMaids] = useState<SessionMaidItem[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);

  async function loadBaseData() {
    setLoading(true);
    setError("");

    try {
      const [sessionsData, maidsData] = await Promise.all([
        apiGet<SessionItem[]>("/sessions"),
        apiGet<Maid[]>("/maids"),
      ]);

      setSessions(sessionsData);
      setMaids(maidsData);

      if (!selectedSessionId && sessionsData.length > 0) {
        setSelectedSessionId(sessionsData[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load base data");
    } finally {
      setLoading(false);
    }
  }

  async function loadSessionMaids(sessionId: number) {
    try {
      const data = await apiGet<SessionMaidItem[]>(`/session-maids?session_id=${sessionId}`);
      setSessionMaids(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load session maids");
    }
  }

  useEffect(() => {
    loadBaseData();
  }, []);

  useEffect(() => {
    if (selectedSessionId) {
      loadSessionMaids(selectedSessionId);
    } else {
      setSessionMaids([]);
    }
  }, [selectedSessionId]);

  async function handleCreate(payload: SessionMaidCreatePayload) {
    await apiPost<SessionMaidItem>("/session-maids", payload);
    await loadSessionMaids(payload.session_id);
  }

  async function handleToggle(item: SessionMaidItem) {
    try {
      setActionLoadingId(item.id);
      await apiPatch<SessionMaidItem>(`/session-maids/${item.id}/toggle`, {});
      if (selectedSessionId) {
        await loadSessionMaids(selectedSessionId);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to toggle session maid");
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleDelete(item: SessionMaidItem) {
    const confirmed = window.confirm("Delete this session-maid link?");
    if (!confirmed) return;

    try {
      setActionLoadingId(item.id);
      await apiDelete<{ success: boolean; deleted_id: number }>(`/session-maids/${item.id}`);
      if (selectedSessionId) {
        await loadSessionMaids(selectedSessionId);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete session maid");
    } finally {
      setActionLoadingId(null);
    }
  }

  function getMaidById(maidId: number) {
    return maids.find((m) => m.id === maidId) || null;
  }

  const selectedSession = sessions.find((s) => s.id === selectedSessionId) || null;

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <div>
        <h1 style={{ marginBottom: 8 }}>Session Maids</h1>
        <p style={{ marginTop: 0, color: "#4b5563" }}>
          Link maids to a session, toggle availability, and remove links.
        </p>
      </div>

      {loading ? <p>Loading...</p> : null}
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}

      {!loading ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "380px 1fr",
            gap: 24,
            alignItems: "start",
          }}
        >
          <SessionMaidForm
            sessions={sessions}
            maids={maids}
            selectedSessionId={selectedSessionId}
            onChangeSelectedSessionId={setSelectedSessionId}
            onSubmit={handleCreate}
          />

          <section
            style={{
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: 16,
              padding: 20,
            }}
          >
            <h3 style={{ marginTop: 0 }}>
              Session Maid List {selectedSession ? `— ${selectedSession.name}` : ""}
            </h3>

            {!selectedSessionId ? <p>Please select a session.</p> : null}
            {selectedSessionId && sessionMaids.length === 0 ? <p>No session maids yet.</p> : null}

            <div style={{ display: "grid", gap: 16 }}>
              {sessionMaids.map((item) => {
                const maid = getMaidById(item.maid_id);

                return (
                  <div
                    key={item.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "80px 1fr",
                      gap: 16,
                      padding: 16,
                      border: "1px solid #e5e7eb",
                      borderRadius: 14,
                    }}
                  >
                    <div
                      style={{
                        width: 80,
                        height: 80,
                        borderRadius: 12,
                        background: "#f3f4f6",
                        overflow: "hidden",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#9ca3af",
                        fontSize: 12,
                      }}
                    >
                      {maid?.photo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={maid.photo_url}
                          alt={maid.name}
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      ) : (
                        "No Image"
                      )}
                    </div>

                    <div style={{ display: "grid", gap: 10 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <strong>{maid?.name || `Maid #${item.maid_id}`}</strong>
                        <span
                          style={{
                            fontSize: 12,
                            padding: "2px 8px",
                            borderRadius: 999,
                            background: item.is_available ? "#dcfce7" : "#fee2e2",
                          }}
                        >
                          {item.is_available ? "Available" : "Unavailable"}
                        </span>
                      </div>

                      <div style={{ fontSize: 14, color: "#6b7280" }}>
                        <div>Session Maid ID: {item.id}</div>
                        <div>Maid ID: {item.maid_id}</div>
                      </div>

                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          onClick={() => handleToggle(item)}
                          disabled={actionLoadingId === item.id}
                          style={{
                            padding: "8px 12px",
                            borderRadius: 10,
                            border: "none",
                            background: item.is_available ? "#f59e0b" : "#10b981",
                            color: "#fff",
                            cursor: "pointer",
                          }}
                        >
                          {actionLoadingId === item.id
                            ? "Saving..."
                            : item.is_available
                            ? "Set Unavailable"
                            : "Set Available"}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDelete(item)}
                          disabled={actionLoadingId === item.id}
                          style={{
                            padding: "8px 12px",
                            borderRadius: 10,
                            border: "none",
                            background: "#dc2626",
                            color: "#fff",
                            cursor: "pointer",
                          }}
                        >
                          {actionLoadingId === item.id ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
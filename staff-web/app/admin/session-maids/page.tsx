"use client";

import { useEffect, useMemo, useState } from "react";

import { apiGet, apiPut } from "@/lib/api";
import type {
  Maid,
  SessionItem,
  SessionMaidItem,
} from "@/lib/types";

export default function AdminSessionMaidsPage() {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [maids, setMaids] = useState<Maid[]>([]);
  const [sessionMaids, setSessionMaids] = useState<SessionMaidItem[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingMaidId, setSavingMaidId] = useState<number | null>(null);

  async function loadBaseData() {
    setLoading(true);
    setError("");

    try {
      const [sessionRows, maidRows] = await Promise.all([
        apiGet<SessionItem[]>("/sessions"),
        apiGet<Maid[]>("/maids"),
      ]);

      setSessions(sessionRows);
      setMaids(maidRows.filter((maid) => maid.is_active));
      setSelectedSessionId((current) => current ?? sessionRows[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  async function loadSessionMaids(sessionId: number) {
    const rows = await apiGet<SessionMaidItem[]>(
      `/session-maids?session_id=${sessionId}`,
    );
    setSessionMaids(rows);
  }

  useEffect(() => {
    void loadBaseData();
  }, []);

  useEffect(() => {
    if (selectedSessionId) {
      void loadSessionMaids(selectedSessionId);
    } else {
      setSessionMaids([]);
    }
  }, [selectedSessionId]);

  const relationByMaidId = useMemo(
    () => new Map(sessionMaids.map((row) => [row.maid_id, row])),
    [sessionMaids],
  );

  const selectedSession =
    sessions.find((session) => session.id === selectedSessionId) ?? null;

  async function setAvailability(maidId: number, available: boolean) {
    if (!selectedSessionId) return;

    try {
      setSavingMaidId(maidId);
      await apiPut(
        `/session-maids/session/${selectedSessionId}/maid/${maidId}/availability?is_available=${available}`,
        {},
      );
      await loadSessionMaids(selectedSessionId);
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : "Failed to update availability",
      );
    } finally {
      setSavingMaidId(null);
    }
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div>
        <h1 style={{ marginBottom: 6 }}>Session Maids</h1>
        <p style={{ margin: 0, color: "#64748b" }}>
          Select a session on the left and set maid availability on the right.
        </p>
      </div>

      {loading ? <p>Loading...</p> : null}
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}

      {!loading ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(220px, 300px) minmax(0, 1fr)",
            gap: 20,
            alignItems: "start",
          }}
        >
          <aside
            style={{
              display: "grid",
              gap: 8,
              padding: 14,
              border: "1px solid #e2e8f0",
              borderRadius: 16,
              background: "#fff",
              position: "sticky",
              top: 16,
            }}
          >
            <strong>Sessions</strong>
            {sessions.map((session) => {
              const selected = session.id === selectedSessionId;
              return (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => setSelectedSessionId(session.id)}
                  style={{
                    textAlign: "left",
                    padding: "11px 12px",
                    borderRadius: 11,
                    border: selected
                      ? "2px solid #4f46e5"
                      : "1px solid #dbe3ee",
                    background: selected ? "#eef2ff" : "#fff",
                    cursor: "pointer",
                  }}
                >
                  <strong>{session.name}</strong>
                  <div style={{ color: "#64748b", fontSize: 13 }}>
                    {session.service_date} · {session.status}
                  </div>
                </button>
              );
            })}
          </aside>

          <main style={{ display: "grid", gap: 12 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <div>
                <h2 style={{ margin: "0 0 4px" }}>All Maids</h2>
                <div style={{ color: "#64748b" }}>
                  {selectedSession ? selectedSession.name : "Select a session"}
                </div>
              </div>
              <strong>
                {sessionMaids.filter((row) => row.is_available).length} available
              </strong>
            </div>

            {maids.map((maid) => {
              const relation = relationByMaidId.get(maid.id);
              const available = relation?.is_available ?? false;
              const saving = savingMaidId === maid.id;

              return (
                <section
                  key={maid.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 16,
                    flexWrap: "wrap",
                    padding: 15,
                    borderRadius: 15,
                    border: available
                      ? "2px solid #86efac"
                      : "1px solid #e2e8f0",
                    background: available ? "#f0fdf4" : "#fff",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    {maid.photo_url ? (
                      <img
                        src={maid.photo_url}
                        alt={maid.name}
                        style={{
                          width: 58,
                          height: 58,
                          borderRadius: "50%",
                          objectFit: "cover",
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 58,
                          height: 58,
                          display: "grid",
                          placeItems: "center",
                          borderRadius: "50%",
                          background: "#e2e8f0",
                          fontWeight: 900,
                        }}
                      >
                        {maid.name.slice(0, 1).toUpperCase()}
                      </div>
                    )}

                    <div>
                      <strong>{maid.name}</strong>
                      <div
                        style={{
                          color: available ? "#15803d" : "#64748b",
                          fontWeight: 800,
                          fontSize: 13,
                        }}
                      >
                        {available ? "Available" : "Unavailable"}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={saving || !selectedSessionId}
                    onClick={() => void setAvailability(maid.id, !available)}
                    style={{
                      minWidth: 160,
                      minHeight: 42,
                      padding: "9px 14px",
                      borderRadius: 11,
                      border: "none",
                      background: available ? "#dc2626" : "#16a34a",
                      color: "#fff",
                      fontWeight: 900,
                      cursor: saving ? "wait" : "pointer",
                      opacity: saving ? 0.6 : 1,
                    }}
                  >
                    {saving
                      ? "Saving..."
                      : available
                        ? "Set Unavailable"
                        : "Set Available"}
                  </button>
                </section>
              );
            })}
          </main>
        </div>
      ) : null}
    </div>
  );
}

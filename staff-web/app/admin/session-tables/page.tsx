"use client";

import { useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import type {
  SessionItem,
  SessionTableAdminSummary,
  SessionTableCreatePayload,
  SessionTableStatus,
  TableItem,
} from "@/lib/types";

export default function AdminSessionTablesPage() {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [tables, setTables] = useState<TableItem[]>([]);
  const [sessionTables, setSessionTables] = useState<SessionTableAdminSummary[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<number | "">("");
  const [selectedTableId, setSelectedTableId] = useState<number | "">("");
  const [status, setStatus] = useState<SessionTableStatus>("available");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
  const [currentPartySize, setCurrentPartySize] = useState(0);

  async function loadBaseData() {
    setLoading(true);
    setError("");

    try {
      const [sessionsData, tablesData] = await Promise.all([
        apiGet<SessionItem[]>("/sessions"),
        apiGet<TableItem[]>("/tables"),
      ]);
      setSessions(sessionsData);
      setTables(tablesData.filter((t) => t.is_active));

      if (sessionsData.length > 0 && selectedSessionId === "") {
        setSelectedSessionId(sessionsData[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load base data");
    } finally {
      setLoading(false);
    }
  }

  async function loadSessionTables(sessionId: number) {
    try {
      const data = await apiGet<SessionTableAdminSummary[]>(`/tables/session-tables?session_id=${sessionId}`);
      setSessionTables(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load session tables");
    }
  }

  useEffect(() => {
    loadBaseData();
  }, []);

  useEffect(() => {
    if (selectedSessionId !== "") {
      loadSessionTables(Number(selectedSessionId));
    }
  }, [selectedSessionId]);

  async function handleCreate() {
    if (selectedSessionId === "" || selectedTableId === "") return;

    try {
      await apiPost<SessionTableAdminSummary>("/tables/session-tables", {
        session_id: Number(selectedSessionId),
        table_id: Number(selectedTableId),
        status,
        current_party_size: currentPartySize,
      } satisfies SessionTableCreatePayload);

      setSelectedTableId("");
      setStatus("available");
      setCurrentPartySize(0);
      await loadSessionTables(Number(selectedSessionId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create session table");
    }
  }

  async function handleStatusChange(id: number, newStatus: SessionTableStatus) {
    try {
      setActionLoadingId(id);
      await apiPatch<SessionTableAdminSummary>(`/tables/session-tables/${id}`, {
        status: newStatus,
      });
      if (selectedSessionId !== "") {
        await loadSessionTables(Number(selectedSessionId));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update session table");
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleDelete(id: number) {
    try {
      setActionLoadingId(id);
      await apiDelete(`/tables/session-tables/${id}`);
      if (selectedSessionId !== "") {
        await loadSessionTables(Number(selectedSessionId));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete session table");
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handlePartySizeChange(id: number, newPartySize: number) {
    try {
      setActionLoadingId(id);
      await apiPatch<SessionTableAdminSummary>(`/tables/session-tables/${id}`, {
        current_party_size: Math.max(0, newPartySize),
      });
      if (selectedSessionId !== "") {
        await loadSessionTables(Number(selectedSessionId));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update party size");
    } finally {
      setActionLoadingId(null);
    }
  }

  const linkedTableIds = useMemo(
    () => new Set(sessionTables.map((st) => st.table_id)),
    [sessionTables]
  );

  const availableTablesToAdd = tables.filter((t) => !linkedTableIds.has(t.id));

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <div>
        <h1 style={{ marginBottom: 8 }}>Session Tables</h1>
        <p style={{ marginTop: 0, color: "#4b5563" }}>
          Link tables to a session and manage their statuses.
        </p>
      </div>

      {loading ? <p>Loading...</p> : null}
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}

      {!loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "420px 1fr", gap: 24, alignItems: "start" }}>
          <section
            style={{
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: 16,
              padding: 20,
              display: "grid",
              gap: 16,
            }}
          >
            <h3 style={{ marginTop: 0 }}>Add Session Table</h3>

            <label style={{ display: "grid", gap: 6 }}>
              <span>Session</span>
              <select
                value={selectedSessionId}
                onChange={(e) => setSelectedSessionId(e.target.value ? Number(e.target.value) : "")}
                style={{ padding: 10, borderRadius: 10, border: "1px solid #d1d5db" }}
              >
                <option value="">Select session</option>
                {sessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.name}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span>Table</span>
              <select
                value={selectedTableId}
                onChange={(e) => setSelectedTableId(e.target.value ? Number(e.target.value) : "")}
                style={{ padding: 10, borderRadius: 10, border: "1px solid #d1d5db" }}
              >
                <option value="">Select table</option>
                {availableTablesToAdd.map((table) => (
                  <option key={table.id} value={table.id}>
                    {table.code} ({table.seats} seats)
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span>Status</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as SessionTableStatus)}
                style={{ padding: 10, borderRadius: 10, border: "1px solid #d1d5db" }}
              >
                <option value="available">available</option>
                <option value="occupied">occupied</option>
                <option value="ready">ready</option>
                <option value="paying">paying</option>
                <option value="paid">paid</option>
              </select>
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span>Current Party Size</span>
              <input
                type="number"
                min={0}
                value={currentPartySize}
                onChange={(e) => setCurrentPartySize(Number(e.target.value || 0))}
                style={{ padding: 10, borderRadius: 10, border: "1px solid #d1d5db" }}
              />
            </label>

            <button
              type="button"
              onClick={handleCreate}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "none",
                background: "#111827",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              Add Session Table
            </button>
          </section>

          <section
            style={{
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: 16,
              padding: 20,
              display: "grid",
              gap: 16,
            }}
          >
            <h3 style={{ marginTop: 0 }}>Linked Tables</h3>

            {selectedSessionId === "" ? <p>Please select a session.</p> : null}
            {selectedSessionId !== "" && sessionTables.length === 0 ? <p>No tables linked yet.</p> : null}

            <div style={{ display: "grid", gap: 16 }}>
              {sessionTables.map((st) => (
                <div
                  key={st.id}
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 14,
                    padding: 16,
                    display: "grid",
                    gap: 10,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <strong>{st.table_code}</strong>
                    <span>{st.seats} seats</span>
                  </div>

                  <div style={{ color: "#4b5563", fontSize: 14 }}>
                    <div>Current Party Size: {st.current_party_size}</div>
                    <div>Remaining Seats: {Math.max(0, st.seats - st.current_party_size)}</div>
                  </div>

                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span>Status:</span>
                    <select
                      value={st.status}
                      onChange={(e) => handleStatusChange(st.id, e.target.value as SessionTableStatus)}
                      disabled={actionLoadingId === st.id}
                      style={{ padding: 8, borderRadius: 10, border: "1px solid #d1d5db" }}
                    >
                      <option value="available">available</option>
                      <option value="occupied">occupied</option>
                      <option value="ready">ready</option>
                      <option value="paying">paying</option>
                      <option value="paid">paid</option>
                    </select>

                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <span>Party Size:</span>
                      <input
                        type="number"
                        min={0}
                        value={st.current_party_size}
                        onChange={(e) =>
                          handlePartySizeChange(st.id, Number(e.target.value || 0))
                        }
                        disabled={actionLoadingId === st.id}
                        style={{
                          width: 90,
                          padding: 8,
                          borderRadius: 10,
                          border: "1px solid #d1d5db",
                        }}
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDelete(st.id)}
                      disabled={actionLoadingId === st.id}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 10,
                        border: "none",
                        background: "#dc2626",
                        color: "#fff",
                        cursor: "pointer",
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
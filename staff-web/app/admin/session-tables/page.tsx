"use client";

import { useEffect, useMemo, useState } from "react";

import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import type {
  CurrentSessionResponse,
  SessionItem,
  SessionTableAddPartyPayload,
  SessionTableAdminSummary,
  SessionTableCreatePayload,
  TableItem,
} from "@/lib/types";

function getSimpleStatus(table: SessionTableAdminSummary) {
  if (table.status === "paying") {
    return {
      label: "Checking out",
      background: "#fef3c7",
      color: "#92400e",
    };
  }

  if (table.current_party_size === 0) {
    return {
      label: "Empty",
      background: "#dcfce7",
      color: "#166534",
    };
  }

  return {
    label: "Seated",
    background: "#dbeafe",
    color: "#1d4ed8",
  };
}

export default function AdminSessionTablesPage() {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [tables, setTables] = useState<TableItem[]>([]);
  const [sessionTables, setSessionTables] = useState<
    SessionTableAdminSummary[]
  >([]);

  const [selectedSessionId, setSelectedSessionId] = useState<number | "">("");
  const [selectedTableId, setSelectedTableId] = useState<number | "">("");
  const [initialPartySize, setInitialPartySize] = useState(0);
  const [newPartySizes, setNewPartySizes] = useState<Record<number, number>>({});

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);

  async function loadBaseData() {
    setLoading(true);
    setError("");

    try {
      const [sessionsData, tablesData, currentData] = await Promise.all([
        apiGet<SessionItem[]>("/sessions"),
        apiGet<TableItem[]>("/tables"),
        apiGet<CurrentSessionResponse>("/sessions/current"),
      ]);

      setSessions(sessionsData);
      setTables(tablesData.filter((table) => table.is_active));

      if (selectedSessionId === "") {
        const defaultSession =
          currentData.session ??
          sessionsData.find((session) => session.status === "active") ??
          sessionsData[0];

        if (defaultSession) {
          setSelectedSessionId(defaultSession.id);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load base data");
    } finally {
      setLoading(false);
    }
  }

  async function loadSessionTables(sessionId: number) {
    try {
      const data = await apiGet<SessionTableAdminSummary[]>(
        `/tables/session-tables?session_id=${sessionId}`,
      );
      setSessionTables(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load session tables",
      );
    }
  }

  useEffect(() => {
    loadBaseData();
  }, []);

  useEffect(() => {
    if (selectedSessionId !== "") {
      loadSessionTables(Number(selectedSessionId));
    } else {
      setSessionTables([]);
    }
  }, [selectedSessionId]);

  const linkedTableIds = useMemo(
    () => new Set(sessionTables.map((sessionTable) => sessionTable.table_id)),
    [sessionTables],
  );

  const availableTablesToAdd = useMemo(
    () => tables.filter((table) => !linkedTableIds.has(table.id)),
    [tables, linkedTableIds],
  );

  const selectedTable = useMemo(
    () => tables.find((table) => table.id === selectedTableId) ?? null,
    [tables, selectedTableId],
  );

  useEffect(() => {
    if (selectedTable && initialPartySize > selectedTable.seats) {
      setInitialPartySize(selectedTable.seats);
    }
  }, [selectedTable, initialPartySize]);

  async function handleCreate() {
    if (selectedSessionId === "" || selectedTableId === "") return;

    try {
      setError("");
      const payload: SessionTableCreatePayload = {
        session_id: Number(selectedSessionId),
        table_id: Number(selectedTableId),
        status: "available",
        current_party_size: initialPartySize,
      };

      await apiPost<SessionTableAdminSummary>(
        "/tables/session-tables",
        payload,
      );

      setSelectedTableId("");
      setInitialPartySize(0);
      await loadSessionTables(Number(selectedSessionId));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create session table",
      );
    }
  }

  async function handleSyncActiveTables() {
    if (selectedSessionId === "") return;

    try {
      setSyncing(true);
      setError("");
      const data = await apiPost<SessionTableAdminSummary[]>(
        `/tables/session-tables/sync-active?session_id=${selectedSessionId}`,
        {},
      );
      setSessionTables(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to sync active tables",
      );
    } finally {
      setSyncing(false);
    }
  }

  async function handleSetPartySize(
    table: SessionTableAdminSummary,
    newPartySize: number,
  ) {
    const safeSize = Math.min(table.seats, Math.max(0, newPartySize));

    try {
      setActionLoadingId(table.id);
      setError("");
      await apiPatch<SessionTableAdminSummary>(
        `/tables/session-tables/${table.id}`,
        { current_party_size: safeSize },
      );
      await loadSessionTables(table.session_id);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update party size",
      );
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleAddParty(table: SessionTableAdminSummary) {
    const remainingSeats = table.seats - table.current_party_size;
    const requestedSize = newPartySizes[table.id] ?? 1;
    const safeSize = Math.min(remainingSeats, Math.max(1, requestedSize));

    if (remainingSeats <= 0) return;

    try {
      setActionLoadingId(table.id);
      setError("");

      const payload: SessionTableAddPartyPayload = {
        party_size: safeSize,
      };

      await apiPost<SessionTableAdminSummary>(
        `/tables/session-tables/${table.id}/add-party`,
        payload,
      );

      setNewPartySizes((current) => ({
        ...current,
        [table.id]: 1,
      }));
      await loadSessionTables(table.session_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add party");
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleDelete(table: SessionTableAdminSummary) {
    const confirmed = window.confirm(
      `Remove table ${table.table_code} from this session?`,
    );
    if (!confirmed) return;

    try {
      setActionLoadingId(table.id);
      setError("");
      await apiDelete<{ success: boolean; deleted_id: number }>(
        `/tables/session-tables/${table.id}`,
      );
      await loadSessionTables(table.session_id);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to remove session table",
      );
    } finally {
      setActionLoadingId(null);
    }
  }

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <div>
        <h1 style={{ marginBottom: 8 }}>Session Tables</h1>
        <p style={{ marginTop: 0, color: "#4b5563" }}>
          Manage capacity and shared seating. Table status is now calculated
          automatically from guest count and checkout state.
        </p>
      </div>

      {loading ? <p>Loading...</p> : null}
      {error ? (
        <div
          style={{
            padding: 12,
            borderRadius: 12,
            background: "#fef2f2",
            color: "#b91c1c",
          }}
        >
          {error}
        </div>
      ) : null}

      {!loading ? (
        <>
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
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-end",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <label style={{ display: "grid", gap: 6, minWidth: 260 }}>
                <span>Session</span>
                <select
                  value={selectedSessionId}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                    setSelectedSessionId(
                      e.target.value ? Number(e.target.value) : "",
                    )
                  }
                  style={{
                    padding: 10,
                    borderRadius: 10,
                    border: "1px solid #d1d5db",
                  }}
                >
                  <option value="">Select session</option>
                  {sessions.map((session) => (
                    <option key={session.id} value={session.id}>
                      {session.name} ({session.status})
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                onClick={handleSyncActiveTables}
                disabled={selectedSessionId === "" || syncing}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "none",
                  background: "#2563eb",
                  color: "#fff",
                  cursor:
                    selectedSessionId === "" || syncing
                      ? "not-allowed"
                      : "pointer",
                  opacity: selectedSessionId === "" || syncing ? 0.65 : 1,
                }}
              >
                {syncing ? "Syncing..." : "Sync All Active Tables"}
              </button>
            </div>

            <div
              style={{
                borderTop: "1px solid #e5e7eb",
                paddingTop: 16,
                display: "grid",
                gap: 12,
              }}
            >
              <h3 style={{ margin: 0 }}>Add One Table Manually</h3>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(180px, 1fr) 160px auto",
                  gap: 12,
                  alignItems: "end",
                }}
              >
                <label style={{ display: "grid", gap: 6 }}>
                  <span>Table</span>
                  <select
                    value={selectedTableId}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                      setSelectedTableId(
                        e.target.value ? Number(e.target.value) : "",
                      );
                      setInitialPartySize(0);
                    }}
                    style={{
                      padding: 10,
                      borderRadius: 10,
                      border: "1px solid #d1d5db",
                    }}
                  >
                    <option value="">Select table</option>
                    {availableTablesToAdd.map((table) => (
                      <option key={table.id} value={table.id}>
                        {table.code} · {table.seats} seats · {table.is_shareable ? "shareable" : "private"}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={{ display: "grid", gap: 6 }}>
                  <span>Initial guests</span>
                  <input
                    type="number"
                    min={0}
                    max={selectedTable?.seats ?? 0}
                    value={initialPartySize}
                    disabled={!selectedTable}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      const maximum = selectedTable?.seats ?? 0;
                      setInitialPartySize(
                        Math.min(
                          maximum,
                          Math.max(0, Number(e.target.value || 0)),
                        ),
                      );
                    }}
                    style={{
                      padding: 10,
                      borderRadius: 10,
                      border: "1px solid #d1d5db",
                    }}
                  />
                </label>

                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={
                    selectedSessionId === "" || selectedTableId === ""
                  }
                  style={{
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "none",
                    background: "#111827",
                    color: "#fff",
                    cursor:
                      selectedSessionId === "" || selectedTableId === ""
                        ? "not-allowed"
                        : "pointer",
                    opacity:
                      selectedSessionId === "" || selectedTableId === ""
                        ? 0.65
                        : 1,
                  }}
                >
                  Add Table
                </button>
              </div>
            </div>
          </section>

          <section style={{ display: "grid", gap: 14 }}>
            <h2 style={{ marginBottom: 0 }}>Linked Tables</h2>

            {selectedSessionId === "" ? (
              <p>Please select a session.</p>
            ) : null}

            {selectedSessionId !== "" && sessionTables.length === 0 ? (
              <div
                style={{
                  background: "#fff",
                  border: "1px solid #e5e7eb",
                  borderRadius: 16,
                  padding: 20,
                }}
              >
                No tables are linked. Click <strong>Sync All Active Tables</strong>.
              </div>
            ) : null}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
                gap: 16,
              }}
            >
              {sessionTables.map((table) => {
                const remainingSeats = Math.max(
                  0,
                  table.seats - table.current_party_size,
                );
                const isFull = remainingSeats === 0;
                const canAddAnotherParty =
                  table.status !== "paying" &&
                  !isFull &&
                  (table.current_party_size === 0 || table.is_shareable);
                const status = getSimpleStatus(table);
                const isBusy = actionLoadingId === table.id;

                return (
                  <article
                    key={table.id}
                    style={{
                      background: "#fff",
                      border: "1px solid #e5e7eb",
                      borderRadius: 16,
                      padding: 18,
                      display: "grid",
                      gap: 16,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        gap: 12,
                      }}
                    >
                      <div>
                        <strong style={{ fontSize: 25 }}>
                          {table.table_code}
                        </strong>
                        <div
                          style={{
                            color: "#6b7280",
                            marginTop: 5,
                            fontSize: 14,
                          }}
                        >
                          Capacity: {table.seats}
                        </div>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          gap: 6,
                          flexWrap: "wrap",
                          justifyContent: "flex-end",
                        }}
                      >
                        <span
                          style={{
                            padding: "4px 9px",
                            borderRadius: 999,
                            fontSize: 12,
                            background: status.background,
                            color: status.color,
                          }}
                        >
                          {status.label}
                        </span>
                        <span
                          style={{
                            padding: "4px 9px",
                            borderRadius: 999,
                            fontSize: 12,
                            background: table.is_shareable
                              ? "#ede9fe"
                              : "#f3f4f6",
                            color: table.is_shareable
                              ? "#6d28d9"
                              : "#374151",
                          }}
                        >
                          {table.is_shareable ? "Shareable" : "Private"}
                        </span>
                      </div>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(3, 1fr)",
                        gap: 8,
                      }}
                    >
                      <div
                        style={{
                          background: "#f9fafb",
                          borderRadius: 10,
                          padding: 10,
                          textAlign: "center",
                        }}
                      >
                        <strong style={{ display: "block", fontSize: 20 }}>
                          {table.current_party_size}
                        </strong>
                        <span style={{ color: "#6b7280", fontSize: 12 }}>
                          Guests
                        </span>
                      </div>
                      <div
                        style={{
                          background: "#f9fafb",
                          borderRadius: 10,
                          padding: 10,
                          textAlign: "center",
                        }}
                      >
                        <strong style={{ display: "block", fontSize: 20 }}>
                          {remainingSeats}
                        </strong>
                        <span style={{ color: "#6b7280", fontSize: 12 }}>
                          Open seats
                        </span>
                      </div>
                      <div
                        style={{
                          background: "#f9fafb",
                          borderRadius: 10,
                          padding: 10,
                          textAlign: "center",
                        }}
                      >
                        <strong style={{ display: "block", fontSize: 20 }}>
                          {table.seats}
                        </strong>
                        <span style={{ color: "#6b7280", fontSize: 12 }}>
                          Capacity
                        </span>
                      </div>
                    </div>

                    <label style={{ display: "grid", gap: 6 }}>
                      <span>Correct total guest count</span>
                      <select
                        value={table.current_party_size}
                        disabled={isBusy || table.status === "paying"}
                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                          handleSetPartySize(table, Number(e.target.value))
                        }
                        style={{
                          padding: 10,
                          borderRadius: 10,
                          border: "1px solid #d1d5db",
                        }}
                      >
                        {Array.from(
                          { length: table.seats + 1 },
                          (_, number) => (
                            <option key={number} value={number}>
                              {number}
                            </option>
                          ),
                        )}
                      </select>
                    </label>

                    <div
                      style={{
                        borderTop: "1px solid #e5e7eb",
                        paddingTop: 14,
                        display: "grid",
                        gap: 9,
                      }}
                    >
                      <strong>Add another party</strong>

                      {isFull ? (
                        <span style={{ color: "#b91c1c", fontSize: 14 }}>
                          This table is full.
                        </span>
                      ) : table.current_party_size > 0 &&
                        !table.is_shareable ? (
                        <span style={{ color: "#92400e", fontSize: 14 }}>
                          Shared seating is disabled, so no second party can be
                          assigned.
                        </span>
                      ) : table.status === "paying" ? (
                        <span style={{ color: "#92400e", fontSize: 14 }}>
                          This table is checking out.
                        </span>
                      ) : (
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr auto",
                            gap: 8,
                          }}
                        >
                          <input
                            type="number"
                            min={1}
                            max={remainingSeats}
                            value={newPartySizes[table.id] ?? 1}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                              setNewPartySizes((current) => ({
                                ...current,
                                [table.id]: Math.min(
                                  remainingSeats,
                                  Math.max(1, Number(e.target.value || 1)),
                                ),
                              }))
                            }
                            style={{
                              padding: 10,
                              borderRadius: 10,
                              border: "1px solid #d1d5db",
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => handleAddParty(table)}
                            disabled={!canAddAnotherParty || isBusy}
                            style={{
                              padding: "10px 13px",
                              borderRadius: 10,
                              border: "none",
                              background: "#2563eb",
                              color: "#fff",
                              cursor:
                                !canAddAnotherParty || isBusy
                                  ? "not-allowed"
                                  : "pointer",
                              opacity:
                                !canAddAnotherParty || isBusy ? 0.65 : 1,
                            }}
                          >
                            Add Party
                          </button>
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDelete(table)}
                      disabled={isBusy}
                      style={{
                        padding: "9px 12px",
                        borderRadius: 10,
                        border: "1px solid #fecaca",
                        background: "#fff",
                        color: "#b91c1c",
                        cursor: isBusy ? "not-allowed" : "pointer",
                      }}
                    >
                      Remove From Session
                    </button>
                  </article>
                );
              })}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

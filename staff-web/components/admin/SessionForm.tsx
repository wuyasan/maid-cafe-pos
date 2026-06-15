"use client";

import { useEffect, useState } from "react";
import type { SessionCreatePayload, SessionItem, SessionStatus, SessionUpdatePayload } from "@/lib/types";

type Props = {
  editingSession: SessionItem | null;
  onCreate: (payload: SessionCreatePayload) => Promise<void>;
  onUpdate: (sessionId: number, payload: SessionUpdatePayload) => Promise<void>;
  onCancelEdit: () => void;
};

function toDatetimeLocalValue(value?: string | null) {
  if (!value) return "";
  const d = new Date(value);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hour = String(d.getHours()).padStart(2, "0");
  const minute = String(d.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

export default function SessionForm({
  editingSession,
  onCreate,
  onUpdate,
  onCancelEdit,
}: Props) {
  const [name, setName] = useState("");
  const [serviceDate, setServiceDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [status, setStatus] = useState<SessionStatus>("scheduled");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (editingSession) {
      setName(editingSession.name ?? "");
      setServiceDate(editingSession.service_date ?? "");
      setStartTime(toDatetimeLocalValue(editingSession.start_time));
      setEndTime(toDatetimeLocalValue(editingSession.end_time));
      setStatus(editingSession.status);
    } else {
      setName("");
      setServiceDate("");
      setStartTime("");
      setEndTime("");
      setStatus("scheduled");
    }
  }, [editingSession]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const payload = {
        name,
        service_date: serviceDate,
        start_time: startTime ? new Date(startTime).toISOString() : null,
        end_time: endTime ? new Date(endTime).toISOString() : null,
        status,
      };

      if (editingSession) {
        await onUpdate(editingSession.id, payload);
      } else {
        await onCreate(payload);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save session");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 16,
        padding: 20,
        display: "grid",
        gap: 16,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ margin: 0 }}>{editingSession ? "Edit Session" : "Add Session"}</h3>
        {editingSession ? (
          <button
            type="button"
            onClick={onCancelEdit}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid #d1d5db",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        ) : null}
      </div>

      <label style={{ display: "grid", gap: 6 }}>
        <span>Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          style={{ padding: 10, borderRadius: 10, border: "1px solid #d1d5db" }}
        />
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span>Service Date</span>
        <input
          type="date"
          value={serviceDate}
          onChange={(e) => setServiceDate(e.target.value)}
          required
          style={{ padding: 10, borderRadius: 10, border: "1px solid #d1d5db" }}
        />
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span>Start Time</span>
        <input
          type="datetime-local"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
          style={{ padding: 10, borderRadius: 10, border: "1px solid #d1d5db" }}
        />
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span>End Time</span>
        <input
          type="datetime-local"
          value={endTime}
          onChange={(e) => setEndTime(e.target.value)}
          style={{ padding: 10, borderRadius: 10, border: "1px solid #d1d5db" }}
        />
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span>Status</span>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as SessionStatus)}
          style={{ padding: 10, borderRadius: 10, border: "1px solid #d1d5db" }}
        >
          <option value="scheduled">scheduled</option>
          <option value="active">active</option>
          <option value="winding_down">winding_down</option>
          <option value="closed">closed</option>
        </select>
      </label>

      {error ? <p style={{ color: "#b91c1c", margin: 0 }}>{error}</p> : null}

      <button
        type="submit"
        disabled={submitting}
        style={{
          padding: "10px 14px",
          borderRadius: 10,
          border: "none",
          background: "#111827",
          color: "#fff",
          cursor: "pointer",
        }}
      >
        {submitting ? "Saving..." : editingSession ? "Update Session" : "Create Session"}
      </button>
    </form>
  );
}
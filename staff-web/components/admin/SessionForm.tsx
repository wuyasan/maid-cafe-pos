"use client";

import { useEffect, useState } from "react";

import type {
  SessionCreatePayload,
  SessionItem,
  SessionStatus,
  SessionUpdatePayload,
} from "@/lib/types";

type Props = {
  editingSession: SessionItem | null;
  onCreate: (payload: SessionCreatePayload) => Promise<void>;
  onUpdate: (
    sessionId: number,
    payload: SessionUpdatePayload
  ) => Promise<void>;
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

function toTimeInputValue(value?: string | null) {
  if (!value) return "";
  return value.slice(0, 5);
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
  const [kitchenLastOrderTime, setKitchenLastOrderTime] = useState("");
  const [barLastOrderTime, setBarLastOrderTime] = useState("");
  const [status, setStatus] = useState<SessionStatus>("scheduled");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (editingSession) {
      setName(editingSession.name ?? "");
      setServiceDate(editingSession.service_date ?? "");
      setStartTime(toDatetimeLocalValue(editingSession.start_time));
      setEndTime(toDatetimeLocalValue(editingSession.end_time));
      setKitchenLastOrderTime(
        toTimeInputValue(editingSession.kitchen_last_order_time)
      );
      setBarLastOrderTime(toTimeInputValue(editingSession.bar_last_order_time));
      setStatus(editingSession.status);
    } else {
      setName("");
      setServiceDate("");
      setStartTime("");
      setEndTime("");
      setKitchenLastOrderTime("");
      setBarLastOrderTime("");
      setStatus("scheduled");
    }
  }, [editingSession]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const payload: SessionCreatePayload = {
        name,
        service_date: serviceDate,
        start_time: startTime ? new Date(startTime).toISOString() : null,
        end_time: endTime ? new Date(endTime).toISOString() : null,
        kitchen_last_order_time: kitchenLastOrderTime || null,
        bar_last_order_time: barLastOrderTime || null,
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

  const inputStyle = {
    padding: 10,
    borderRadius: 10,
    border: "1px solid #d1d5db",
  };

  return (
    <section
      style={{
        padding: 20,
        border: "1px solid #e5e7eb",
        borderRadius: 16,
        background: "#fff",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <h3 style={{ margin: 0 }}>
          {editingSession ? "Edit Session" : "Add Session"}
        </h3>
        {editingSession ? (
          <button type="button" onClick={onCancelEdit}>
            Cancel
          </button>
        ) : null}
      </div>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span>Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            style={inputStyle}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Service Date</span>
          <input
            type="date"
            value={serviceDate}
            onChange={(e) => setServiceDate(e.target.value)}
            required
            style={inputStyle}
          />
        </label>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 14,
          }}
        >
          <label style={{ display: "grid", gap: 6 }}>
            <span>Start Time</span>
            <input
              type="datetime-local"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              style={inputStyle}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span>End Time</span>
            <input
              type="datetime-local"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              style={inputStyle}
            />
          </label>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 14,
            padding: 14,
            borderRadius: 12,
            background: "#f9fafb",
          }}
        >
          <label style={{ display: "grid", gap: 6 }}>
            <span>Kitchen Last Order</span>
            <input
              type="time"
              value={kitchenLastOrderTime}
              onChange={(e) => setKitchenLastOrderTime(e.target.value)}
              style={inputStyle}
            />
            <small style={{ color: "#6b7280" }}>
              Leave blank to keep kitchen ordering open.
            </small>
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span>Bar Last Order</span>
            <input
              type="time"
              value={barLastOrderTime}
              onChange={(e) => setBarLastOrderTime(e.target.value)}
              style={inputStyle}
            />
            <small style={{ color: "#6b7280" }}>
              Leave blank to keep bar ordering open.
            </small>
          </label>
        </div>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as SessionStatus)}
            style={inputStyle}
          >
            <option value="scheduled">scheduled</option>
            <option value="active">active</option>
            <option value="winding_down">winding_down</option>
            <option value="closed">closed</option>
          </select>
        </label>

        {error ? <p style={{ color: "#dc2626", margin: 0 }}>{error}</p> : null}

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
          {submitting
            ? "Saving..."
            : editingSession
              ? "Update Session"
              : "Create Session"}
        </button>
      </form>
    </section>
  );
}

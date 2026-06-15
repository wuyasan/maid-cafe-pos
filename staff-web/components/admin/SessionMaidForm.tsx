"use client";

import { useMemo, useState } from "react";
import type { Maid, SessionItem, SessionMaidCreatePayload } from "@/lib/types";

type Props = {
  sessions: SessionItem[];
  maids: Maid[];
  selectedSessionId: number | null;
  onChangeSelectedSessionId: (id: number) => void;
  onSubmit: (payload: SessionMaidCreatePayload) => Promise<void>;
};

export default function SessionMaidForm({
  sessions,
  maids,
  selectedSessionId,
  onChangeSelectedSessionId,
  onSubmit,
}: Props) {
  const [maidId, setMaidId] = useState<number | "">("");
  const [isAvailable, setIsAvailable] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const selectedSessionValue = useMemo(
    () => (selectedSessionId ?? ""),
    [selectedSessionId]
  );

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    if (!selectedSessionId) {
      setError("Please select a session.");
      return;
    }

    if (!maidId) {
      setError("Please select a maid.");
      return;
    }

    setSubmitting(true);

    try {
      await onSubmit({
        session_id: selectedSessionId,
        maid_id: Number(maidId),
        is_available: isAvailable,
      });

      setMaidId("");
      setIsAvailable(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create session maid");
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
      <h3 style={{ margin: 0 }}>Add Session Maid</h3>

      <label style={{ display: "grid", gap: 6 }}>
        <span>Session</span>
        <select
          value={selectedSessionValue}
          onChange={(e) => onChangeSelectedSessionId(Number(e.target.value))}
          style={{ padding: 10, borderRadius: 10, border: "1px solid #d1d5db" }}
        >
          <option value="">Select session</option>
          {sessions.map((session) => (
            <option key={session.id} value={session.id}>
              {session.name} ({session.status})
            </option>
          ))}
        </select>
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span>Maid</span>
        <select
          value={maidId}
          onChange={(e) => setMaidId(e.target.value ? Number(e.target.value) : "")}
          style={{ padding: 10, borderRadius: 10, border: "1px solid #d1d5db" }}
        >
          <option value="">Select maid</option>
          {maids.map((maid) => (
            <option key={maid.id} value={maid.id}>
              {maid.name}
            </option>
          ))}
        </select>
      </label>

      <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="checkbox"
          checked={isAvailable}
          onChange={(e) => setIsAvailable(e.target.checked)}
        />
        <span>Available in this session</span>
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
        {submitting ? "Saving..." : "Add Session Maid"}
      </button>
    </form>
  );
}
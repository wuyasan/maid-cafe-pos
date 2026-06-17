"use client";

import { useEffect, useState } from "react";

import {
  disableSound,
  enableSound,
  isSoundEnabled,
  requestBrowserNotifications,
} from "@/lib/notificationSound";

export default function SoundControl() {
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setEnabled(isSoundEnabled());
  }, []);

  async function turnOn() {
    try {
      await enableSound();
      setEnabled(true);

      const permission =
        await requestBrowserNotifications();

      setMessage(
        permission === "granted"
          ? "Sound and notifications enabled."
          : "Sound enabled.",
      );
    } catch (err) {
      setMessage(
        err instanceof Error
          ? err.message
          : "Could not enable sound.",
      );
    }
  }

  function turnOff() {
    disableSound();
    setEnabled(false);
    setMessage("Sound disabled.");
  }

  return (
    <div
      style={{
        display: "flex",
        gap: 9,
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <button
        type="button"
        onClick={() =>
          enabled ? turnOff() : void turnOn()
        }
        style={{
          minHeight: 42,
          padding: "9px 14px",
          borderRadius: 11,
          border: enabled
            ? "1px solid #86efac"
            : "1px solid #d1d5db",
          background: enabled
            ? "#dcfce7"
            : "#ffffff",
          color: enabled ? "#166534" : "#111827",
          fontWeight: 900,
        }}
      >
        {enabled
          ? "🔊 Sound On"
          : "🔇 Enable Sound"}
      </button>

      {message ? (
        <span
          style={{
            color: "#64748b",
            fontSize: 12,
          }}
        >
          {message}
        </span>
      ) : null}
    </div>
  );
}

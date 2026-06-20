"use client";

import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  getSquareConfig,
  saveSquareRuntimeConfig,
  SQUARE_RUNTIME_CONFIG_KEY,
} from "@/lib/squarePos";

function safeReturnPath(value: string | null): string {
  if (!value) return "/staff";
  if (!value.startsWith("/") || value.startsWith("//")) return "/staff";
  return value;
}

type SavedConfig = {
  applicationId: string;
  callbackUrl: string;
  locationId: string;
};

/** Read saved Square config on first render (lazy state init). Returns defaults
 *  if nothing is stored or the stored value is malformed. Runs only on the
 *  client (called from useState initializer which runs after hydration). */
function loadInitialConfig(): SavedConfig {
  if (typeof window === "undefined") {
    return { applicationId: "", callbackUrl: "", locationId: "" };
  }
  try {
    const config = getSquareConfig();
    return {
      applicationId: config.applicationId,
      callbackUrl: config.callbackUrl,
      locationId: config.locationId ?? "",
    };
  } catch {
    const raw = window.localStorage.getItem(SQUARE_RUNTIME_CONFIG_KEY);
    if (!raw) return { applicationId: "", callbackUrl: "", locationId: "" };
    try {
      const saved = JSON.parse(raw) as Partial<SavedConfig>;
      return {
        applicationId: saved.applicationId ?? "",
        callbackUrl: saved.callbackUrl ?? "",
        locationId: saved.locationId ?? "",
      };
    } catch {
      return { applicationId: "", callbackUrl: "", locationId: "" };
    }
  }
}

function SquareSettingsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("payment");
  const tAction = useTranslations("staff.action");

  const returnPath = useMemo(
    () => safeReturnPath(searchParams.get("next")),
    [searchParams],
  );

  // Lazy initializers read from localStorage exactly once on mount.
  const [applicationId, setApplicationId] = useState(() => loadInitialConfig().applicationId);
  const [callbackUrl, setCallbackUrl] = useState(() => loadInitialConfig().callbackUrl);
  const [locationId, setLocationId] = useState(() => loadInitialConfig().locationId);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  function save() {
    if (!applicationId.trim()) {
      setMessage({ text: t("settings.appIdRequired"), isError: true });
      return;
    }
    if (!callbackUrl.trim()) {
      setMessage({ text: t("settings.callbackRequired"), isError: true });
      return;
    }

    saveSquareRuntimeConfig({
      applicationId: applicationId.trim(),
      callbackUrl: callbackUrl.trim(),
      locationId: locationId.trim() || undefined,
    });

    setMessage({ text: t("settings.saved"), isError: false });

    window.setTimeout(() => {
      router.replace(returnPath);
    }, 500);
  }

  return (
    <main
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "28px 18px 64px",
        color: "var(--foreground)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "center",
          marginBottom: 22,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>
            {t("settings.title")}
          </h1>
          <p style={{ color: "var(--muted)", marginTop: 4, marginBottom: 0 }}>
            {t("settings.subtitle")}
          </p>
        </div>

        <Link
          href={returnPath}
          style={{
            padding: "10px 16px",
            borderRadius: 12,
            border: "1px solid var(--line)",
            textDecoration: "none",
            color: "var(--foreground)",
            fontWeight: 700,
            minHeight: "var(--tap-min)",
            display: "inline-flex",
            alignItems: "center",
          }}
        >
          {tAction("cancel")}
        </Link>
      </div>

      <section
        style={{
          display: "grid",
          gap: 16,
          padding: 20,
          borderRadius: 18,
          border: "1px solid var(--line)",
          background: "var(--card)",
        }}
      >
        <label style={{ display: "grid", gap: 6 }}>
          <strong style={{ fontSize: 14 }}>{t("settings.appIdLabel")}</strong>
          <input
            value={applicationId}
            onChange={(e) => setApplicationId(e.target.value)}
            placeholder="sq0idp-..."
            autoCapitalize="none"
            autoCorrect="off"
            style={{
              minHeight: 48,
              padding: "10px 12px",
              borderRadius: 11,
              border: "1px solid var(--line)",
              fontSize: 16,
              color: "var(--foreground)",
              background: "var(--background)",
            }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <strong style={{ fontSize: 14 }}>{t("settings.callbackLabel")}</strong>
          <input
            value={callbackUrl}
            onChange={(e) => setCallbackUrl(e.target.value)}
            placeholder="https://your-domain/staff/square-callback"
            autoCapitalize="none"
            autoCorrect="off"
            inputMode="url"
            style={{
              minHeight: 48,
              padding: "10px 12px",
              borderRadius: 11,
              border: "1px solid var(--line)",
              fontSize: 16,
              color: "var(--foreground)",
              background: "var(--background)",
            }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <strong style={{ fontSize: 14 }}>
            {t("settings.locationLabel")}{" "}
            <span style={{ color: "var(--muted)", fontWeight: 500 }}>
              {t("settings.optional")}
            </span>
          </strong>
          <input
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            style={{
              minHeight: 48,
              padding: "10px 12px",
              borderRadius: 11,
              border: "1px solid var(--line)",
              fontSize: 16,
              color: "var(--foreground)",
              background: "var(--background)",
            }}
          />
        </label>

        <button
          type="button"
          onClick={save}
          style={{
            minHeight: 50,
            border: 0,
            borderRadius: 12,
            background: "var(--brand)",
            color: "#ffffff",
            fontWeight: 900,
            fontSize: 16,
            cursor: "pointer",
          }}
        >
          {t("settings.save")}
        </button>

        {message && (
          <div
            style={{
              padding: 12,
              borderRadius: 11,
              background: message.isError ? "#fef2f2" : "#f0fdf4",
              color: message.isError ? "#b91c1c" : "#166534",
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            {message.text}
          </div>
        )}
      </section>
    </main>
  );
}

export default function SquareSettingsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24, color: "var(--muted)" }}>Loading…</div>}>
      <SquareSettingsContent />
    </Suspense>
  );
}

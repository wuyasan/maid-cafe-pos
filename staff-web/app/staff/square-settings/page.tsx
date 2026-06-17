"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  useRouter,
  useSearchParams,
} from "next/navigation";

import {
  getSquareConfig,
  saveSquareRuntimeConfig,
  SQUARE_RUNTIME_CONFIG_KEY,
} from "@/lib/squarePos";

function safeReturnPath(value: string | null) {
  if (!value) {
    return "/staff";
  }

  if (
    !value.startsWith("/") ||
    value.startsWith("//")
  ) {
    return "/staff";
  }

  return value;
}

export default function SquareSettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const returnPath = useMemo(
    () =>
      safeReturnPath(
        searchParams.get("next"),
      ),
    [searchParams],
  );

  const [applicationId, setApplicationId] =
    useState("");
  const [callbackUrl, setCallbackUrl] =
    useState("");
  const [locationId, setLocationId] =
    useState("");
  const [message, setMessage] =
    useState("");

  useEffect(() => {
    try {
      const config = getSquareConfig();

      setApplicationId(
        config.applicationId,
      );
      setCallbackUrl(config.callbackUrl);
      setLocationId(
        config.locationId ?? "",
      );
    } catch {
      const raw =
        window.localStorage.getItem(
          SQUARE_RUNTIME_CONFIG_KEY,
        );

      if (!raw) {
        return;
      }

      try {
        const saved = JSON.parse(raw) as {
          applicationId?: string;
          callbackUrl?: string;
          locationId?: string;
        };

        setApplicationId(
          saved.applicationId ?? "",
        );
        setCallbackUrl(
          saved.callbackUrl ?? "",
        );
        setLocationId(
          saved.locationId ?? "",
        );
      } catch {
        // Ignore malformed stored settings.
      }
    }
  }, []);

  function save() {
    if (!applicationId.trim()) {
      setMessage(
        "Square Application ID is required.",
      );
      return;
    }

    if (!callbackUrl.trim()) {
      setMessage(
        "Square callback URL is required.",
      );
      return;
    }

    saveSquareRuntimeConfig({
      applicationId:
        applicationId.trim(),
      callbackUrl: callbackUrl.trim(),
      locationId:
        locationId.trim() || undefined,
    });

    setMessage(
      "Square settings saved. Returning to checkout...",
    );

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
        color: "#111827",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent:
            "space-between",
          gap: 12,
          alignItems: "center",
          marginBottom: 22,
        }}
      >
        <div>
          <h1 style={{ margin: 0 }}>
            Square Settings
          </h1>

          <p
            style={{
              color: "#64748b",
            }}
          >
            第一次在这台设备结账时填写一次即可。
          </p>
        </div>

        <Link
          href={returnPath}
          style={{
            padding: "10px 14px",
            borderRadius: 11,
            border:
              "1px solid #d1d5db",
            textDecoration: "none",
            color: "#111827",
            fontWeight: 850,
          }}
        >
          Cancel
        </Link>
      </div>

      <section
        style={{
          display: "grid",
          gap: 16,
          padding: 20,
          borderRadius: 18,
          border: "1px solid #e5e7eb",
          background: "#ffffff",
        }}
      >
        <label
          style={{
            display: "grid",
            gap: 6,
          }}
        >
          <strong>
            Square Application ID
          </strong>

          <input
            value={applicationId}
            onChange={(event) =>
              setApplicationId(
                event.target.value,
              )
            }
            placeholder="sq0idp-..."
            autoCapitalize="none"
            autoCorrect="off"
            style={{
              minHeight: 48,
              padding: "10px 12px",
              borderRadius: 11,
              border:
                "1px solid #cbd5e1",
              fontSize: 16,
            }}
          />
        </label>

        <label
          style={{
            display: "grid",
            gap: 6,
          }}
        >
          <strong>Callback URL</strong>

          <input
            value={callbackUrl}
            onChange={(event) =>
              setCallbackUrl(
                event.target.value,
              )
            }
            placeholder="https://your-domain/staff/square-callback"
            autoCapitalize="none"
            autoCorrect="off"
            inputMode="url"
            style={{
              minHeight: 48,
              padding: "10px 12px",
              borderRadius: 11,
              border:
                "1px solid #cbd5e1",
              fontSize: 16,
            }}
          />
        </label>

        <label
          style={{
            display: "grid",
            gap: 6,
          }}
        >
          <strong>
            Square Location ID
            {" "}
            <span
              style={{
                color: "#64748b",
                fontWeight: 500,
              }}
            >
              (optional)
            </span>
          </strong>

          <input
            value={locationId}
            onChange={(event) =>
              setLocationId(
                event.target.value,
              )
            }
            autoCapitalize="none"
            autoCorrect="off"
            style={{
              minHeight: 48,
              padding: "10px 12px",
              borderRadius: 11,
              border:
                "1px solid #cbd5e1",
              fontSize: 16,
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
            background: "#111827",
            color: "#ffffff",
            fontWeight: 900,
            fontSize: 16,
          }}
        >
          Save and Return to Checkout
        </button>

        {message ? (
          <div
            style={{
              padding: 12,
              borderRadius: 11,
              background: "#f1f5f9",
              color: "#334155",
              fontWeight: 750,
            }}
          >
            {message}
          </div>
        ) : null}
      </section>
    </main>
  );
}

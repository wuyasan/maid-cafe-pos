"use client";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setCookie } from "@/lib/cookies";

// Flips the `locale` cookie (no URL change) and refreshes RSC so server messages re-resolve.
export function LanguageToggle() {
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function setLocale(next: "zh" | "en") {
    if (next === locale) return;
    setCookie("locale", next);
    startTransition(() => router.refresh());
  }

  return (
    <div
      className="inline-flex items-center overflow-hidden rounded-full border text-sm font-semibold"
      style={{ borderColor: "var(--line)" }}
    >
      {(["zh", "en"] as const).map((l) => {
        const active = l === locale;
        return (
          <button
            key={l}
            type="button"
            onClick={() => setLocale(l)}
            disabled={pending}
            aria-pressed={active}
            className="px-3 py-1.5"
            style={
              active
                ? { background: "var(--foreground)", color: "var(--background)" }
                : { color: "var(--muted-2)" }
            }
          >
            {l === "zh" ? "中" : "EN"}
          </button>
        );
      })}
    </div>
  );
}

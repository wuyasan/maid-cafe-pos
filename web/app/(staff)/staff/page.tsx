import { getTranslations, getLocale } from "next-intl/server";
import Link from "next/link";
import { STAFF_VIEWS } from "@/lib/staffViews";

export default async function StaffHomePage() {
  const t = await getTranslations("staff");
  const locale = (await getLocale()) as "en" | "zh";

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold" style={{ color: "var(--foreground)" }}>
          {t("home.title")}
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          {t("home.subtitle")}
        </p>
      </header>

      {/* Tile grid — 2 columns on narrow, 3 on wide */}
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}
      >
        {STAFF_VIEWS.map((view) => (
          <Link
            key={view.id}
            href={view.href}
            className="group flex flex-col items-start gap-3 rounded-2xl p-5 transition-shadow hover:shadow-md"
            style={{
              background: "var(--card)",
              border: "1px solid var(--line)",
              minHeight: "var(--tap-min)",
            }}
          >
            {/* Icon */}
            <span
              className="flex h-11 w-11 items-center justify-center rounded-xl"
              style={{ background: "rgba(201,72,106,0.08)", color: "var(--brand)" }}
              dangerouslySetInnerHTML={{ __html: view.icon }}
              aria-hidden="true"
            />
            {/* Label */}
            <div>
              <div className="font-semibold" style={{ color: "var(--foreground)" }}>
                {view.label[locale]}
              </div>
              <div className="mt-0.5 text-xs leading-snug" style={{ color: "var(--muted)" }}>
                {view.description[locale]}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

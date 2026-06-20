import { getTranslations } from "next-intl/server";
import { api } from "@/lib/server/api-client";
import { LanguageToggle } from "@/components/i18n/LanguageToggle";
import { OrderClient } from "./OrderClient";

// Table-scoped, rendered per request. Semi-static data (menu/maids) is still served
// from the tag-cached fetches inside api-client; the bill is fetched no-store.
export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ tableCode: string }>;
  searchParams: Promise<{ source?: string }>;
}) {
  const { tableCode } = await params;
  const { source } = await searchParams;
  const t = await getTranslations("customer");
  const session = await api.getCurrentSession();

  if (!session) {
    return (
      <main
        style={{
          minHeight: "100dvh",
          background: "var(--background)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "0 22px",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
          }}
        >
          {/* Fake eyebrow + title */}
          <div style={{ paddingTop: 12 }}>
            <div
              style={{
                fontSize: 11,
                letterSpacing: "0.14em",
                color: "var(--muted-2)",
                textTransform: "uppercase",
                fontFamily: "var(--font-num-stack)",
                fontWeight: 600,
              }}
            >
              Moonlight · Tonight
            </div>
            <h1
              style={{
                fontFamily: "var(--font-display-stack)",
                fontWeight: 700,
                fontSize: 24,
                color: "var(--foreground)",
                lineHeight: 1.2,
                marginTop: 2,
              }}
            >
              {tableCode} 号桌
            </h1>
          </div>
          <div style={{ paddingTop: 8 }}>
            <LanguageToggle />
          </div>
        </div>

        {/* No-session state */}
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 24px",
          }}
        >
          <div style={{ width: "100%", maxWidth: 400, textAlign: "center" }}>
            {/* Floating moon icon */}
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: "50%",
                background: "#fff",
                border: "1px solid rgba(58,42,48,0.08)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 12px",
                animation: "softFloat 3s ease-in-out infinite",
              }}
            >
              <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="#B0989E" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M19 4a9 9 0 1 1-9.5 14.5A7 7 0 0 0 19 4Z" />
              </svg>
            </div>
            <div
              style={{
                fontFamily: "var(--font-display-stack)",
                fontWeight: 700,
                fontSize: 15,
                color: "var(--foreground)",
              }}
            >
              {t("noSession")}
            </div>
            <div style={{ fontSize: 12, color: "var(--muted-2)", marginTop: 3 }}>
              {t("noSessionHint")}
            </div>
          </div>
        </div>
      </main>
    );
  }

  const [items, categories, maids, initialBill] = await Promise.all([
    api.getMenuItems(),
    api.getCategories(),
    api.getSessionMaids(session.id),
    api.getTableBill(tableCode),
  ]);

  return (
    <main
      style={{
        minHeight: "100dvh",
        background: "var(--background)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ── App header ─────────────────────────────────────────────────────── */}
      <header
        style={{
          padding: "6px 22px 14px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              letterSpacing: "0.14em",
              color: "var(--muted-2)",
              textTransform: "uppercase",
              fontFamily: "var(--font-num-stack)",
              fontWeight: 600,
            }}
          >
            {session.name}
          </div>
          <h1
            style={{
              fontFamily: "var(--font-display-stack)",
              fontWeight: 700,
              fontSize: 24,
              color: "var(--foreground)",
              lineHeight: 1.2,
              marginTop: 2,
            }}
          >
            {tableCode} 号桌
          </h1>
          <div style={{ fontSize: 11, color: "var(--muted-2)" }}>
            Table {tableCode}
          </div>
        </div>
        <div style={{ paddingTop: 4 }}>
          <LanguageToggle />
        </div>
      </header>

      {/* ── Main content ────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, padding: "0 22px 24px" }}>
        <OrderClient
          tableCode={tableCode}
          items={items}
          categories={categories}
          maids={maids}
          initialBill={initialBill}
          source={source === "staff" ? "staff" : "qr"}
        />
      </div>
    </main>
  );
}

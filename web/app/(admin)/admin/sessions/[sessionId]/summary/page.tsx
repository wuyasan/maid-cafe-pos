import { notFound } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { api } from "@/lib/server/api-client";
import { ApiError } from "@/lib/server/api-client";
import {
  adminCard,
  btnSecondary,
  pageTitle,
  pageSubtitle,
} from "@/components/admin/adminStyles";
import type { SessionSummaryItem } from "@/lib/types";

type Props = {
  params: Promise<{ sessionId: string }>;
};

function money(value: string | number | null | undefined): string {
  return `$${Number(value ?? 0).toFixed(2)}`;
}

function ItemQuantitySummary({ item, t }: { item: SessionSummaryItem; t: Awaited<ReturnType<typeof getTranslations<"admin.summary">>> }) {
  return (
    <div style={{ display: "grid", gap: 4, minWidth: 180, textAlign: "right" }}>
      <strong style={{ fontSize: 16, fontFamily: "var(--font-num-stack)" }}>
        {t("totalUnits", { n: item.total_ordered })}
      </strong>
      <span style={{ color: "var(--muted)", fontSize: 13 }}>
        {t("direct", { n: item.direct_ordered })}
        {item.from_sets > 0 ? ` · ${t("fromSets", { n: item.from_sets })}` : ""}
      </span>
      <span style={{ color: "var(--ready)", fontWeight: 700 }}>
        {t("directSales", { amount: money(item.total_sales) })}
      </span>
    </div>
  );
}

export default async function SessionSummaryPage({ params }: Props) {
  const { sessionId: sessionIdStr } = await params;
  const sessionId = parseInt(sessionIdStr, 10);

  if (Number.isNaN(sessionId)) notFound();

  const t = await getTranslations("admin.summary");

  let data;
  try {
    data = await api.getSessionSummary(sessionId);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }

  // Compute aggregates
  const totalSales = data.items.reduce((sum, item) => sum + Number(item.total_sales), 0);
  const maidServiceSales = data.items
    .filter((item) => item.item_type === "maid_service")
    .reduce((sum, item) => sum + Number(item.total_sales), 0);
  const totalOrdered = data.items.reduce((sum, item) => sum + item.total_ordered, 0);

  const statCards = [
    { label: t("totalSalesLabel") ?? "总销售 Total Sales", value: money(totalSales), color: "var(--ready)", numColor: "var(--foreground)" },
    { label: t("maidSalesLabel") ?? "女仆服务 Maid Service", value: money(maidServiceSales), color: "var(--maid)", numColor: "var(--maid)" },
    { label: t("totalUnitsLabel") ?? "订单数 Units", value: String(totalOrdered), color: "var(--brand)", numColor: "var(--brand)" },
    { label: t("lineItemsLabel") ?? "品项数 Items", value: String(data.items.length), color: "var(--muted)", numColor: "var(--foreground)" },
  ];

  return (
    <div style={{ padding: "20px 16px", maxWidth: 960, display: "grid", gap: 24 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
        <div>
          <h1 style={pageTitle}>{t("title")}</h1>
          <p style={pageSubtitle}>{data.session_name}</p>
        </div>
        <Link href="/admin/sessions" style={btnSecondary}>
          ← {t("back")}
        </Link>
      </div>

      {/* Stat tiles — mirrors design: Space Grotesk num font, 28px, colored */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14 }}>
        {statCards.map(({ label, value, color, numColor }) => (
          <div
            key={label}
            style={{
              background: "var(--background)",
              border: "1px solid var(--line)",
              borderRadius: 16,
              padding: 18,
              borderTop: `3px solid ${color}`,
            }}
          >
            <div style={{ fontSize: 12, color: "var(--muted-2)", marginBottom: 6 }}>{label}</div>
            <div
              className="num"
              style={{ fontSize: 28, fontWeight: 700, color: numColor, lineHeight: 1.1 }}
            >
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* Notice */}
      <div style={{
        padding: "12px 16px",
        borderRadius: 12,
        background: "#EFF6FF",
        color: "#1E3A8A",
        border: "1px solid #BFDBFE",
        fontSize: 13,
      }}>
        {t("notice")}
      </div>

      {data.items.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>{t("noOrders")}</p>
      ) : null}

      {/* Item list */}
      <div style={{ display: "grid", gap: 14 }}>
        {data.items.map((item) => (
          <section
            key={item.menu_item_id}
            style={{
              ...adminCard,
              border: item.is_bundle ? "2px solid #A5B4FC" : "1px solid var(--line)",
            }}
          >
            {/* Item header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <strong style={{ fontSize: 17, color: "var(--foreground)" }}>{item.menu_item_name}</strong>
                  {item.is_bundle ? (
                    <span style={{ padding: "3px 9px", borderRadius: 999, background: "#E0E7FF", color: "#3730A3", fontSize: 11, fontWeight: 800 }}>
                      {t("tagSet")}
                    </span>
                  ) : null}
                  {item.from_sets > 0 ? (
                    <span style={{ padding: "3px 9px", borderRadius: 999, background: "#FEF3C7", color: "#92400E", fontSize: 11, fontWeight: 800 }}>
                      {t("tagFromSet", { n: item.from_sets })}
                    </span>
                  ) : null}
                </div>
                <div style={{ color: "var(--muted-2)", fontSize: 12, marginTop: 3 }}>{item.item_type}</div>
              </div>
              <ItemQuantitySummary item={item} t={t} />
            </div>

            {/* Set components */}
            {item.is_bundle && item.set_components.length > 0 ? (
              <div style={{ display: "grid", gap: 8, padding: 14, borderRadius: 12, background: "#F5F3FF", border: "1px solid #DDD6FE" }}>
                <strong style={{ color: "#5B21B6", fontSize: 13 }}>{t("setContents")}</strong>
                {item.set_components.map((component) => (
                  <div key={`${item.menu_item_id}-${component.menu_item_id}`} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 10px", borderRadius: 10, background: "var(--card)", flexWrap: "wrap", fontSize: 13 }}>
                    <span style={{ color: "var(--foreground)" }}>{component.menu_item_name}</span>
                    <span style={{ color: "var(--muted)", fontWeight: 700 }}>
                      {t("perSet", { n: component.quantity_per_set })} · {t("total", { n: component.total_quantity_from_set })}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}

            {/* From-set breakdown */}
            {item.from_set_breakdown.length > 0 ? (
              <div style={{ display: "grid", gap: 8, padding: 14, borderRadius: 12, background: "#FFFBEB", border: "1px solid #FDE68A" }}>
                <strong style={{ color: "#92400E", fontSize: 13 }}>{t("fromSetBreakdown")}</strong>
                {item.from_set_breakdown.map((source) => (
                  <div key={`${item.menu_item_id}-${source.set_menu_item_id}`} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 10px", borderRadius: 10, background: "var(--card)", flexWrap: "wrap", fontSize: 13 }}>
                    <span style={{ color: "var(--foreground)" }}>{source.set_menu_item_name}</span>
                    <span style={{ color: "#92400E", fontWeight: 700 }}>
                      {t("sets", { n: source.set_quantity_ordered })} × {source.component_quantity_per_set} = {t("units", { n: source.quantity_from_set })}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}

            {/* Maid breakdown */}
            {item.item_type === "maid_service" ? (
              <div style={{ display: "grid", gap: 8 }}>
                <strong style={{ fontSize: 13, color: "var(--foreground)" }}>{t("maidBreakdown")}</strong>
                {item.maid_breakdown.length === 0 ? (
                  <div style={{ color: "var(--muted)", fontSize: 13 }}>{t("noMaidSelections")}</div>
                ) : (
                  <div style={{ display: "grid", gap: 6 }}>
                    {item.maid_breakdown.map((maid) => (
                      <div key={`${item.menu_item_id}-${maid.maid_id}`} style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", borderRadius: 10, background: "rgba(142,134,201,0.08)", fontSize: 13 }}>
                        <span style={{ color: "var(--foreground)" }}>{maid.maid_name}</span>
                        <span style={{ color: "var(--maid)", fontWeight: 700 }}>{maid.total_ordered}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </section>
        ))}
      </div>
    </div>
  );
}

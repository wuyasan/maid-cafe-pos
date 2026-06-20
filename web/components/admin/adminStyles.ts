/**
 * Shared admin design tokens & style factories.
 * Mirrors the design spec (Section 3: ADMIN, lines 771-1047) 1:1.
 * Import these in every admin Client component for visual consistency.
 */

// ── Card / surface ─────────────────────────────────────────────────────────────

export const adminCard: React.CSSProperties = {
  background: "var(--card)",
  border: "1px solid var(--line)",
  borderRadius: 16,
  padding: "18px 20px",
  boxShadow: "0 4px 20px rgba(58,42,48,0.07)",
};

/** Active session row — highlighted with brand tint */
export const adminCardActive: React.CSSProperties = {
  background: "#FCF1F4",
  border: "1.5px solid #E0607E",
  borderRadius: 14,
  padding: "15px 18px",
};

/** Normal session / list row */
export const adminCardRow: React.CSSProperties = {
  background: "var(--background)",
  border: "1px solid var(--line)",
  borderRadius: 14,
  padding: "15px 18px",
};

// ── Stat card (metric tile) ────────────────────────────────────────────────────

export const statCard: React.CSSProperties = {
  background: "var(--background)",
  border: "1px solid var(--line)",
  borderRadius: 16,
  padding: 18,
};

// ── Form controls ──────────────────────────────────────────────────────────────

export const adminInput: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: 10,
  border: "1px solid var(--line)",
  background: "var(--card)",
  color: "var(--foreground)",
  fontSize: 14,
  minHeight: "var(--tap-min)",
  boxSizing: "border-box",
  outline: "none",
};

export const adminLabel: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 700,
  color: "var(--muted)",
  marginBottom: 5,
  letterSpacing: "0.01em",
};

// ── Buttons ────────────────────────────────────────────────────────────────────

export const btnPrimary: React.CSSProperties = {
  minHeight: "var(--tap-min)",
  padding: "0 20px",
  borderRadius: 12,
  border: "none",
  background: "var(--brand)",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: 13.5,
  boxShadow: "0 10px 22px -12px rgba(201,72,106,0.8)",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  whiteSpace: "nowrap" as const,
};

export const btnPrimaryDisabled: React.CSSProperties = {
  ...btnPrimary,
  background: "var(--muted-2)",
  cursor: "not-allowed",
  boxShadow: "none",
  opacity: 0.7,
};

export const btnSecondary: React.CSSProperties = {
  minHeight: "var(--tap-min)",
  padding: "0 16px",
  borderRadius: 10,
  border: "1.5px solid var(--line)",
  background: "var(--card)",
  color: "var(--foreground)",
  fontWeight: 600,
  cursor: "pointer",
  fontSize: 13,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
};

export const btnDanger: React.CSSProperties = {
  minHeight: "var(--tap-min)",
  padding: "0 14px",
  borderRadius: 10,
  border: "1px solid #fecaca",
  background: "#fff7f7",
  color: "#b91c1c",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: 13,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

export const btnIndigo: React.CSSProperties = {
  minHeight: "var(--tap-min)",
  padding: "0 16px",
  borderRadius: 10,
  border: "none",
  background: "#4f46e5",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: 13,
  display: "inline-flex",
  alignItems: "center",
};

// ── Page header ────────────────────────────────────────────────────────────────

export const pageTitle: React.CSSProperties = {
  margin: 0,
  fontSize: 24,
  fontWeight: 700,
  color: "var(--foreground)",
  fontFamily: "var(--font-display-stack)",
};

export const pageSubtitle: React.CSSProperties = {
  margin: "5px 0 0",
  fontSize: 12.5,
  color: "var(--muted-2)",
  lineHeight: 1.5,
};

// ── Section heading ────────────────────────────────────────────────────────────

export const sectionHeading: React.CSSProperties = {
  margin: "0 0 12px",
  fontSize: 17,
  fontWeight: 700,
  color: "var(--foreground)",
  fontFamily: "var(--font-display-stack)",
};

// ── Inline pill badge (session status) ────────────────────────────────────────

export function sessionStatusStyle(
  status: "scheduled" | "active" | "winding_down" | "closed" | string,
): React.CSSProperties {
  switch (status) {
    case "active":
      return { background: "#E6F1EA", color: "#3F8763" };
    case "closed":
      return { background: "#EEE8E5", color: "#8A7873" };
    case "winding_down":
      return { background: "#FEF3C7", color: "#92400E" };
    default: // scheduled
      return { background: "#EDEBF6", color: "#6E66A8" };
  }
}

export const pillBadge: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "6px 13px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 600,
  lineHeight: 1,
};

// ── Station badge ─────────────────────────────────────────────────────────────

export function stationBadgeStyle(
  station: "kitchen" | "bar" | "none" | string,
): React.CSSProperties {
  switch (station) {
    case "kitchen":
      return { background: "#dcfce7", color: "#166534" };
    case "bar":
      return { background: "#dbeafe", color: "#1d4ed8" };
    default:
      return { background: "#f3f4f6", color: "#4b5563" };
  }
}

// ── Error banner ──────────────────────────────────────────────────────────────

export const errorBanner: React.CSSProperties = {
  padding: "11px 16px",
  borderRadius: 12,
  background: "#FFF0F0",
  color: "#b91c1c",
  fontSize: 13,
  border: "1px solid #fecaca",
};

// ── Page layout wrapper ───────────────────────────────────────────────────────

export const pageWrap: React.CSSProperties = {
  padding: "20px 16px",
  maxWidth: 960,
  display: "grid",
  gap: 22,
};

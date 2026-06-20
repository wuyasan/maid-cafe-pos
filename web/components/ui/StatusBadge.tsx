/**
 * StatusBadge — pill-shaped status indicator.
 * Variants match the SECTION 4 COMPONENTS "状态徽章 STATUS" panel exactly.
 *
 * Usage:
 *   <StatusBadge status="empty" />
 *   <StatusBadge status="cooking" />
 *   <StatusBadge status="full" />
 *   <StatusBadge status="checkout" />
 *   <StatusBadge status="ready" />
 *   <StatusBadge status="closed" />
 */
import type { ReactNode } from "react";

export type StatusVariant =
  | "empty"
  | "cooking"
  | "full"
  | "checkout"
  | "ready"
  | "closed";

// Design-exact colors from SECTION 4
const STATUS_STYLES: Record<
  StatusVariant,
  { bg: string; text: string; strikethrough?: boolean; label: ReactNode }
> = {
  empty:    { bg: "#EEE8E5", text: "#8A7873", label: "空 Empty" },
  cooking:  { bg: "#FAEFDD", text: "#A87E2E", label: "制作中 Cooking" },
  full:     { bg: "#FBEAEE", text: "#C9486A", label: "满 Full" },
  checkout: { bg: "#EDEBF6", text: "#6E66A8", label: "结账中" },
  ready:    { bg: "#E6F1EA", text: "#3F8763", label: "可取 / 已付" },
  closed:   { bg: "#F4E7E9", text: "#A8567E", strikethrough: true, label: "已截单 Closed" },
};

interface StatusBadgeProps {
  status: StatusVariant;
  label?: string; // override default label
  style?: React.CSSProperties;
}

export function StatusBadge({ status, label, style }: StatusBadgeProps) {
  const s = STATUS_STYLES[status];
  return (
    <span
      style={{
        display: "inline-block",
        background: s.bg,
        color: s.text,
        fontSize: "12px",
        fontWeight: 600,
        padding: "6px 13px",
        borderRadius: "9999px",
        textDecoration: s.strikethrough ? "line-through" : undefined,
        ...style,
      }}
    >
      {label ?? s.label}
    </span>
  );
}

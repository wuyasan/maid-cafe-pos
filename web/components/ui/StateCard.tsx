/**
 * StateCard — empty / loading / error state containers.
 * Matches the "空 / 加载 / 错误 STATES" trio in SECTION 4 COMPONENTS.
 *
 * Usage:
 *   <StateCard variant="empty" title="空状态" hint="暂无内容 ♡" />
 *   <StateCard variant="loading" title="加载中" />
 *   <StateCard variant="error" title="错误 · 重试" onRetry={() => refetch()} />
 */
import { Spinner } from "./Spinner";

export type StateVariant = "empty" | "loading" | "error";

interface StateCardProps {
  variant: StateVariant;
  title?: string;
  hint?: string;
  /** Called when user clicks the error card (retry). */
  onRetry?: () => void;
  style?: React.CSSProperties;
}

function SearchIcon() {
  return (
    <svg
      width={26}
      height={26}
      viewBox="0 0 24 24"
      stroke="#B0989E"
      strokeWidth="1.5"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ margin: "0 auto", display: "block" }}
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg
      width={26}
      height={26}
      viewBox="0 0 24 24"
      stroke="#C9486A"
      strokeWidth="1.7"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ margin: "0 auto", display: "block" }}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5M12 16h.01" />
    </svg>
  );
}

export function StateCard({ variant, title, hint, onRetry, style }: StateCardProps) {
  const isError = variant === "error";
  return (
    <div
      role={isError ? "alert" : undefined}
      onClick={isError && onRetry ? onRetry : undefined}
      style={{
        flex: 1,
        background: isError ? "#FCF1F4" : "#FBF6F3",
        border: isError
          ? "1px solid rgba(201,72,106,0.18)"
          : "1px solid rgba(58,42,48,0.06)",
        borderRadius: "14px",
        padding: "18px",
        textAlign: "center",
        cursor: isError && onRetry ? "pointer" : undefined,
        ...style,
      }}
    >
      {variant === "empty" && <SearchIcon />}
      {variant === "loading" && (
        <Spinner style={{ margin: "0 auto", display: "inline-block" }} />
      )}
      {variant === "error" && <ErrorIcon />}

      {title && (
        <div
          style={{
            fontWeight: 600,
            fontSize: "13.5px",
            marginTop: variant === "loading" ? "10px" : "8px",
            color: isError ? "#C9486A" : "var(--foreground)",
          }}
        >
          {title}
        </div>
      )}
      {hint && (
        <div style={{ fontSize: "11px", color: "#A8959A", marginTop: "2px" }}>
          {hint}
        </div>
      )}
    </div>
  );
}

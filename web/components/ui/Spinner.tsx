/**
 * Spinner — circular loading indicator.
 * Matches the "加载中" state in SECTION 4 COMPONENTS.
 * Animation: spin keyframe (defined in globals.css).
 *
 * Usage:
 *   <Spinner />
 *   <Spinner size={26} color="#C9486A" />
 */

interface SpinnerProps {
  /** Diameter in px. Defaults to 26. */
  size?: number;
  /** Border color. Defaults to brand rose. */
  color?: string;
  style?: React.CSSProperties;
}

export function Spinner({ size = 26, color = "#C9486A", style }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label="Loading"
      style={{
        display: "inline-block",
        width: size,
        height: size,
        border: `3px solid ${color}`,
        borderTopColor: "transparent",
        borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
        flexShrink: 0,
        ...style,
      }}
    />
  );
}

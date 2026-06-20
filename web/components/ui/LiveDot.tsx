/**
 * LiveDot — animated pulsing dot indicating real-time status.
 * Animation: liveDot keyframe (defined in globals.css).
 *
 * Usage:
 *   <LiveDot />
 *   <LiveDot color="#7BAE8E" size={8} />
 */

interface LiveDotProps {
  /** Dot color. Defaults to brand rose. */
  color?: string;
  /** Dot diameter in px. Defaults to 7. */
  size?: number;
  style?: React.CSSProperties;
}

export function LiveDot({ color = "#C9486A", size = 7, style }: LiveDotProps) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        animation: "liveDot 1.4s ease-in-out infinite",
        flexShrink: 0,
        ...style,
      }}
    />
  );
}

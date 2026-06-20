/**
 * Button — design system primitive.
 * Variants match the SECTION 4 COMPONENTS panel exactly.
 *
 * Usage:
 *   <Button variant="primary">主要 Primary</Button>
 *   <Button variant="dark">深色 Dark</Button>
 *   <Button variant="secondary">次要 Secondary</Button>
 *   <Button variant="outline">描边 Outline</Button>
 *   <Button variant="success">成功 Success</Button>
 *   <Button variant="disabled" disabled>禁用 Disabled</Button>
 */
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant =
  | "primary"
  | "dark"
  | "secondary"
  | "outline"
  | "success"
  | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  children: ReactNode;
}

const STYLES: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    background: "#C9486A",
    color: "#fff",
    boxShadow: "0 8px 18px -10px rgba(201,72,106,0.8)",
  },
  dark: {
    background: "#3A2A30",
    color: "#fff",
  },
  secondary: {
    background: "#F3F1FA",
    color: "#6E66A8",
  },
  outline: {
    background: "transparent",
    color: "#3A2A30",
    border: "1.5px solid rgba(58,42,48,0.16)",
  },
  success: {
    background: "#7BAE8E",
    color: "#fff",
  },
  ghost: {
    background: "#EEE8E5",
    color: "#B0989E",
  },
};

export function Button({
  variant = "primary",
  children,
  disabled,
  style,
  ...props
}: ButtonProps) {
  const variantStyle = disabled ? STYLES.ghost : STYLES[variant];
  return (
    <button
      disabled={disabled}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "12px",
        padding: "11px 20px",
        fontWeight: 600,
        fontSize: "13.5px",
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 1 : 1,
        minHeight: "var(--tap-min)",
        fontFamily: "inherit",
        transition: "opacity 0.15s ease",
        ...variantStyle,
        ...style,
      }}
      {...props}
    >
      {children}
    </button>
  );
}

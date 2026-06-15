import Link from "next/link";

type Props = {
  emoji: string;
  title: string;
  subtitle: string;
  description: string;
  nextSteps: string[];
};

export default function ComingSoonView({
  emoji,
  title,
  subtitle,
  description,
  nextSteps,
}: Props) {
  return (
    <section
      style={{
        minHeight: "calc(100vh - 150px)",
        display: "grid",
        placeItems: "center",
      }}
    >
      <div
        style={{
          width: "min(720px, 100%)",
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 24,
          padding: 28,
          boxShadow: "0 12px 35px rgba(17,24,39,0.08)",
        }}
      >
        <div style={{ fontSize: 52, marginBottom: 14 }}>{emoji}</div>
        <h1 style={{ margin: 0, fontSize: 34 }}>{title}</h1>
        <p style={{ margin: "6px 0 0", color: "#6b7280", fontWeight: 700 }}>
          {subtitle}
        </p>
        <p style={{ margin: "22px 0", color: "#374151", lineHeight: 1.7 }}>
          {description}
        </p>

        <div
          style={{
            background: "#f9fafb",
            borderRadius: 16,
            padding: 18,
            marginBottom: 22,
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: 10 }}>This view will include</div>
          <ul style={{ margin: 0, paddingLeft: 22, lineHeight: 1.9, color: "#4b5563" }}>
            {nextSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        </div>

        <Link
          href="/staff"
          style={{
            display: "inline-flex",
            minHeight: 46,
            alignItems: "center",
            justifyContent: "center",
            padding: "10px 18px",
            borderRadius: 12,
            background: "#111827",
            color: "#fff",
            textDecoration: "none",
            fontWeight: 800,
          }}
        >
          Choose Another View
        </Link>
      </div>
    </section>
  );
}

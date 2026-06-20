"use client";
import { useTranslations } from "next-intl";
import { useTransition, useState, useMemo, useEffect } from "react";
import { setSessionMaidAvailability } from "@/lib/server/actions/admin";
import {
  adminCard,
  pageTitle,
  pageSubtitle,
  errorBanner,
} from "@/components/admin/adminStyles";
import type { SessionRead, MaidAdmin, SessionMaidAdminRead } from "@/lib/types";

interface SessionMaidsClientProps {
  initialSessions: SessionRead[];
  initialMaids: MaidAdmin[];
}

export function SessionMaidsClient({ initialSessions, initialMaids }: SessionMaidsClientProps) {
  const t = useTranslations("admin.sessionMaids");

  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(
    initialSessions.find((s) => s.status === "active")?.id ?? initialSessions[0]?.id ?? null,
  );
  const [sessionMaids, setSessionMaids] = useState<SessionMaidAdminRead[]>([]);
  const [loadingMaids, setLoadingMaids] = useState(false);
  const [savingMaidId, setSavingMaidId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(() => {
      if (cancelled) return;
      if (!selectedSessionId) { setSessionMaids([]); setLoadingMaids(false); return; }
      setLoadingMaids(true);
      fetch(`/api/admin/session-maids?session_id=${selectedSessionId}`)
        .then((r) => r.json() as Promise<SessionMaidAdminRead[]>)
        .then((data) => { if (!cancelled) setSessionMaids(data); })
        .catch((err) => { if (!cancelled) setActionError(err instanceof Error ? err.message : "Failed to load"); })
        .finally(() => { if (!cancelled) setLoadingMaids(false); });
    }, 0);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [selectedSessionId]);

  const relationByMaidId = useMemo(
    () => new Map(sessionMaids.map((row) => [row.maid_id, row])),
    [sessionMaids],
  );

  const activeMaids = useMemo(
    () => initialMaids.filter((m) => m.is_active).sort((a, b) => a.display_order - b.display_order || a.id - b.id),
    [initialMaids],
  );

  const availableCount = sessionMaids.filter((r) => r.is_available).length;

  function toggleAvailability(maid: MaidAdmin) {
    if (!selectedSessionId) return;
    const current = relationByMaidId.get(maid.id);
    const newVal = !(current?.is_available ?? false);
    setActionError(null);
    setSavingMaidId(maid.id);
    startTransition(async () => {
      const result = await setSessionMaidAvailability(selectedSessionId, maid.id, newVal);
      setSavingMaidId(null);
      if (!result.ok) { setActionError(result.error); return; }
      setSessionMaids((prev) => {
        const idx = prev.findIndex((r) => r.maid_id === maid.id);
        if (idx === -1) return [...prev, result.data];
        return prev.map((r, i) => (i === idx ? result.data : r));
      });
    });
  }

  const selectedSession = initialSessions.find((s) => s.id === selectedSessionId) ?? null;

  return (
    <div style={{ display: "grid", gap: 24 }}>
      {/* Header */}
      <div>
        <h1 style={pageTitle}>{t("title")}</h1>
        <p style={pageSubtitle}>{t("subtitle")}</p>
      </div>

      {actionError ? <div style={errorBanner}>{actionError}</div> : null}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 260px) minmax(0, 1fr)", gap: 20, alignItems: "start" }}>
        {/* Session list sidebar */}
        <aside style={{ ...adminCard, display: "grid", gap: 6, position: "sticky", top: 16 }}>
          <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            {t("sessions")}
          </p>
          {initialSessions.map((s) => {
            const active = s.id === selectedSessionId;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedSessionId(s.id)}
                style={{
                  textAlign: "left",
                  padding: "11px 12px",
                  borderRadius: 11,
                  border: active ? "2px solid var(--brand)" : "1px solid var(--line)",
                  background: active ? "rgba(201,72,106,0.08)" : "var(--background)",
                  cursor: "pointer",
                  minHeight: "var(--tap-min)",
                  width: "100%",
                }}
              >
                <strong style={{ color: "var(--foreground)", fontSize: 14 }}>{s.name}</strong>
                <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 2 }}>
                  {s.service_date} · {s.status}
                </div>
              </button>
            );
          })}
        </aside>

        {/* Main content */}
        <main style={{ display: "grid", gap: 14 }}>
          {/* Subheader */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--foreground)", fontFamily: "var(--font-display-stack)" }}>{t("allMaids")}</h2>
              <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 3 }}>
                {selectedSession ? selectedSession.name : t("selectSession")}
              </div>
            </div>
            {selectedSessionId ? (
              <span style={{ fontWeight: 700, fontSize: 14, color: "var(--ready)" }}>
                {availableCount} {t("available")}
              </span>
            ) : null}
          </div>

          {!selectedSessionId ? (
            <div style={{ ...adminCard, color: "var(--muted)", textAlign: "center" }}>{t("pleaseSelect")}</div>
          ) : loadingMaids ? (
            <div style={{ ...adminCard, color: "var(--muted)", textAlign: "center" }}>{t("loading")}</div>
          ) : activeMaids.length === 0 ? (
            <div style={{ ...adminCard, color: "var(--muted)", textAlign: "center" }}>{t("noMaids")}</div>
          ) : (
            activeMaids.map((maid) => {
              const relation = relationByMaidId.get(maid.id);
              const available = relation?.is_available ?? false;
              const saving = savingMaidId === maid.id || (actionPending && savingMaidId === maid.id);

              return (
                <div
                  key={maid.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 14,
                    flexWrap: "wrap",
                    padding: "14px 18px",
                    borderRadius: 14,
                    border: available ? "2px solid var(--ready)" : "1px solid var(--line)",
                    background: available ? "#F0FDF4" : "var(--background)",
                    opacity: available ? 1 : 0.8,
                    transition: "opacity 0.2s, border-color 0.2s",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    {maid.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={maid.photo_url} alt={maid.name} style={{ width: 52, height: 52, borderRadius: "50%", objectFit: "cover", border: "2px solid var(--line)", flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 52, height: 52, borderRadius: "50%", background: "var(--maid)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 20, color: "#fff", flexShrink: 0 }}>
                        {maid.name.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <strong style={{ color: "var(--foreground)", fontSize: 15 }}>{maid.name}</strong>
                      <div style={{ color: available ? "var(--ready)" : "var(--muted)", fontSize: 12, fontWeight: 700, marginTop: 2 }}>
                        {available ? t("available") : t("unavailable")}
                      </div>
                      {maid.bio ? (
                        <div style={{ color: "var(--muted-2)", fontSize: 12, marginTop: 2, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{maid.bio}</div>
                      ) : null}
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={saving || !selectedSessionId}
                    onClick={() => toggleAvailability(maid)}
                    style={{
                      minHeight: "var(--tap-min)",
                      padding: "0 18px",
                      borderRadius: 10,
                      border: "none",
                      background: saving ? "var(--muted-2)" : available ? "#dc2626" : "var(--ready)",
                      color: "#fff",
                      fontWeight: 700,
                      cursor: saving ? "wait" : "pointer",
                      fontSize: 13,
                      opacity: saving ? 0.7 : 1,
                      minWidth: 150,
                    }}
                  >
                    {saving ? t("saving") : available ? t("setUnavailable") : t("setAvailable")}
                  </button>
                </div>
              );
            })
          )}
        </main>
      </div>
    </div>
  );
}

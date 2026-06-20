"use client";
import { useTranslations } from "next-intl";
import { useTransition, useState, useMemo, useEffect } from "react";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import {
  createSessionTable,
  syncActiveSessionTables,
  updateSessionTable,
  addPartyToSessionTable,
  deleteSessionTable,
} from "@/lib/server/actions/admin";
import {
  adminCard,
  adminInput,
  adminLabel,
  btnDanger,
  pageTitle,
  pageSubtitle,
  errorBanner,
  pillBadge,
} from "@/components/admin/adminStyles";
import type { SessionRead, TableRead, SessionTableAdminSummary, SessionTableStatus } from "@/lib/types";

function statusBadge(status: SessionTableStatus, partySize: number) {
  if (status === "paying") return { bg: "#FEF3C7", color: "#92400E", label: "Paying" };
  if (partySize === 0) return { bg: "#DCFCE7", color: "#166534", label: "Empty" };
  return { bg: "#DBEAFE", color: "#1D4ED8", label: "Seated" };
}

interface SessionTablesClientProps {
  initialSessions: SessionRead[];
  initialTables: TableRead[];
}

export function SessionTablesClient({ initialSessions, initialTables }: SessionTablesClientProps) {
  const t = useTranslations("admin.sessionTables");
  const { confirm, dialog: confirmDialog } = useConfirm();

  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(
    initialSessions.find((s) => s.status === "active")?.id ?? initialSessions[0]?.id ?? null,
  );
  const [sessionTables, setSessionTables] = useState<SessionTableAdminSummary[]>([]);
  const [loadingSessionTables, setLoadingSessionTables] = useState(false);

  const [addTableId, setAddTableId] = useState<number | "">("");
  const [addPartySize, setAddPartySize] = useState(0);

  const [busyId, setBusyId] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [newPartySizes, setNewPartySizes] = useState<Record<number, number>>({});
  const [actionPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(() => {
      if (cancelled) return;
      if (!selectedSessionId) { setSessionTables([]); setLoadingSessionTables(false); return; }
      setLoadingSessionTables(true);
      fetch(`/api/admin/session-tables?session_id=${selectedSessionId}`)
        .then((r) => r.json() as Promise<SessionTableAdminSummary[]>)
        .then((data) => { if (!cancelled) setSessionTables(data); })
        .catch((err) => { if (!cancelled) setActionError(err instanceof Error ? err.message : "Failed to load"); })
        .finally(() => { if (!cancelled) setLoadingSessionTables(false); });
    }, 0);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [selectedSessionId]);

  const activeTables = useMemo(() => initialTables.filter((t) => t.is_active), [initialTables]);
  const linkedTableIds = useMemo(() => new Set(sessionTables.map((st) => st.table_id)), [sessionTables]);
  const availableToAdd = useMemo(() => activeTables.filter((t) => !linkedTableIds.has(t.id)), [activeTables, linkedTableIds]);
  const selectedAddTable = activeTables.find((t) => t.id === addTableId) ?? null;

  function refreshSessionTables() {
    if (!selectedSessionId) return;
    fetch(`/api/admin/session-tables?session_id=${selectedSessionId}`)
      .then((r) => r.json() as Promise<SessionTableAdminSummary[]>)
      .then(setSessionTables)
      .catch((err) => setActionError(err instanceof Error ? err.message : "Failed to refresh"));
  }

  function handleAdd() {
    if (!selectedSessionId || addTableId === "") return;
    setActionError(null);
    startTransition(async () => {
      const result = await createSessionTable({ session_id: selectedSessionId, table_id: Number(addTableId), status: "available", current_party_size: addPartySize });
      if (!result.ok) { setActionError(result.error); return; }
      setAddTableId(""); setAddPartySize(0);
      refreshSessionTables();
    });
  }

  function handleSync() {
    if (!selectedSessionId) return;
    setActionError(null);
    setSyncing(true);
    startTransition(async () => {
      const result = await syncActiveSessionTables(selectedSessionId);
      setSyncing(false);
      if (!result.ok) { setActionError(result.error); return; }
      setSessionTables(result.data);
    });
  }

  function handleSetParty(st: SessionTableAdminSummary, newSize: number) {
    setActionError(null); setBusyId(st.id);
    startTransition(async () => {
      const result = await updateSessionTable(st.id, { current_party_size: newSize });
      setBusyId(null);
      if (!result.ok) { setActionError(result.error); return; }
      setSessionTables((prev) => prev.map((x) => x.id === result.data.id ? result.data : x));
    });
  }

  function handleAddParty(st: SessionTableAdminSummary) {
    const extra = newPartySizes[st.id] ?? 1;
    setActionError(null); setBusyId(st.id);
    startTransition(async () => {
      const result = await addPartyToSessionTable(st.id, { party_size: extra });
      setBusyId(null);
      if (!result.ok) { setActionError(result.error); return; }
      setSessionTables((prev) => prev.map((x) => x.id === result.data.id ? result.data : x));
      setNewPartySizes((prev) => ({ ...prev, [st.id]: 1 }));
    });
  }

  async function handleRemove(st: SessionTableAdminSummary) {
    if (!await confirm({
      title: t("confirmRemoveTitle", { code: st.table_code }),
      description: t("confirmRemoveDesc"),
    })) return;
    setActionError(null); setBusyId(st.id);
    startTransition(async () => {
      const result = await deleteSessionTable(st.id);
      setBusyId(null);
      if (!result.ok) { setActionError(result.error); return; }
      setSessionTables((prev) => prev.filter((x) => x.id !== st.id));
    });
  }

  const isPrimaryDisabled = (d: boolean): React.CSSProperties => ({
    minHeight: "var(--tap-min)",
    padding: "0 18px",
    borderRadius: 10,
    border: "none",
    background: d ? "var(--muted-2)" : "var(--brand)",
    color: "#fff",
    fontWeight: 700,
    cursor: d ? "not-allowed" : "pointer",
    fontSize: 13.5,
    whiteSpace: "nowrap" as const,
  });

  return (
    <>
    {confirmDialog}
    <div style={{ display: "grid", gap: 24 }}>
      {/* Header */}
      <div>
        <h1 style={pageTitle}>{t("title")}</h1>
        <p style={pageSubtitle}>{t("subtitle")}</p>
      </div>

      {actionError ? <div style={errorBanner}>{actionError}</div> : null}

      {/* Session + add panel */}
      <div style={adminCard}>
        <div style={{ display: "grid", gap: 16 }}>
          {/* Session selector + sync */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <label htmlFor="st-session" style={adminLabel}>{t("selectSession")}</label>
              <select id="st-session" value={selectedSessionId ?? ""} onChange={(e) => setSelectedSessionId(e.target.value ? Number(e.target.value) : null)} style={{ ...adminInput, paddingRight: 36 }}>
                <option value="">{t("noSession")}</option>
                {initialSessions.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.status})</option>
                ))}
              </select>
            </div>
            <button type="button" onClick={handleSync} disabled={!selectedSessionId || syncing || actionPending} style={isPrimaryDisabled(!selectedSessionId || syncing || actionPending)}>
              {syncing ? t("syncing") : t("syncActive")}
            </button>
          </div>

          {/* Add table manually */}
          <div style={{ borderTop: "1px solid var(--line)", paddingTop: 16 }}>
            <p style={{ margin: "0 0 12px", fontWeight: 700, color: "var(--foreground)", fontSize: 14 }}>{t("addManually")}</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 140px auto", gap: 10, alignItems: "end" }}>
              <div>
                <label htmlFor="st-add-table" style={adminLabel}>{t("table")}</label>
                <select id="st-add-table" value={addTableId} onChange={(e) => { setAddTableId(e.target.value ? Number(e.target.value) : ""); setAddPartySize(0); }} disabled={!selectedSessionId} style={{ ...adminInput, paddingRight: 36 }}>
                  <option value="">{t("selectTable")}</option>
                  {availableToAdd.map((t2) => (
                    <option key={t2.id} value={t2.id}>{t2.code} · {t2.seats}{t("seats")} {t2.is_shareable ? `· ${t("shareable")}` : ""}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="st-init-party" style={adminLabel}>{t("initialGuests")}</label>
                <input id="st-init-party" type="number" min={0} max={selectedAddTable?.seats ?? 0} value={addPartySize} disabled={!selectedAddTable} onChange={(e) => setAddPartySize(Math.min(selectedAddTable?.seats ?? 0, Math.max(0, Number(e.target.value))))} style={adminInput} />
              </div>
              <button type="button" onClick={handleAdd} disabled={!selectedSessionId || addTableId === "" || actionPending} style={isPrimaryDisabled(!selectedSessionId || addTableId === "" || actionPending)}>
                {t("addTable")}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Session table list */}
      {selectedSessionId === null ? (
        <div style={{ ...adminCard, color: "var(--muted)", textAlign: "center" }}>{t("pleaseSelect")}</div>
      ) : loadingSessionTables ? (
        <div style={{ ...adminCard, color: "var(--muted)", textAlign: "center" }}>{t("loading")}</div>
      ) : sessionTables.length === 0 ? (
        <div style={{ ...adminCard, color: "var(--muted)", textAlign: "center" }}>{t("noLinkedTables")}</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
          {sessionTables.map((st) => {
            const busy = busyId === st.id || (actionPending && busyId === st.id);
            const remaining = Math.max(0, st.seats - st.current_party_size);
            const badge = statusBadge(st.status, st.current_party_size);
            const canAddParty = st.status !== "paying" && remaining > 0 && (st.current_party_size === 0 || st.is_shareable);

            return (
              <article key={st.id} style={adminCard}>
                {/* Table header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
                  <div>
                    {/* Table code tile */}
                    <div style={{ fontWeight: 900, fontSize: 22, color: "var(--brand)", fontFamily: "var(--font-num-stack)" }}>{st.table_code}</div>
                    <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 3 }}>{t("capacity")}: {st.seats}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ ...pillBadge, background: badge.bg, color: badge.color, fontSize: 11, padding: "4px 9px" }}>
                      {badge.label}
                    </span>
                    {st.is_shareable ? (
                      <span style={{ ...pillBadge, background: "#EDE9FE", color: "#6D28D9", fontSize: 11, padding: "4px 9px" }}>
                        {t("shareable")}
                      </span>
                    ) : null}
                  </div>
                </div>

                {/* Stats */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 14 }}>
                  {([
                    [t("guests"), st.current_party_size],
                    [t("open"), remaining],
                    [t("capacity"), st.seats],
                  ] as [string, number][]).map(([label, val]) => (
                    <div key={label} style={{ background: "var(--background)", borderRadius: 10, padding: 10, textAlign: "center" }}>
                      <strong className="num" style={{ display: "block", fontSize: 20, color: "var(--foreground)" }}>{val}</strong>
                      <span style={{ color: "var(--muted)", fontSize: 11 }}>{label}</span>
                    </div>
                  ))}
                </div>

                {/* Correct party size */}
                <div style={{ marginTop: 14 }}>
                  <label htmlFor={`party-${st.id}`} style={adminLabel}>{t("correctPartySize")}</label>
                  <select id={`party-${st.id}`} value={st.current_party_size} disabled={busy || st.status === "paying"} onChange={(e) => handleSetParty(st, Number(e.target.value))} style={{ ...adminInput, paddingRight: 36 }}>
                    {Array.from({ length: st.seats + 1 }, (_, i) => (
                      <option key={i} value={i}>{i}</option>
                    ))}
                  </select>
                </div>

                {/* Add party */}
                <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12, marginTop: 12 }}>
                  <p style={{ margin: "0 0 8px", fontWeight: 700, fontSize: 13, color: "var(--foreground)" }}>{t("addParty")}</p>
                  {st.status === "paying" ? (
                    <span style={{ color: "#92400E", fontSize: 13 }}>{t("tablePaying")}</span>
                  ) : remaining === 0 ? (
                    <span style={{ color: "#b91c1c", fontSize: 13 }}>{t("tableFull")}</span>
                  ) : st.current_party_size > 0 && !st.is_shareable ? (
                    <span style={{ color: "#92400E", fontSize: 13 }}>{t("notShareable")}</span>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
                      <input type="number" min={1} max={remaining} value={newPartySizes[st.id] ?? 1}
                        onChange={(e) => setNewPartySizes((prev) => ({ ...prev, [st.id]: Math.min(remaining, Math.max(1, Number(e.target.value || 1))) }))}
                        style={adminInput}
                      />
                      <button type="button" onClick={() => handleAddParty(st)} disabled={!canAddParty || busy}
                        style={{ minHeight: "var(--tap-min)", padding: "0 14px", borderRadius: 10, border: "none", background: !canAddParty || busy ? "var(--muted-2)" : "#4f46e5", color: "#fff", fontWeight: 700, cursor: !canAddParty || busy ? "not-allowed" : "pointer", fontSize: 13, whiteSpace: "nowrap" }}>
                        {t("addPartyBtn")}
                      </button>
                    </div>
                  )}
                </div>

                {/* Remove */}
                <button type="button" onClick={() => handleRemove(st)} disabled={busy} style={{ ...btnDanger, marginTop: 12, width: "100%", justifyContent: "center" }}>
                  {busy ? t("removing") : t("remove")}
                </button>
              </article>
            );
          })}
        </div>
      )}
    </div>
    </>
  );
}

import { api } from "@/lib/server/api-client";
import { SessionTablesClient } from "./SessionTablesClient";

export const dynamic = "force-dynamic";

export default async function AdminSessionTablesPage() {
  const [sessions, tables] = await Promise.all([
    api.getSessions(),
    api.getAdminTables(),
  ]);
  return (
    <div style={{ padding: "20px 16px", maxWidth: 1100 }}>
      <SessionTablesClient initialSessions={sessions} initialTables={tables} />
    </div>
  );
}

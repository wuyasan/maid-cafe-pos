import { api } from "@/lib/server/api-client";
import { SessionsClient } from "./SessionsClient";

export const dynamic = "force-dynamic";

export default async function AdminSessionsPage() {
  const sessions = await api.getSessions();
  return (
    <div style={{ padding: "20px 16px", maxWidth: 960 }}>
      <SessionsClient initialSessions={sessions} />
    </div>
  );
}

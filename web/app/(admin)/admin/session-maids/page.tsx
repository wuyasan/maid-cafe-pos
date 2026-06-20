import { api } from "@/lib/server/api-client";
import { SessionMaidsClient } from "./SessionMaidsClient";

export const dynamic = "force-dynamic";

export default async function AdminSessionMaidsPage() {
  const [sessions, maids] = await Promise.all([
    api.getSessions(),
    api.getAdminMaids(),
  ]);
  return (
    <div style={{ padding: "20px 16px", maxWidth: 1000 }}>
      <SessionMaidsClient initialSessions={sessions} initialMaids={maids} />
    </div>
  );
}

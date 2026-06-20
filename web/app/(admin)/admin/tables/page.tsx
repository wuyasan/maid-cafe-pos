import { api } from "@/lib/server/api-client";
import { TablesClient } from "./TablesClient";

export const dynamic = "force-dynamic";

export default async function AdminTablesPage() {
  const tables = await api.getAdminTables();
  return (
    <div style={{ padding: "20px 16px", maxWidth: 960 }}>
      <TablesClient initialTables={tables} />
    </div>
  );
}

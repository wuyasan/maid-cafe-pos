import { api } from "@/lib/server/api-client";
import { FloorPlanEditor } from "./FloorPlanEditor";

export const dynamic = "force-dynamic";

export default async function AdminFloorPlanPage() {
  const tables = await api.getAdminTables();
  return (
    <div style={{ padding: "20px 16px" }}>
      <FloorPlanEditor initialTables={tables} />
    </div>
  );
}

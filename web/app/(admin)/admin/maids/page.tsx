import { api } from "@/lib/server/api-client";
import { MaidsClient } from "./MaidsClient";

export const dynamic = "force-dynamic";

export default async function AdminMaidsPage() {
  const maids = await api.getAdminMaids();
  return (
    <div style={{ padding: "20px 16px", maxWidth: 960 }}>
      <MaidsClient initialMaids={maids} />
    </div>
  );
}

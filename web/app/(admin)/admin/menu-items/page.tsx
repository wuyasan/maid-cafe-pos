import { api } from "@/lib/server/api-client";
import { MenuItemsClient } from "./MenuItemsClient";

export const dynamic = "force-dynamic";

export default async function AdminMenuItemsPage() {
  const [items, categories] = await Promise.all([
    api.getAdminMenuItems(),
    api.getAdminCategories(),
  ]);
  return (
    <div style={{ padding: "20px 16px", maxWidth: 1000 }}>
      <MenuItemsClient initialItems={items} categories={categories} />
    </div>
  );
}

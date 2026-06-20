import { api } from "@/lib/server/api-client";
import { CategoriesClient } from "./CategoriesClient";

export const dynamic = "force-dynamic";

export default async function AdminCategoriesPage() {
  const categories = await api.getAdminCategories();
  return (
    <div style={{ padding: "20px 16px", maxWidth: 960 }}>
      <CategoriesClient initialCategories={categories} />
    </div>
  );
}

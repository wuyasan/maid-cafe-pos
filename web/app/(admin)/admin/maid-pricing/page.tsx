import { api } from "@/lib/server/api-client";
import { MaidPricingClient } from "./MaidPricingClient";

export const dynamic = "force-dynamic";

export default async function AdminMaidPricingPage() {
  const [pricingList, items] = await Promise.all([
    api.getMaidServicePricingList(),
    api.getAdminMenuItems(),
  ]);
  // Only show maid_service items for context
  const maidItems = items.filter((i) => i.item_type === "maid_service");
  return (
    <div style={{ padding: "20px 16px", maxWidth: 960 }}>
      <MaidPricingClient initialPricing={pricingList} maidItems={maidItems} allItems={items} />
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import BillPanel from "@/components/BillPanel";
import MaidPickerModal from "@/components/MaidPickerModal";
import MenuTabs from "@/components/MenuTabs";
import { apiGet, apiPost } from "@/lib/api";
import type {
  BillDetail,
  CreateOrderResponse,
  CurrentSessionResponse,
  CustomerOrderPayload,
  MenuCategoryItem,
  MenuItemRecord,
  SessionItem,
  SessionMaidAdminItem,
} from "@/lib/types";

type Props = {
  params: Promise<{ tableCode: string }>;
};

export default function OrderPage({ params }: Props) {
  const [tableCode, setTableCode] = useState("");
  const [session, setSession] = useState<SessionItem | null>(null);
  const [items, setItems] = useState<MenuItemRecord[]>([]);
  const [maids, setMaids] = useState<SessionMaidAdminItem[]>([]);
  const [bill, setBill] = useState<BillDetail | null>(null);
  const [activeTab, setActiveTab] = useState<"regular" | "maid_service">("regular");
  const [categories, setCategories] = useState<MenuCategoryItem[]>([]);
  const [selectedMaidServiceItem, setSelectedMaidServiceItem] =
    useState<MenuItemRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    params.then((p) => setTableCode(p.tableCode));
  }, [params]);

  async function loadBill(code: string) {
    const billData = await apiGet<BillDetail>(
      `/customer-orders/customer/table/${code}/bill`
    );
    setBill(billData);
  }

  async function loadSessionMaids(sessionId: number) {
    const sessionMaids = await apiGet<SessionMaidAdminItem[]>(
      `/session-maids?session_id=${sessionId}`
    );
    setMaids(sessionMaids.filter((m) => m.is_available));
  }

  async function loadPage(code: string) {
    setLoading(true);
    setError("");

    try {
      const currentSession = await apiGet<CurrentSessionResponse>("/sessions/current");
      setSession(currentSession.session);

      const [menuItems, categoryData, billData] = await Promise.all([
        apiGet<MenuItemRecord[]>("/menu/items"),
        apiGet<MenuCategoryItem[]>("/menu/categories"),
        apiGet<BillDetail>(`/customer-orders/customer/table/${code}/bill`),
      ]);

      setItems(menuItems.filter((item) => item.is_active));
      setCategories(categoryData);
      setBill(billData);

      if (currentSession.session) {
        await loadSessionMaids(currentSession.session.id);
      } else {
        setMaids([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load order page");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (tableCode) {
      loadPage(tableCode);
    }
  }, [tableCode]);

  async function createOrder(payload: CustomerOrderPayload) {
    if (!tableCode) return;

    await apiPost<CreateOrderResponse>(
      `/customer-orders/customer/table/${tableCode}/orders`,
      payload
    );

    await loadBill(tableCode);
  }

  async function handleAddRegular(item: MenuItemRecord) {
    try {
      setError("");
      await createOrder({
        source: "qr",
        items: [
          {
            menu_item_id: item.id,
            quantity: 1,
            notes: null,
            selected_maid_ids: [],
          },
        ],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add regular item");
    }
  }

  async function handleSubmitMaidService(
    item: MenuItemRecord,
    selectedMaidIds: number[]
  ) {
    try {
      setError("");
      await createOrder({
        source: "qr",
        items: [
          {
            menu_item_id: item.id,
            quantity: 1,
            notes: null,
            selected_maid_ids: selectedMaidIds,
          },
        ],
      });
      setSelectedMaidServiceItem(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add maid service");
      throw err;
    }
  }

  async function handleOpenMaidService(item: MenuItemRecord) {
    try {
      setError("");
      if (session?.id) {
        await loadSessionMaids(session.id);
      }
      setSelectedMaidServiceItem(item);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load maids");
    }
  }

  const title = useMemo(() => {
    if (!tableCode) return "Order";
    return `Table ${tableCode}`;
  }, [tableCode]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f7f7fb",
        padding: 24,
        display: "grid",
        gap: 24,
      }}
    >
      <header
        style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          padding: 20,
          display: "grid",
          gap: 8,
        }}
      >
        <h1 style={{ margin: 0 }}>{title}</h1>
        <div style={{ color: "#4b5563" }}>
          {session ? `Current Session: ${session.name}` : "No active session"}
        </div>
      </header>

      {loading ? <p>Loading...</p> : null}
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}

      {!loading && !error ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 360px",
            gap: 24,
            alignItems: "start",
          }}
        >
          <section style={{ display: "grid", gap: 20 }}>
            <MenuTabs
              items={items}
              categories={categories}
              activeTab={activeTab}
              onChangeTab={setActiveTab}
              onAddRegular={handleAddRegular}
              onOpenMaidService={handleOpenMaidService}
            />
          </section>

          <BillPanel bill={bill} />
        </div>
      ) : null}

      <MaidPickerModal
        open={!!selectedMaidServiceItem}
        item={selectedMaidServiceItem}
        maids={maids}
        onClose={() => setSelectedMaidServiceItem(null)}
        onSubmit={handleSubmitMaidService}
      />
    </div>
  );
}
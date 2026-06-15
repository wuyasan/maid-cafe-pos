"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import BillPanel from "@/components/BillPanel";
import MaidPickerModal from "@/components/MaidPickerModal";
import MenuTabs from "@/components/MenuTabs";
import { apiGet, apiPost } from "@/lib/api";
import type {
  BillDetail,
  CurrentSessionResponse,
  CustomerOrderPayload,
  MenuCategoryItem,
  MenuItemRecord,
  ProductionStation,
  SessionItem,
  SessionMaidAdminItem,
} from "@/lib/types";

type Props = {
  params: Promise<{ tableCode: string }>;
};

function localDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function cutoffIsClosed(
  session: SessionItem | null,
  cutoff?: string | null
) {
  if (!session || !cutoff) return false;

  const now = new Date();
  const today = localDateString(now);
  if (today > session.service_date) return true;
  if (today < session.service_date) return false;

  const [hour, minute, second = "0"] = cutoff.split(":");
  const cutoffSeconds =
    Number(hour) * 3600 + Number(minute) * 60 + Number(second);
  const nowSeconds =
    now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

  return nowSeconds >= cutoffSeconds;
}

export default function OrderPage({ params }: Props) {
  const searchParams = useSearchParams();
  const orderSource = searchParams.get("source") === "staff" ? "staff" : "qr";
  const [tableCode, setTableCode] = useState("");
  const [session, setSession] = useState<SessionItem | null>(null);
  const [items, setItems] = useState<MenuItemRecord[]>([]);
  const [maids, setMaids] = useState<SessionMaidAdminItem[]>([]);
  const [bill, setBill] = useState<BillDetail | null>(null);
  const [activeTab, setActiveTab] = useState<"regular" | "maid_service">(
    "regular"
  );
  const [categories, setCategories] = useState<MenuCategoryItem[]>([]);
  const [selectedMaidServiceItem, setSelectedMaidServiceItem] =
    useState<MenuItemRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [clockTick, setClockTick] = useState(0);

  useEffect(() => {
    params.then((p) => setTableCode(p.tableCode));
  }, [params]);

  useEffect(() => {
    const timer = window.setInterval(() => setClockTick((value) => value + 1), 30000);
    return () => window.clearInterval(timer);
  }, []);

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
    setMaids(sessionMaids.filter((maid) => maid.is_available));
  }

  async function loadPage(code: string) {
    setLoading(true);
    setError("");

    try {
      const currentSession = await apiGet<CurrentSessionResponse>(
        "/sessions/current"
      );
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

  const closedStations = useMemo<Record<ProductionStation, boolean>>(
    () => ({
      kitchen: cutoffIsClosed(session, session?.kitchen_last_order_time),
      bar: cutoffIsClosed(session, session?.bar_last_order_time),
      none: false,
    }),
    [session, clockTick]
  );

  async function createOrder(payload: CustomerOrderPayload) {
    if (!tableCode) return;
    await apiPost(
      `/customer-orders/customer/table/${tableCode}/orders`,
      payload
    );
    await loadBill(tableCode);
  }

  async function handleAddRegular(item: MenuItemRecord) {
    try {
      setError("");
      await createOrder({
        source: orderSource,
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
        source: orderSource,
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

  const title = useMemo(
    () => (tableCode ? `${orderSource === "staff" ? "Staff Order · " : ""}Table ${tableCode}` : "Order"),
    [tableCode, orderSource]
  );

  function getStaffWebUrl(path: string) {
    if (typeof window === "undefined") return path;

    const configuredBaseUrl = process.env.NEXT_PUBLIC_STAFF_WEB_BASE_URL?.trim();
    if (configuredBaseUrl) {
      return `${configuredBaseUrl.replace(/\/$/, "")}${path}`;
    }

    return `${window.location.protocol}//${window.location.hostname}:3000${path}`;
  }

  function returnToStaffOrder() {
    window.location.href = getStaffWebUrl("/staff/order");
  }

  function returnToStaffSelector() {
    window.location.href = getStaffWebUrl("/staff");
  }

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: 20 }}>
      {orderSource === "staff" ? (
        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            marginBottom: 16,
          }}
        >
          <button
            type="button"
            onClick={returnToStaffOrder}
            style={{
              padding: "10px 16px",
              borderRadius: 10,
              border: "1px solid #d1d5db",
              background: "white",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            ← Back to Table Selection
          </button>

          <button
            type="button"
            onClick={returnToStaffSelector}
            style={{
              padding: "10px 16px",
              borderRadius: 10,
              border: "1px solid #d1d5db",
              background: "white",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Switch View
          </button>
        </div>
      ) : null}

      <h1>{title}</h1>
      <p style={{ color: "#6b7280" }}>
        {session ? `Current Session: ${session.name}` : "No active session"}
      </p>

      {closedStations.kitchen ? (
        <p style={{ padding: 12, borderRadius: 10, background: "#fee2e2", color: "#991b1b" }}>
          Kitchen ordering is closed.
        </p>
      ) : null}
      {closedStations.bar ? (
        <p style={{ padding: 12, borderRadius: 10, background: "#fee2e2", color: "#991b1b" }}>
          Bar ordering is closed.
        </p>
      ) : null}

      {loading ? <p>Loading...</p> : null}
      {error ? <p style={{ color: "#dc2626" }}>{error}</p> : null}

      {!loading ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 2fr) minmax(280px, 1fr)",
            gap: 20,
            alignItems: "start",
          }}
        >
          <MenuTabs
            items={items}
            categories={categories}
            activeTab={activeTab}
            onChangeTab={setActiveTab}
            onAddRegular={handleAddRegular}
            onOpenMaidService={handleOpenMaidService}
            closedStations={closedStations}
          />
          {bill ? <BillPanel bill={bill} /> : null}
        </div>
      ) : null}

      {selectedMaidServiceItem ? (
        <MaidPickerModal
          item={selectedMaidServiceItem}
          maids={maids}
          onClose={() => setSelectedMaidServiceItem(null)}
          onSubmit={handleSubmitMaidService}
        />
      ) : null}
    </main>
  );
}

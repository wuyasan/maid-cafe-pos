export type ProductionStation = "kitchen" | "bar";
export type ProductionStatus = "pending" | "preparing" | "completed";

export type ProductionQueueItem = {
  order_item_id: number;
  order_id: number;
  bill_id: number;
  table_code: string;
  menu_item_id: number;
  menu_item_name: string;
  quantity: number;
  notes?: string | null;
  source: "qr" | "staff";
  station: ProductionStation;
  production_status: ProductionStatus;
  ordered_at: string;
};

export type ProductionQueueResponse = {
  session_id: number;
  session_name: string;
  station: ProductionStation;
  items: ProductionQueueItem[];
};

export type ProductionStation = "kitchen" | "bar";

export type ProductionStatus =
  | "pending"
  | "preparing"
  | "completed";

export type ProductionQueueItem = {
  production_task_id: number;
  order_item_id: number;
  order_id: number;
  bill_id: number;
  table_code: string;
  parent_menu_item_id: number;
  parent_menu_item_name: string;
  source_menu_item_id?: number | null;
  display_name: string;
  quantity: number;
  notes?: string | null;
  source: "qr" | "staff";
  station: ProductionStation;
  production_status: ProductionStatus;
  ordered_at: string;
  picked_up_at?: string | null;
};

export type ProductionQueueResponse = {
  session_id: number;
  session_name: string;
  station: ProductionStation;
  items: ProductionQueueItem[];
};

export type PickupTask = {
  production_task_id: number;
  display_name: string;
  quantity: number;
  station: ProductionStation;
  production_status: ProductionStatus;
  notes?: string | null;
};

export type PickupOrder = {
  order_id: number;
  bill_id: number;
  table_code: string;
  ordered_at: string;
  all_completed: boolean;
  waiting_count: number;
  tasks: PickupTask[];
};

export type PickupOrderListResponse = {
  session_id: number;
  session_name: string;
  orders: PickupOrder[];
};

export type PickupOrderResult = {
  order_id: number;
  picked_up_at: string;
};

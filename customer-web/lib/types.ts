export type SessionStatus =
  | "scheduled"
  | "active"
  | "winding_down"
  | "closed";

export type MenuItemType = "regular" | "maid_service";
export type ProductionStation = "kitchen" | "bar" | "none";

export type SessionItem = {
  id: number;
  name: string;
  service_date: string;
  start_time?: string | null;
  end_time?: string | null;
  kitchen_last_order_time?: string | null;
  bar_last_order_time?: string | null;
  status: SessionStatus;
  created_at: string;
};

export type CurrentSessionResponse = {
  session: SessionItem | null;
};

export type Maid = {
  id: number;
  name: string;
  photo_url?: string | null;
  bio?: string | null;
  is_active: boolean;
  display_order: number;
  created_at: string;
};

export type SessionMaidAdminItem = {
  id: number;
  session_id: number;
  maid_id: number;
  is_available: boolean;
  maid_name: string;
  maid_photo_url?: string | null;
};

export type BundleComponent = {
  id: number;
  menu_item_id: number;
  menu_item_name: string;
  quantity: number;
  production_station: ProductionStation;
  item_type: MenuItemType;
};

export type MenuItemRecord = {
  id: number;
  name: string;
  description?: string | null;
  price: string;
  image_url?: string | null;
  category_id?: number | null;
  item_type: MenuItemType;
  is_active: boolean;
  is_bundle: boolean;
  requires_maid_selection: boolean;
  components: BundleComponent[];
  created_at: string;
  maid_service_pricing?: {
    id: number;
    menu_item_id: number;
    additional_maid_price: string;
    all_maids_price?: string | null;
    created_at: string;
  } | null;
};

export type BillItem = {
  order_item_id: number;
  menu_item_id: number;
  menu_item_name: string;
  item_type: string;
  quantity: number;
  unit_price: string;
  total_price: string;
  notes?: string | null;
  selected_maids: {
    id: number;
    maid_id: number;
    maid_name: string;
    maid_photo_url?: string | null;
  }[];
};

export type BillDetail = {
  id: number;
  session_table_id: number;
  status: string;
  subtotal: string;
  tax: string;
  service_charge: string;
  total: string;
  opened_at: string;
  closed_at?: string | null;
  items: BillItem[];
};

export type CustomerOrderPayload = {
  source: "qr" | "staff";
  items: {
    menu_item_id: number;
    quantity: number;
    notes?: string | null;
    selected_maid_ids: number[];
  }[];
};

export type CreateOrderResponse = {
  order: {
    id: number;
    bill_id: number;
    source: string;
    created_at: string;
  };
  items: {
    menu_item_id: number;
    quantity: number;
    unit_price: string;
    total_price: string;
    notes?: string | null;
    selected_maid_ids: number[];
  }[];
  bill_id: number;
  bill_total: string;
};

export type MenuCategoryItem = {
  id: number;
  name: string;
  display_order: number;
  production_station: ProductionStation;
  created_at: string;
  item_count: number;
};

export type ProductionStation = "kitchen" | "bar" | "none";

export type Maid = {
  id: number;
  name: string;
  photo_url?: string | null;
  bio?: string | null;
  is_active: boolean;
  display_order: number;
  created_at: string;
};
export type MaidCreatePayload = { name: string; photo_url?: string | null; bio?: string | null; is_active?: boolean; display_order?: number };
export type MaidUpdatePayload = Partial<MaidCreatePayload>;

export type SessionStatus = "scheduled" | "active" | "winding_down" | "closed";
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
export type CurrentSessionResponse = { session: SessionItem | null };
export type SessionCreatePayload = {
  name: string;
  service_date: string;
  start_time?: string | null;
  end_time?: string | null;
  kitchen_last_order_time?: string | null;
  bar_last_order_time?: string | null;
  status?: SessionStatus;
};
export type SessionUpdatePayload = Partial<SessionCreatePayload>;

export type SessionMaidItem = { id: number; session_id: number; maid_id: number; is_available: boolean };
export type SessionMaidCreatePayload = { session_id: number; maid_id: number; is_available: boolean };

export type TableItem = { id: number; code: string; seats: number; is_active: boolean; is_shareable: boolean; created_at: string };
export type TableCreatePayload = { code: string; seats: number; is_active?: boolean; is_shareable?: boolean };
export type TableUpdatePayload = Partial<TableCreatePayload>;

export type MenuCategoryItem = {
  id: number;
  name: string;
  display_order: number;
  production_station: ProductionStation;
  created_at: string;
  item_count: number;
};
export type MenuCategoryCreatePayload = { name: string; display_order: number; production_station: ProductionStation };
export type MenuCategoryUpdatePayload = Partial<MenuCategoryCreatePayload>;

export type MenuItemType = "regular" | "maid_service";
export type MaidServicePricingLite = {
  id: number;
  menu_item_id: number;
  additional_maid_price: string;
  all_maids_price?: string | null;
  created_at: string;
};
export type BundleComponent = {
  id: number;
  menu_item_id: number;
  menu_item_name: string;
  quantity: number;
  production_station: ProductionStation;
  item_type: MenuItemType;
};
export type BundleComponentPayload = { menu_item_id: number; quantity: number };
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
  created_at: string;
  maid_service_pricing?: MaidServicePricingLite | null;
  components: BundleComponent[];
  requires_maid_selection: boolean;
};
export type MenuItemCreatePayload = {
  name: string;
  description?: string | null;
  price: string;
  image_url?: string | null;
  category_id?: number | null;
  item_type: MenuItemType;
  is_active?: boolean;
  is_bundle?: boolean;
  additional_maid_price?: string | null;
  all_maids_price?: string | null;
  components?: BundleComponentPayload[];
};
export type MenuItemUpdatePayload = Partial<MenuItemCreatePayload>;

export type MaidServicePricingRecord = MaidServicePricingLite;
export type MaidServicePricingCreatePayload = { menu_item_id: number; additional_maid_price: string; all_maids_price?: string | null };
export type MaidServicePricingUpdatePayload = Partial<MaidServicePricingCreatePayload>;

export type SessionTableStatus = "available" | "occupied" | "ready" | "paying" | "paid";
export type SessionTableSummary = {
  id: number; session_id: number; table_id: number; table_code: string; seats: number;
  is_shareable: boolean; status: SessionTableStatus; current_party_size: number;
  layout_x: number; layout_y: number; layout_width: number; layout_height: number;
  layout_shape: "rectangle" | "round";
  open_bill_id?: number | null; open_bill_total: string;
};
export type SessionTableListResponse = { session_id: number; session_name: string; tables: SessionTableSummary[] };
export type SessionTableAdminSummary = Omit<SessionTableSummary, "open_bill_id" | "open_bill_total">;
export type SessionTableCreatePayload = { session_id: number; table_id: number; status: SessionTableStatus; current_party_size: number };
export type SessionTableUpdatePayload = { status?: SessionTableStatus; current_party_size?: number };
export type SessionTableAddPartyPayload = { party_size: number };

export type BillItem = {
  order_item_id: number; menu_item_id: number; menu_item_name: string; item_type: string;
  quantity: number; unit_price: string; total_price: string; notes?: string | null;
  selected_maids: { id: number; maid_id: number; maid_name: string; maid_photo_url?: string | null }[];
};
export type BillDetail = {
  id: number; session_table_id: number; status: string; subtotal: string; tax: string;
  service_charge: string; total: string; opened_at: string; closed_at?: string | null; items: BillItem[];
};
export type SessionSummaryMaidCount = {
  maid_id: number;
  maid_name: string;
  total_ordered: number;
};

export type SessionSummarySetSource = {
  set_menu_item_id: number;
  set_menu_item_name: string;
  set_quantity_ordered: number;
  component_quantity_per_set: number;
  quantity_from_set: number;
};

export type SessionSummarySetComponent = {
  menu_item_id: number;
  menu_item_name: string;
  item_type: string;
  quantity_per_set: number;
  total_quantity_from_set: number;
};

export type SessionSummaryItem = {
  menu_item_id: number;
  menu_item_name: string;
  item_type: string;
  is_bundle: boolean;
  total_ordered: number;
  direct_ordered: number;
  from_sets: number;
  total_sales: string;
  maid_breakdown: SessionSummaryMaidCount[];
  set_components: SessionSummarySetComponent[];
  from_set_breakdown: SessionSummarySetSource[];
};

export type SessionSummaryResponse = {
  session_id: number;
  session_name: string;
  items: SessionSummaryItem[];
};

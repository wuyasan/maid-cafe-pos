export type Maid = {
  id: number;
  name: string;
  photo_url?: string | null;
  bio?: string | null;
  is_active: boolean;
  display_order: number;
  created_at: string;
};

export type MaidCreatePayload = {
  name: string;
  photo_url?: string | null;
  bio?: string | null;
  is_active?: boolean;
  display_order?: number;
};

export type MaidUpdatePayload = {
  name?: string;
  photo_url?: string | null;
  bio?: string | null;
  is_active?: boolean;
  display_order?: number;
};

export type SessionStatus =
  | "scheduled"
  | "active"
  | "winding_down"
  | "closed";

export type SessionItem = {
  id: number;
  name: string;
  service_date: string;
  start_time?: string | null;
  end_time?: string | null;
  status: SessionStatus;
  created_at: string;
};

export type CurrentSessionResponse = {
  session: SessionItem | null;
};

export type SessionCreatePayload = {
  name: string;
  service_date: string;
  start_time?: string | null;
  end_time?: string | null;
  status?: SessionStatus;
};

export type SessionMaidItem = {
  id: number;
  session_id: number;
  maid_id: number;
  is_available: boolean;
};

export type SessionMaidCreatePayload = {
  session_id: number;
  maid_id: number;
  is_available: boolean;
};

export type TableItem = {
  id: number;
  code: string;
  seats: number;
  is_active: boolean;
  is_shareable: boolean;
  created_at: string;
};

export type TableCreatePayload = {
  code: string;
  seats: number;
  is_active?: boolean;
  is_shareable?: boolean;
};

export type TableUpdatePayload = {
  code?: string;
  seats?: number;
  is_active?: boolean;
  is_shareable?: boolean;
};

export type MenuCategoryItem = {
  id: number;
  name: string;
  display_order: number;
  created_at: string;
  item_count: number;
};

export type MenuCategoryCreatePayload = {
  name: string;
  display_order: number;
};

export type MenuCategoryUpdatePayload = {
  name?: string;
  display_order?: number;
};

export type MenuItemType = "regular" | "maid_service";

export type MaidServicePricingLite = {
  id: number;
  menu_item_id: number;
  additional_maid_price: string;
  all_maids_price?: string | null;
  created_at: string;
};

export type MenuItemRecord = {
  id: number;
  name: string;
  description?: string | null;
  price: string;
  image_url?: string | null;
  category_id?: number | null;
  item_type: "regular" | "maid_service";
  is_active: boolean;
  created_at: string;
  maid_service_pricing?: MaidServicePricingLite | null;
};

export type MenuItemCreatePayload = {
  name: string;
  description?: string | null;
  price: string;
  image_url?: string | null;
  category_id?: number | null;
  item_type: "regular" | "maid_service";
  is_active?: boolean;
  additional_maid_price?: string | null;
  all_maids_price?: string | null;
};

export type MenuItemUpdatePayload = {
  name?: string;
  description?: string | null;
  price?: string;
  image_url?: string | null;
  category_id?: number | null;
  item_type?: "regular" | "maid_service";
  is_active?: boolean;
  additional_maid_price?: string | null;
  all_maids_price?: string | null;
};

export type MaidServicePricingRecord = {
  id: number;
  menu_item_id: number;
  single_price: string;
  additional_maid_price: string;
  all_maids_price?: string | null;
  created_at: string;
};

export type MaidServicePricingCreatePayload = {
  menu_item_id: number;
  single_price: string;
  additional_maid_price: string;
  all_maids_price?: string | null;
};

export type MaidServicePricingUpdatePayload = {
  menu_item_id?: number;
  single_price?: string;
  additional_maid_price?: string;
  all_maids_price?: string | null;
};

export type SessionTableStatus =
  | "available"
  | "occupied"
  | "ready"
  | "paying"
  | "paid";

export type SessionTableSummary = {
  id: number;
  session_id: number;
  table_id: number;
  table_code: string;
  seats: number;
  is_shareable: boolean;
  status: SessionTableStatus;
  current_party_size: number;
  open_bill_id?: number | null;
  open_bill_total: string;
};

export type SessionTableListResponse = {
  session_id: number;
  session_name: string;
  tables: SessionTableSummary[];
};

export type SessionTableAdminSummary = {
  id: number;
  session_id: number;
  table_id: number;
  table_code: string;
  seats: number;
  is_shareable: boolean;
  status: SessionTableStatus;
  current_party_size: number;
};

export type SessionTableCreatePayload = {
  session_id: number;
  table_id: number;
  status: SessionTableStatus;
  current_party_size: number;
};

export type SessionTableUpdatePayload = {
  status?: SessionTableStatus;
  current_party_size?: number;
};

export type SessionTableAddPartyPayload = {
  party_size: number;
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

export type SessionSummaryMaidCount = {
  maid_id: number;
  maid_name: string;
  total_ordered: number;
};

export type SessionSummaryItem = {
  menu_item_id: number;
  menu_item_name: string;
  item_type: string;
  total_ordered: number;
  total_sales: string;
  maid_breakdown: SessionSummaryMaidCount[];
};

export type SessionSummaryResponse = {
  session_id: number;
  session_name: string;
  items: SessionSummaryItem[];
};

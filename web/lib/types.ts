// Minimal domain types mirroring the FastAPI read shapes the customer flow needs.
export type ProductionStatus = "pending" | "preparing" | "completed";
export type MenuItemType = "regular" | "maid_service";

// ─── Session types ────────────────────────────────────────────────────────────

export type SessionStatus = "scheduled" | "active" | "winding_down" | "closed";

export interface SessionRead {
  id: number;
  name: string;
  service_date: string;      // "YYYY-MM-DD"
  start_time: string | null; // ISO datetime string
  end_time: string | null;
  kitchen_last_order_time: string | null; // "HH:MM:SS"
  bar_last_order_time: string | null;
  status: SessionStatus;
  created_at: string;
}

export interface SessionCreate {
  name: string;
  service_date: string;
  start_time?: string | null;
  end_time?: string | null;
  kitchen_last_order_time?: string | null;
  bar_last_order_time?: string | null;
  status?: SessionStatus;
}

export interface SessionUpdate {
  name?: string;
  service_date?: string;
  start_time?: string | null;
  end_time?: string | null;
  kitchen_last_order_time?: string | null;
  bar_last_order_time?: string | null;
  status?: SessionStatus;
}

// ─── Session summary types ────────────────────────────────────────────────────

export interface SessionSummaryMaidCount {
  maid_id: number;
  maid_name: string;
  total_ordered: number;
}

export interface SessionSummarySetSource {
  set_menu_item_id: number;
  set_menu_item_name: string;
  set_quantity_ordered: number;
  component_quantity_per_set: number;
  quantity_from_set: number;
}

export interface SessionSummarySetComponent {
  menu_item_id: number;
  menu_item_name: string;
  item_type: string;
  quantity_per_set: number;
  total_quantity_from_set: number;
}

export interface SessionSummaryItem {
  menu_item_id: number;
  menu_item_name: string;
  item_type: string;
  is_bundle: boolean;
  total_ordered: number;
  direct_ordered: number;
  from_sets: number;
  total_sales: string; // Decimal serialized as string in JSON
  maid_breakdown: SessionSummaryMaidCount[];
  set_components: SessionSummarySetComponent[];
  from_set_breakdown: SessionSummarySetSource[];
}

export interface SessionSummaryResponse {
  session_id: number;
  session_name: string;
  items: SessionSummaryItem[];
}

export interface Category {
  id: number;
  name: string;
  display_order: number;
  production_station: string;
}

export interface MenuItem {
  id: number;
  name: string;
  description: string | null;
  price: string;
  image_url: string | null;
  category_id: number | null;
  item_type: MenuItemType;
  is_bundle: boolean;
  requires_maid_selection?: boolean;
}

// Frontend domain shape (normalized from the backend's flattened session-maid rows).
export interface Maid {
  id: number; // = backend maid_id
  name: string;
  photoUrl: string | null;
  isAvailable: boolean;
}

export interface BillItemMaid {
  id: number;
  maid_id: number;
  maid_name: string;
  maid_photo_url: string | null;
}

export interface BillItem {
  order_item_id: number;
  menu_item_id: number;
  menu_item_name: string;
  item_type: MenuItemType;
  quantity: number;
  unit_price: string;
  total_price: string;
  notes: string | null;
  // Backend Phase 1 (T1.2): aggregated production status; null when no production tasks.
  production_status: ProductionStatus | null;
  selected_maids: BillItemMaid[];
}

export type DiscountType = "none" | "percent" | "fixed";

export interface BillDetail {
  id: number;
  status: string;
  subtotal: string;
  // ── Discount (F15) ──────────────────────────────────────────────────────────
  discount_type: DiscountType;
  discount_value: string;   // percent (0–100) or fixed-dollar amount, as entered
  discount_amount: string;  // computed dollar amount removed from subtotal
  discount_note: string | null;
  tax: string;
  service_charge: string;
  total: string; // post-discount payable total
  items: BillItem[];
}

// ── Discount write payload (F15) ──────────────────────────────────────────────
export interface DiscountApply {
  type: "percent" | "fixed";
  value: string;
  note?: string;
}

export interface OrderLine {
  menu_item_id: number;
  quantity: number;
  notes: string | null;
  selected_maid_ids: number[];
}

export interface OrderPayload {
  source: "qr" | "staff";
  items: OrderLine[];
}

export interface OrderRead {
  id: number;
  bill_id: number;
  source: string;
  created_at: string;
}

export interface CreatedOrderItem {
  menu_item_id: number;
  quantity: number;
  unit_price: string;
  total_price: string;
  notes: string | null;
  selected_maid_ids: number[];
}

// Matches backend OrderCreateResponse: { order, items, bill_id, bill_total }.
export interface OrderResponse {
  order: OrderRead;
  items: CreatedOrderItem[];
  bill_id: number;
  bill_total: string;
}

// ─── Staff types ──────────────────────────────────────────────────────────────

export type SessionTableStatus = "available" | "occupied" | "paying";
export type TableShape = "rectangle" | "round";
export type ProductionStation = "kitchen" | "bar" | "none";

/** One table in the current session — matches backend SessionTableSummary. */
export interface StaffTable {
  id: number; // session_table.id
  session_id: number;
  table_id: number;
  table_code: string;
  seats: number;
  is_shareable: boolean;
  status: SessionTableStatus;
  current_party_size: number;
  layout_x: number;
  layout_y: number;
  layout_width: number;
  layout_height: number;
  layout_shape: TableShape;
  open_bill_id: number | null;
  open_bill_total: string; // normalized from Decimal → string in normalize.ts
}

/** Response envelope from GET /staff/tables. */
export interface StaffTablesResult {
  session_id: number;
  session_name: string;
  tables: StaffTable[];
}

/** One production task in the kitchen / bar queue — matches backend ProductionQueueItemRead. */
export interface ProductionQueueItem {
  production_task_id: number;
  order_item_id: number;
  order_id: number;
  bill_id: number;
  table_code: string;
  parent_menu_item_id: number;
  parent_menu_item_name: string;
  source_menu_item_id: number | null;
  display_name: string;
  quantity: number;
  notes: string | null;
  source: string;
  station: ProductionStation;
  production_status: ProductionStatus;
  ordered_at: string; // ISO string (serialized from datetime)
  picked_up_at: string | null;
}

/** Response envelope from GET /staff/production/{station}. */
export interface ProductionQueueResult {
  session_id: number;
  session_name: string;
  station: ProductionStation;
  items: ProductionQueueItem[];
}

/** A single production task summarized inside a pickup order. */
export interface PickupTask {
  production_task_id: number;
  display_name: string;
  quantity: number;
  station: ProductionStation;
  production_status: ProductionStatus;
  notes: string | null;
}

/** One order ready (or partially ready) for runner pickup — matches backend PickupOrderRead. */
export interface PickupOrder {
  order_id: number;
  bill_id: number;
  table_code: string;
  ordered_at: string; // ISO string
  all_completed: boolean;
  waiting_count: number;
  tasks: PickupTask[];
}

/** Response envelope from GET /staff/production/pickup/orders. */
export interface PickupOrdersResult {
  session_id: number;
  session_name: string;
  orders: PickupOrder[];
}

// ─── Admin catalog types (Phase 4B) ──────────────────────────────────────────

export interface CategoryAdmin {
  id: number;
  name: string;
  display_order: number;
  production_station: ProductionStation;
  created_at: string;
  item_count: number;
}

export interface BundleComponent {
  id: number;
  menu_item_id: number;
  menu_item_name: string;
  quantity: number;
  production_station: ProductionStation;
  item_type: MenuItemType;
}

export interface MaidServicePricing {
  id: number;
  menu_item_id: number;
  additional_maid_price: string; // Decimal → string
  all_maids_price: string | null;
  created_at: string;
}

export interface MenuItemAdmin {
  id: number;
  name: string;
  description: string | null;
  price: string;
  image_url: string | null;
  category_id: number | null;
  item_type: MenuItemType;
  is_active: boolean;
  is_bundle: boolean;
  created_at: string;
  maid_service_pricing: MaidServicePricing | null;
  components: BundleComponent[];
  requires_maid_selection: boolean;
}

export interface MaidAdmin {
  id: number;
  name: string;
  photo_url: string | null;
  bio: string | null;
  is_active: boolean;
  display_order: number;
  created_at: string;
}

export interface CategoryCreate {
  name: string;
  display_order?: number;
  production_station?: ProductionStation;
}

export interface CategoryUpdate {
  name?: string;
  display_order?: number;
  production_station?: ProductionStation;
}

export interface BundleComponentWrite {
  menu_item_id: number;
  quantity: number;
}

export interface MenuItemWithPricingCreate {
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
  components?: BundleComponentWrite[];
}

export interface MenuItemWithPricingUpdate {
  name?: string;
  description?: string | null;
  price?: string;
  image_url?: string | null;
  category_id?: number | null;
  item_type?: MenuItemType;
  is_active?: boolean;
  is_bundle?: boolean;
  additional_maid_price?: string | null;
  all_maids_price?: string | null;
  components?: BundleComponentWrite[];
}

export interface MaidCreate {
  name: string;
  photo_url?: string | null;
  bio?: string | null;
  is_active?: boolean;
  display_order?: number;
}

export interface MaidUpdate {
  name?: string;
  photo_url?: string | null;
  bio?: string | null;
  is_active?: boolean;
  display_order?: number;
}

export interface MaidServicePricingCreate {
  menu_item_id: number;
  additional_maid_price?: string;
  all_maids_price?: string | null;
}

export interface MaidServicePricingUpdate {
  additional_maid_price?: string;
  all_maids_price?: string | null;
}

// ─── Phase 4C: Tables + Session-Tables + Session-Maids ───────────────────────
// Note: TableShape, SessionTableStatus already defined in Staff types above.

export interface TableRead {
  id: number;
  code: string;
  seats: number;
  is_active: boolean;
  is_shareable: boolean;
  layout_x: number;
  layout_y: number;
  layout_width: number;
  layout_height: number;
  layout_shape: TableShape;
  created_at: string;
}

export interface TableCreate {
  code: string;
  seats: number;
  is_active?: boolean;
  is_shareable?: boolean;
  layout_x?: number;
  layout_y?: number;
  layout_width?: number;
  layout_height?: number;
  layout_shape?: TableShape;
}

export interface TableUpdate {
  code?: string;
  seats?: number;
  is_active?: boolean;
  is_shareable?: boolean;
  layout_x?: number;
  layout_y?: number;
  layout_width?: number;
  layout_height?: number;
  layout_shape?: TableShape;
}

export interface SessionTableAdminSummary {
  id: number;
  session_id: number;
  table_id: number;
  table_code: string;
  seats: number;
  is_shareable: boolean;
  status: SessionTableStatus;
  current_party_size: number;
  layout_x: number;
  layout_y: number;
  layout_width: number;
  layout_height: number;
  layout_shape: TableShape;
}

export interface SessionTableCreate {
  session_id: number;
  table_id: number;
  status?: SessionTableStatus;
  current_party_size?: number;
}

export interface SessionTableUpdate {
  status?: SessionTableStatus;
  current_party_size?: number;
}

export interface SessionTableAddParty {
  party_size: number;
}

export interface SessionMaidAdminRead {
  id: number;
  session_id: number;
  maid_id: number;
  is_available: boolean;
  maid_name: string;
  maid_photo_url: string | null;
}

// ── Staff users (account system, F1) ────────────────────────────────────────────
export type StaffUserRole = "staff" | "manager" | "admin";

/** Returned by POST /staff/auth/login. */
export interface StaffAuthUser {
  id: number;
  username: string;
  display_name: string;
  role: StaffUserRole;
}

/** Returned by the admin staff-users endpoints. */
export interface StaffUserAdmin {
  id: number;
  username: string;
  display_name: string;
  role: StaffUserRole;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
}

export interface StaffUserCreate {
  username: string;
  display_name: string;
  role: StaffUserRole;
  pin: string;
}

export interface StaffUserUpdate {
  display_name?: string;
  role?: StaffUserRole;
  is_active?: boolean;
}

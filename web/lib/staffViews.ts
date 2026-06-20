// Staff view registry — one source of truth for sidebar nav + view-selector tiles.
// Each view carries bilingual labels, a route href, and a minimal inline SVG icon.

export type StaffViewId = "floor" | "order" | "kitchen" | "bar" | "runner" | "admin";

export interface StaffView {
  id: StaffViewId;
  href: string;
  label: { en: string; zh: string };
  /** Small inline SVG (24×24 viewBox) used in both the sidebar and the tile grid. */
  icon: string;
  /** Brief description shown on the tile selector. */
  description: { en: string; zh: string };
}

export const STAFF_VIEWS: StaffView[] = [
  {
    id: "floor",
    href: "/staff/floor",
    label: { en: "Floor", zh: "楼面" },
    description: { en: "Table status overview", zh: "桌台状态一览" },
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/></svg>`,
  },
  {
    id: "order",
    href: "/staff/order",
    label: { en: "Order", zh: "点单" },
    description: { en: "Place or edit orders", zh: "代客点单 / 修改订单" },
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/></svg>`,
  },
  {
    id: "kitchen",
    href: "/staff/kitchen",
    label: { en: "Kitchen", zh: "厨房" },
    description: { en: "Kitchen production queue", zh: "厨房出品队列" },
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3v18"/><path d="M10 3v18"/><path d="M6 8h4"/><path d="M14 8c0-2.8 5-2.8 5 0v3H14V8z"/><path d="M14 11v10"/><path d="M19 11v10"/></svg>`,
  },
  {
    id: "bar",
    href: "/staff/bar",
    label: { en: "Bar", zh: "吧台" },
    description: { en: "Bar production queue", zh: "吧台出品队列" },
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 22h8"/><path d="M12 11v11"/><path d="M17.5 6.5 12 12 6.5 6.5"/><path d="M3 3h18l-2.5 3.5H5.5L3 3z"/></svg>`,
  },
  {
    id: "runner",
    href: "/staff/runner",
    label: { en: "Runner", zh: "传菜" },
    description: { en: "Pickup & delivery queue", zh: "取餐 & 送餐队列" },
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="1.5"/><path d="m9 12 3-7 3 7"/><path d="M6 20h12"/><path d="m8 20 2-5h4l2 5"/></svg>`,
  },
  {
    id: "admin",
    href: "/admin",
    label: { en: "Admin", zh: "管理" },
    description: { en: "Session & reports", zh: "场次管理 & 报表" },
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="18" cy="18" r="3"/><path d="m21 21-1.5-1.5"/></svg>`,
  },
];

/** Look up a view by id. Returns undefined if not found. */
export function getStaffView(id: StaffViewId): StaffView | undefined {
  return STAFF_VIEWS.find((v) => v.id === id);
}

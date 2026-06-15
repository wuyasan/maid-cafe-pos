export const STAFF_VIEW_STORAGE_KEY = "maid-cafe-pos:last-staff-view";

export type StaffViewId = "floor" | "order" | "kitchen" | "bar" | "admin";

export type StaffViewDefinition = {
  id: StaffViewId;
  title: string;
  subtitle: string;
  description: string;
  href: string;
  emoji: string;
};

export const STAFF_VIEWS: StaffViewDefinition[] = [
  {
    id: "floor",
    title: "Front / Floor",
    subtitle: "前台 / 巡台",
    description: "查看桌位、人数、拼桌属性、未结款和结账入口。",
    href: "/staff/floor",
    emoji: "🪑",
  },
  {
    id: "order",
    title: "Maid Ordering",
    subtitle: "女仆代客点单",
    description: "选择桌位并帮助顾客添加菜单商品。",
    href: "/staff/order",
    emoji: "📝",
  },
  {
    id: "kitchen",
    title: "Kitchen",
    subtitle: "后厨",
    description: "查看归属于 Kitchen 的待制作订单。",
    href: "/staff/kitchen",
    emoji: "🍳",
  },
  {
    id: "bar",
    title: "Bar",
    subtitle: "水吧",
    description: "查看归属于 Bar 的待制作饮品。",
    href: "/staff/bar",
    emoji: "🥤",
  },
  {
    id: "admin",
    title: "Admin",
    subtitle: "后台管理",
    description: "管理场次、桌位、菜单、女仆和系统设置。",
    href: "/admin",
    emoji: "⚙️",
  },
];

export function findStaffView(id: string | null | undefined) {
  return STAFF_VIEWS.find((view) => view.id === id) ?? null;
}

export function getStaffViewFromPath(pathname: string): StaffViewId | null {
  if (pathname === "/staff" || pathname === "/staff/") return null;
  if (pathname.startsWith("/staff/order")) return "order";
  if (pathname.startsWith("/staff/kitchen")) return "kitchen";
  if (pathname.startsWith("/staff/bar")) return "bar";
  if (
    pathname.startsWith("/staff/floor") ||
    pathname.startsWith("/staff/tables") ||
    pathname.startsWith("/staff/table/")
  ) {
    return "floor";
  }
  return null;
}

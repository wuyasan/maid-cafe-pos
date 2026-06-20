import { redirect } from "next/navigation";

// /admin → /admin/sessions
export default function AdminRootPage() {
  redirect("/admin/sessions");
}

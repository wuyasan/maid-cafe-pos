import { redirect } from "next/navigation";
import { api } from "@/lib/server/api-client";

// Re-evaluate per request so the redirect target is never statically baked
// (a build-time null current-session would otherwise send everyone to the list).
export const dynamic = "force-dynamic";

// The "销售汇总 / Sales" nav entry lands here and jumps to the active session's
// summary; if none is active, falls back to the newest session; only a truly
// empty sessions table sends the user to the sessions list.
export default async function AdminSalesSummaryRedirect() {
  const current = await api.getCurrentSession();
  if (current) redirect(`/admin/sessions/${current.id}/summary`);

  const sessions = await api.getSessions();
  if (sessions.length > 0) {
    const newest = sessions.reduce((a, b) => (b.id > a.id ? b : a));
    redirect(`/admin/sessions/${newest.id}/summary`);
  }

  redirect("/admin/sessions");
}

import { api } from "@/lib/server/api-client";
import { StaffShell } from "@/components/staff/StaffShell";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  // Session is semi-static (name/status don't change mid-session) — use the cached fetch.
  const session = await api.getCurrentSession();

  return <StaffShell session={session}>{children}</StaffShell>;
}

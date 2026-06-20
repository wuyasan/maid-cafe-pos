import { api } from "@/lib/server/api-client";
import { getSession } from "@/lib/server/auth";
import { StaffShell } from "@/components/staff/StaffShell";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  // Session is semi-static (name/status don't change mid-session) — use the cached fetch.
  const session = await api.getCurrentSession();
  // Auth role gates the Admin entry: only admins may reach /admin (proxy.ts enforces
  // it server-side; we hide the link for manager/staff to avoid a dead nav item).
  const auth = await getSession();
  const role = auth?.role ?? null;

  return (
    <StaffShell session={session} role={role}>
      {children}
    </StaffShell>
  );
}

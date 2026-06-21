import { api } from "@/lib/server/api-client";
import { StaffUsersClient } from "./StaffUsersClient";
import type { StaffUserAdmin } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminStaffUsersPage() {
  // Distinguish a genuine empty list (fetch succeeded, returned []) from a
  // backend / migration failure. The old code swallowed all errors and rendered
  // an empty list, masking outages as "no accounts". Now we surface the error.
  let users: StaffUserAdmin[] = [];
  let loadError = false;
  try {
    users = await api.getStaffUsers();
  } catch {
    loadError = true;
  }
  return (
    <div style={{ padding: "20px 16px", maxWidth: 960 }}>
      <StaffUsersClient initialUsers={users} loadError={loadError} />
    </div>
  );
}

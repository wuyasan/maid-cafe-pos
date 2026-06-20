import { redirect } from "next/navigation";

// The POS has no public landing page. Customers enter via a table QR at
// /order/[tableCode]; the bare root is the staff/admin entry, so send it to login.
export default function RootPage() {
  redirect("/login");
}

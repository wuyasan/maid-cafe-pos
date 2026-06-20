import { api } from "@/lib/server/api-client";
import { TableDetail } from "./TableDetail";

interface Props {
  params: Promise<{ tableCode: string }>;
}

export default async function TablePage({ params }: Props) {
  const { tableCode } = await params;
  // Initial bill SSR — will be refreshed client-side by useLiveQuery.
  const initialBill = await api.getTableBill(tableCode);

  return <TableDetail tableCode={tableCode} initialBill={initialBill} />;
}

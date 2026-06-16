export type PendingSquareCheckout = {
  tableCode: string;
  billId: number;
  total: string;
  createdAt: string;
};

export const SQUARE_PENDING_CHECKOUT_KEY =
  "maid-cafe-pos:square-pending-checkout";

function requireValue(
  value: string | undefined,
  name: string,
) {
  const normalized = value?.trim();

  if (!normalized) {
    throw new Error(`${name} is not configured.`);
  }

  return normalized;
}

export function buildSquarePosUrl(args: {
  total: string;
  tableCode: string;
  billId: number;
}) {
  const applicationId = requireValue(
    process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID,
    "NEXT_PUBLIC_SQUARE_APPLICATION_ID",
  );

  const callbackUrl = requireValue(
    process.env.NEXT_PUBLIC_SQUARE_CALLBACK_URL,
    "NEXT_PUBLIC_SQUARE_CALLBACK_URL",
  );

  const locationId =
    process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID?.trim();

  const cents = Math.round(Number(args.total) * 100);

  if (!Number.isFinite(cents) || cents <= 0) {
    throw new Error("The bill total must be greater than zero.");
  }

  const data = {
    amount_money: {
      amount: String(cents),
      currency_code: "USD",
    },
    callback_url: callbackUrl,
    client_id: applicationId,
    version: "1.3",
    location_id: locationId || undefined,
    state: JSON.stringify({
      tableCode: args.tableCode,
      billId: args.billId,
    }),
    notes:
      `Maid Cafe · Table ${args.tableCode} · Bill #${args.billId}`,
    options: {
      supported_tender_types: ["CREDIT_CARD"],
      auto_return: true,
      skip_receipt: false,
      clear_default_fees: true,
    },
  };

  return (
    "square-commerce-v1://payment/create?data=" +
    encodeURIComponent(JSON.stringify(data))
  );
}

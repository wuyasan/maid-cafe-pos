export type PendingSquareCheckout = {
  tableCode: string;
  billId: number;
  total: string;
  createdAt: string;
};

export const SQUARE_PENDING_CHECKOUT_KEY =
  "maid-cafe-pos:square-pending-checkout";

function requireValue(value: string | undefined, name: string) {
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

  const locationId = process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID?.trim();
  const cents = Math.round(Number(args.total) * 100);

  if (!Number.isFinite(cents) || cents <= 0) {
    throw new Error("The bill total must be greater than zero.");
  }

  const state = JSON.stringify({
    tableCode: args.tableCode,
    billId: args.billId,
  });

  const userAgent =
    typeof navigator === "undefined" ? "" : navigator.userAgent.toLowerCase();

  if (/android/.test(userAgent)) {
    const parts = [
      "intent:#Intent",
      "action=com.squareup.pos.action.CHARGE",
      "package=com.squareup",
      `S.browser_fallback_url=${callbackUrl}`,
      `S.com.squareup.pos.WEB_CALLBACK_URI=${callbackUrl}`,
      `S.com.squareup.pos.CLIENT_ID=${applicationId}`,
      "S.com.squareup.pos.API_VERSION=v2.0",
      `i.com.squareup.pos.TOTAL_AMOUNT=${cents}`,
      "S.com.squareup.pos.CURRENCY_CODE=USD",
      "S.com.squareup.pos.TENDER_TYPES=com.squareup.pos.TENDER_CARD",
      `S.com.squareup.pos.NOTE=${encodeURIComponent(
        `Maid Cafe · Table ${args.tableCode} · Bill #${args.billId}`,
      )}`,
      `S.com.squareup.pos.REQUEST_METADATA=${encodeURIComponent(state)}`,
      "l.com.squareup.pos.AUTO_RETURN_TIMEOUT_MS=1500",
      "end",
    ];

    return parts.join(";");
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
    state,
    notes: `Maid Cafe · Table ${args.tableCode} · Bill #${args.billId}`,
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

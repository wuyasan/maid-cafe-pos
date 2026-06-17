export type PendingSquareCheckout = {
  tableCode: string;
  billId: number;
  total: string;
  createdAt: string;
};

export type SquareRuntimeConfig = {
  applicationId: string;
  callbackUrl: string;
  locationId?: string;
};

export const SQUARE_PENDING_CHECKOUT_KEY =
  "maid-cafe-pos:square-pending-checkout";

export const SQUARE_RUNTIME_CONFIG_KEY =
  "maid-cafe-pos:square-runtime-config";

function readRuntimeConfig(): Partial<SquareRuntimeConfig> {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(
      SQUARE_RUNTIME_CONFIG_KEY,
    );

    if (!raw) {
      return {};
    }

    return JSON.parse(raw) as Partial<SquareRuntimeConfig>;
  } catch {
    return {};
  }
}

export function getSquareConfig(): SquareRuntimeConfig {
  const runtime = readRuntimeConfig();

  const applicationId =
    process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID?.trim() ||
    runtime.applicationId?.trim() ||
    "";

  const callbackUrl =
    process.env.NEXT_PUBLIC_SQUARE_CALLBACK_URL?.trim() ||
    runtime.callbackUrl?.trim() ||
    "";

  const locationId =
    process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID?.trim() ||
    runtime.locationId?.trim() ||
    "";

  if (!applicationId) {
    throw new Error(
      "Square Application ID is not configured. Open Staff → Square Settings.",
    );
  }

  if (!callbackUrl) {
    throw new Error(
      "Square callback URL is not configured. Open Staff → Square Settings.",
    );
  }

  return {
    applicationId,
    callbackUrl,
    locationId: locationId || undefined,
  };
}

export function saveSquareRuntimeConfig(
  config: SquareRuntimeConfig,
) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    SQUARE_RUNTIME_CONFIG_KEY,
    JSON.stringify(config),
  );
}

export function buildSquarePosUrl(args: {
  total: string;
  tableCode: string;
  billId: number;
}) {
  const config = getSquareConfig();
  const cents = Math.round(Number(args.total) * 100);

  if (!Number.isFinite(cents) || cents <= 0) {
    throw new Error(
      "The bill total must be greater than zero.",
    );
  }

  const data = {
    amount_money: {
      amount: String(cents),
      currency_code: "USD",
    },
    callback_url: config.callbackUrl,
    client_id: config.applicationId,
    version: "1.3",
    location_id: config.locationId,
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

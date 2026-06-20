// Client-only Square POS utilities. No server-only import — runs in the browser.

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
    const raw = window.localStorage.getItem(SQUARE_RUNTIME_CONFIG_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<SquareRuntimeConfig>;
  } catch {
    return {};
  }
}

/** Resolve config: env vars take priority, then localStorage runtime config.
 *  Throws if applicationId or callbackUrl are missing. */
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

/** Persist per-device Square config to localStorage. */
export function saveSquareRuntimeConfig(config: SquareRuntimeConfig): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SQUARE_RUNTIME_CONFIG_KEY, JSON.stringify(config));
}

/** Build the square-commerce-v1:// deep-link URL for Square POS.
 *  total is a decimal string (e.g. "12.50"), converted to cents internally. */
export function buildSquarePosUrl(args: {
  total: string;
  tableCode: string;
  billId: number;
}): string {
  const config = getSquareConfig();
  const cents = Math.round(Number(args.total) * 100);

  if (!Number.isFinite(cents) || cents <= 0) {
    throw new Error("The bill total must be greater than zero.");
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

/** Save a pending checkout to localStorage before handing off to Square POS. */
export function savePendingCheckout(
  pending: PendingSquareCheckout,
): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    SQUARE_PENDING_CHECKOUT_KEY,
    JSON.stringify(pending),
  );
}

/** Read the pending checkout from localStorage; returns null if missing/corrupt. */
export function readPendingCheckout(): PendingSquareCheckout | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SQUARE_PENDING_CHECKOUT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PendingSquareCheckout;
  } catch {
    return null;
  }
}

/** Clear the pending checkout from localStorage. */
export function clearPendingCheckout(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SQUARE_PENDING_CHECKOUT_KEY);
}

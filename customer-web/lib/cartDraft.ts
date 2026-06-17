export type DraftableMenuItem = {
  id: number;
};

export type DraftableCartLine<
  TItem extends DraftableMenuItem,
> = {
  key: string;
  item: TItem;
  quantity: number;
  selectedMaidIds: number[];
};

type StoredCartLine = {
  key: string;
  menuItemId: number;
  quantity: number;
  selectedMaidIds: number[];
};

type StoredCartDraft = {
  version: 1;
  sessionId: number | null;
  savedAt: number;
  lines: StoredCartLine[];
};

const DRAFT_PREFIX =
  "maid-cafe-order-draft:v1";
const MAX_DRAFT_AGE_MS =
  24 * 60 * 60 * 1000;

function draftKey(
  tableCode: string,
  source: "qr" | "staff",
) {
  return `${DRAFT_PREFIX}:${source}:${tableCode}`;
}

export function saveCartDraft<
  TItem extends DraftableMenuItem,
>(
  tableCode: string,
  source: "qr" | "staff",
  sessionId: number | null,
  lines: DraftableCartLine<TItem>[],
) {
  if (
    typeof window === "undefined" ||
    !tableCode
  ) {
    return;
  }

  const key = draftKey(
    tableCode,
    source,
  );

  if (lines.length === 0) {
    window.localStorage.removeItem(key);
    return;
  }

  const payload: StoredCartDraft = {
    version: 1,
    sessionId,
    savedAt: Date.now(),
    lines: lines.map((line) => ({
      key: line.key,
      menuItemId: line.item.id,
      quantity: line.quantity,
      selectedMaidIds: [
        ...line.selectedMaidIds,
      ],
    })),
  };

  window.localStorage.setItem(
    key,
    JSON.stringify(payload),
  );
}

export function restoreCartDraft<
  TItem extends DraftableMenuItem,
>(
  tableCode: string,
  source: "qr" | "staff",
  sessionId: number | null,
  menuItems: TItem[],
): DraftableCartLine<TItem>[] {
  if (
    typeof window === "undefined" ||
    !tableCode
  ) {
    return [];
  }

  const key = draftKey(
    tableCode,
    source,
  );
  const raw =
    window.localStorage.getItem(key);

  if (!raw) {
    return [];
  }

  try {
    const payload =
      JSON.parse(raw) as StoredCartDraft;

    const expired =
      !payload.savedAt ||
      Date.now() - payload.savedAt >
        MAX_DRAFT_AGE_MS;

    const differentSession =
      payload.sessionId !== sessionId;

    if (
      payload.version !== 1 ||
      expired ||
      differentSession ||
      !Array.isArray(payload.lines)
    ) {
      window.localStorage.removeItem(
        key,
      );
      return [];
    }

    const itemById = new Map(
      menuItems.map((item) => [
        item.id,
        item,
      ]),
    );

    const restored =
      payload.lines.flatMap((line) => {
        const item = itemById.get(
          line.menuItemId,
        );

        if (
          !item ||
          !Number.isInteger(
            line.quantity,
          ) ||
          line.quantity < 1
        ) {
          return [];
        }

        return [
          {
            key:
              line.key ||
              `${item.id}-${Date.now()}-${Math.random()}`,
            item,
            quantity: line.quantity,
            selectedMaidIds:
              Array.isArray(
                line.selectedMaidIds,
              )
                ? line.selectedMaidIds.filter(
                    (id) =>
                      Number.isInteger(id),
                  )
                : [],
          },
        ];
      });

    if (restored.length === 0) {
      window.localStorage.removeItem(
        key,
      );
    }

    return restored;
  } catch {
    window.localStorage.removeItem(key);
    return [];
  }
}

export function clearCartDraft(
  tableCode: string,
  source: "qr" | "staff",
) {
  if (
    typeof window === "undefined" ||
    !tableCode
  ) {
    return;
  }

  window.localStorage.removeItem(
    draftKey(tableCode, source),
  );
}

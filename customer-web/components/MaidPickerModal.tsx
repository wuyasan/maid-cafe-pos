"use client";

import { useEffect, useMemo, useState } from "react";
import type { MenuItemRecord, SessionMaidAdminItem } from "@/lib/types";

type Props = {
  open: boolean;
  item: MenuItemRecord | null;
  maids: SessionMaidAdminItem[];
  onClose: () => void;
  onSubmit: (item: MenuItemRecord, selectedMaidIds: number[]) => Promise<void>;
};

function money(v: number | string) {
  return `$${Number(v || 0).toFixed(2)}`;
}

export default function MaidPickerModal({
  open,
  item,
  maids,
  onClose,
  onSubmit,
}: Props) {
  const [selected, setSelected] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const availableMaids = useMemo(
    () => maids.filter((m) => m.is_available),
    [maids]
  );

  const basePrice = Number(item?.price || 0);
  const additionalPrice = Number(item?.maid_service_pricing?.additional_maid_price || 0);
  const allMaidsPrice =
    item?.maid_service_pricing?.all_maids_price != null
      ? Number(item.maid_service_pricing.all_maids_price)
      : null;

  useEffect(() => {
    if (open) {
      setSelected([]);
      setError("");
    }
  }, [open, item]);

  if (!open || !item) return null;

  function toggleMaid(maidId: number) {
    setSelected((prev) =>
      prev.includes(maidId) ? prev.filter((id) => id !== maidId) : [...prev, maidId]
    );
  }

  function handleSelectAllMaids() {
    setSelected(availableMaids.map((m) => m.maid_id));
  }

  function handleClear() {
    setSelected([]);
  }

  const selectedCount = selected.length;

  let countedPrice = 0;
  if (selectedCount > 0) {
    countedPrice = basePrice + Math.max(0, selectedCount - 1) * additionalPrice;
  }

  const canApplyAllMaidsPrice =
    allMaidsPrice != null &&
    availableMaids.length > 0 &&
    selectedCount === availableMaids.length;

  const estimatedUnitPrice =
    selectedCount > 0
      ? canApplyAllMaidsPrice
        ? Math.min(countedPrice, allMaidsPrice!)
        : countedPrice
      : 0;

  const allMaidsPriceApplied =
    canApplyAllMaidsPrice &&
    allMaidsPrice != null &&
    countedPrice > allMaidsPrice;

  async function handleSubmit() {
    setError("");

    if (!item) {
      setError("No maid service item is selected.");
      return;
    }

    if (selected.length === 0) {
      setError("Please select at least one maid.");
      return;
    }

    setSubmitting(true);

    try {
      await onSubmit(item, selected);
      setSelected([]);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to add maid service",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        zIndex: 1000,
      }}
    >
      <div
        style={{
          width: "min(760px, 100%)",
          maxHeight: "80vh",
          overflow: "auto",
          background: "#fff",
          borderRadius: 18,
          padding: 20,
          display: "grid",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h3 style={{ margin: 0 }}>{item.name}</h3>
            <p style={{ margin: "6px 0 0", color: "#4b5563" }}>
              Base price includes 1 maid. All Maids pricing only applies when all available maids are selected.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid #d1d5db",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>

        <div
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <button
            type="button"
            onClick={handleSelectAllMaids}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "none",
              background: "#111827",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            All Maids
          </button>

          <button
            type="button"
            onClick={handleClear}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #d1d5db",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            Clear Selection
          </button>

          <div style={{ color: "#4b5563", fontSize: 14 }}>
            Selected: <strong>{selectedCount}</strong>
          </div>
        </div>

        <div
          style={{
            padding: 14,
            borderRadius: 12,
            background: "#f9fafb",
            border: "1px solid #e5e7eb",
            display: "grid",
            gap: 6,
          }}
        >
          <div>Base Price: {money(basePrice)}</div>
          <div>Additional Maid Price: {money(additionalPrice)}</div>
          {allMaidsPrice != null ? <div>All Maids Together: {money(allMaidsPrice)}</div> : null}
          <div>
            Estimated Price: <strong>{money(estimatedUnitPrice)}</strong>
          </div>
          {allMaidsPriceApplied ? (
            <div style={{ color: "#059669", fontSize: 14 }}>
              All Maids price applied automatically.
            </div>
          ) : null}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: 12,
          }}
        >
          {availableMaids.map((maid) => {
            const checked = selected.includes(maid.maid_id);

            return (
              <button
                key={maid.id}
                type="button"
                onClick={() => toggleMaid(maid.maid_id)}
                style={{
                  textAlign: "left",
                  padding: 12,
                  borderRadius: 14,
                  border: checked ? "2px solid #111827" : "1px solid #e5e7eb",
                  background: checked ? "#f9fafb" : "#fff",
                  cursor: "pointer",
                  display: "grid",
                  gap: 8,
                }}
              >
                <div
                  style={{
                    width: "100%",
                    aspectRatio: "1 / 1",
                    borderRadius: 12,
                    background: "#f3f4f6",
                    overflow: "hidden",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#9ca3af",
                    fontSize: 12,
                  }}
                >
                  {maid.maid_photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={maid.maid_photo_url}
                      alt={maid.maid_name}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    "No Image"
                  )}
                </div>

                <strong>{maid.maid_name}</strong>
              </button>
            );
          })}
        </div>

        {error ? <p style={{ color: "#b91c1c", margin: 0 }}>{error}</p> : null}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          style={{
            padding: "12px 16px",
            borderRadius: 12,
            border: "none",
            background: "#111827",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          {submitting ? "Adding..." : "Add to Order"}
        </button>
      </div>
    </div>
  );
}
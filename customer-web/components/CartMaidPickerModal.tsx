"use client";

import { useEffect, useMemo, useState } from "react";

import styles from "@/app/order/[tableCode]/order.module.css";
import type {
  MenuItemRecord,
  SessionMaidAdminItem,
} from "@/lib/types";

type Props = {
  item: MenuItemRecord;
  maids: SessionMaidAdminItem[];
  initialSelectedIds: number[];
  onCancel: () => void;
  onConfirm: (ids: number[]) => void;
};

export default function CartMaidPickerModal({
  item,
  maids,
  initialSelectedIds,
  onCancel,
  onConfirm,
}: Props) {
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    setSelectedIds([...initialSelectedIds]);
    setError("");
  }, [item.id, initialSelectedIds]);

  const allSelected = useMemo(
    () => maids.length > 0 && selectedIds.length === maids.length,
    [maids.length, selectedIds.length],
  );

  function toggle(id: number) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
    setError("");
  }

  function submit() {
    if (selectedIds.length === 0) {
      setError("Please select at least one maid.");
      return;
    }
    onConfirm(selectedIds);
  }

  return (
    <div className={styles.modalBackdrop}>
      <section className={styles.maidModal}>
        <div className={styles.modalHeader}>
          <div>
            <div className={styles.modalEyebrow}>Maid selection</div>
            <h2>{item.name}</h2>
          </div>
          <button type="button" onClick={onCancel} className={styles.closeButton}>
            ×
          </button>
        </div>

        <button
          type="button"
          onClick={() =>
            setSelectedIds(
              allSelected ? [] : maids.map((maid) => maid.maid_id),
            )
          }
          className={styles.selectAllButton}
        >
          {allSelected ? "Clear all" : "Select all maids"}
        </button>

        <div className={styles.maidGrid}>
          {maids.map((maid) => {
            const selected = selectedIds.includes(maid.maid_id);
            return (
              <button
                key={maid.id}
                type="button"
                onClick={() => toggle(maid.maid_id)}
                className={`${styles.maidChoice} ${
                  selected ? styles.selected : ""
                }`}
              >
                {maid.maid_photo_url ? (
                  <img src={maid.maid_photo_url} alt={maid.maid_name} />
                ) : (
                  <div className={styles.maidAvatar}>
                    {maid.maid_name.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <strong>{maid.maid_name}</strong>
              </button>
            );
          })}
        </div>

        {error ? <div className={styles.modalError}>{error}</div> : null}

        <div className={styles.modalActions}>
          <button
            type="button"
            onClick={onCancel}
            className={styles.secondaryButton}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            className={styles.primaryButton}
          >
            Confirm Maid
          </button>
        </div>
      </section>
    </div>
  );
}

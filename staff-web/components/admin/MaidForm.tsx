"use client";

import {
  useEffect,
  useState,
} from "react";

import type {
  Maid,
  MaidCreatePayload,
  MaidUpdatePayload,
} from "@/lib/types";

import MaidImageField from "./MaidImageField";

type Props = {
  editingMaid: Maid | null;
  onCreate: (
    payload: MaidCreatePayload,
  ) => Promise<unknown>;
  onUpdate: (
    maidId: number,
    payload: MaidUpdatePayload,
  ) => Promise<unknown>;
  onCancelEdit: () => void;
};

export default function MaidForm({
  editingMaid,
  onCreate,
  onUpdate,
  onCancelEdit,
}: Props) {
  const [name, setName] =
    useState("");
  const [photoUrl, setPhotoUrl] =
    useState("");
  const [bio, setBio] =
    useState("");
  const [isActive, setIsActive] =
    useState(true);
  const [
    displayOrder,
    setDisplayOrder,
  ] = useState(0);
  const [submitting, setSubmitting] =
    useState(false);
  const [error, setError] =
    useState("");

  useEffect(() => {
    if (editingMaid) {
      setName(
        editingMaid.name ?? "",
      );
      setPhotoUrl(
        editingMaid.photo_url ?? "",
      );
      setBio(
        editingMaid.bio ?? "",
      );
      setIsActive(
        editingMaid.is_active,
      );
      setDisplayOrder(
        editingMaid.display_order ?? 0,
      );
    } else {
      setName("");
      setPhotoUrl("");
      setBio("");
      setIsActive(true);
      setDisplayOrder(0);
    }
  }, [editingMaid]);

  async function handleSubmit(
    event: React.FormEvent,
  ) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const payload = {
        name,
        photo_url:
          photoUrl || null,
        bio: bio || null,
        is_active: isActive,
        display_order:
          displayOrder,
      };

      if (editingMaid) {
        await onUpdate(
          editingMaid.id,
          payload,
        );
      } else {
        await onCreate(payload);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to save maid",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      style={{
        marginBottom: 24,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent:
            "space-between",
          gap: 12,
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <h3 style={{ margin: 0 }}>
          {editingMaid
            ? "Edit Maid"
            : "Add Maid"}
        </h3>

        {editingMaid ? (
          <button
            type="button"
            onClick={onCancelEdit}
          >
            Cancel
          </button>
        ) : null}
      </div>

      <form
        onSubmit={handleSubmit}
        style={{
          display: "grid",
          gap: 12,
          maxWidth: 680,
        }}
      >
        <label
          style={{
            display: "grid",
            gap: 6,
          }}
        >
          <span>Name</span>
          <input
            value={name}
            onChange={(event) =>
              setName(
                event.target.value,
              )
            }
            required
            style={{
              padding: 10,
              borderRadius: 10,
              border:
                "1px solid #d1d5db",
            }}
          />
        </label>

        <MaidImageField
          value={photoUrl}
          onChange={setPhotoUrl}
        />

        <label
          style={{
            display: "grid",
            gap: 6,
          }}
        >
          <span>Bio</span>
          <textarea
            value={bio}
            onChange={(event) =>
              setBio(
                event.target.value,
              )
            }
            rows={4}
            style={{
              padding: 10,
              borderRadius: 10,
              border:
                "1px solid #d1d5db",
            }}
          />
        </label>

        <label
          style={{
            display: "grid",
            gap: 6,
          }}
        >
          <span>
            Display Order
          </span>
          <input
            type="number"
            value={displayOrder}
            onChange={(event) =>
              setDisplayOrder(
                Number(
                  event.target.value,
                ),
              )
            }
            style={{
              padding: 10,
              borderRadius: 10,
              border:
                "1px solid #d1d5db",
            }}
          />
        </label>

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <input
            type="checkbox"
            checked={isActive}
            onChange={(event) =>
              setIsActive(
                event.target.checked,
              )
            }
          />
          <span>Active</span>
        </label>

        {error ? (
          <p
            style={{
              color: "#b91c1c",
              margin: 0,
            }}
          >
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "none",
            background: "#111827",
            color: "#ffffff",
            cursor: "pointer",
          }}
        >
          {submitting
            ? "Saving..."
            : editingMaid
              ? "Update Maid"
              : "Create Maid"}
        </button>
      </form>
    </section>
  );
}

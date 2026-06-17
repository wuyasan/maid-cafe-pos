"use client";

import {
  type ChangeEvent,
  useRef,
  useState,
} from "react";

import { apiPostFormData } from "@/lib/api";

type UploadResponse = {
  image_url: string;
  storage_backend: "local" | "s3";
};

type Props = {
  value: string;
  onChange: (value: string) => void;
};

export default function MenuImageField({
  value,
  onChange,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] =
    useState(false);
  const [error, setError] = useState("");

  async function upload(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please select an image file.");
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setError("Maximum image size is 8 MB.");
      return;
    }

    try {
      setUploading(true);
      setError("");

      const form = new FormData();
      form.append("image", file);

      const result =
        await apiPostFormData<UploadResponse>(
          "/admin/uploads/menu-image",
          form,
        );

      onChange(result.image_url);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Image upload failed.",
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <section
      style={{
        display: "grid",
        gap: 10,
        padding: 12,
        border: "1px solid #d1d5db",
        borderRadius: 12,
      }}
    >
      <label style={{ display: "grid", gap: 6 }}>
        <span>Image URL</span>
        <input
          value={value}
          onChange={(event) =>
            onChange(event.target.value)
          }
          placeholder="https://..."
        />
      </label>

      <div
        style={{
          display: "flex",
          gap: 9,
          flexWrap: "wrap",
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={(event) => void upload(event)}
          hidden
        />

        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          style={{
            minHeight: 42,
            padding: "9px 14px",
            borderRadius: 10,
            border: "1px solid #4f46e5",
            background: "#4f46e5",
            color: "#ffffff",
            fontWeight: 850,
          }}
        >
          {uploading
            ? "Uploading..."
            : "Choose from device"}
        </button>

        {value ? (
          <button
            type="button"
            onClick={() => onChange("")}
            style={{
              minHeight: 42,
              padding: "9px 14px",
              borderRadius: 10,
              border: "1px solid #d1d5db",
              background: "#ffffff",
              fontWeight: 800,
            }}
          >
            Remove image
          </button>
        ) : null}
      </div>

      {error ? (
        <div style={{ color: "#b91c1c" }}>
          {error}
        </div>
      ) : null}

      {value ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={value}
          alt="Menu item preview"
          style={{
            width: "min(100%, 360px)",
            aspectRatio: "4 / 3",
            objectFit: "cover",
            borderRadius: 12,
            border: "1px solid #e5e7eb",
          }}
        />
      ) : null}

      <small style={{ color: "#64748b" }}>
        Local development stores files under backend/uploads.
        Cloud deployment uses S3-compatible object storage through
        environment variables.
      </small>
    </section>
  );
}

"use client";
/**
 * ConfirmDialog — design-system modal that replaces native window.confirm.
 *
 * Controlled usage (direct):
 *   <ConfirmDialog
 *     open={open}
 *     title="Delete item?"
 *     description="This cannot be undone."
 *     onConfirm={() => doDelete()}
 *     onCancel={() => setOpen(false)}
 *   />
 *
 * Hook usage (imperative):
 *   const { confirm, dialog } = useConfirm();
 *   const ok = await confirm({ title: "…", description: "…" });
 *   return <>{dialog}</>;
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
// ─── Types ────────────────────────────────────────────────────────────────────

export interface ConfirmDialogProps {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  /** Text on the confirm button. Default: "Confirm" */
  confirmLabel?: string;
  /** Text on the cancel button. Default: "Cancel" */
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Returns all focusable elements inside a container, in DOM order. */
function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => !el.closest("[inert]"));
}

// ─── ConfirmDialog component ──────────────────────────────────────────────────

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  // Remember the element that was focused before the dialog opened.
  const previousFocusRef = useRef<Element | null>(null);

  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement;
      // Move focus to cancel button on next tick.
      setTimeout(() => cancelBtnRef.current?.focus(), 0);
    } else {
      (previousFocusRef.current as HTMLElement | null)?.focus?.();
    }
  }, [open]);

  // Tab / Shift+Tab focus trap + Esc dismiss
  useEffect(() => {
    if (!open) return;

    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onCancel();
        return;
      }

      if (e.key !== "Tab") return;

      const container = dialogRef.current;
      if (!container) return;

      const focusable = getFocusable(container);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (e.shiftKey) {
        // Shift+Tab: if on first, wrap to last
        if (active === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        // Tab: if on last, wrap to first
        if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      role="presentation"
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 24px",
      }}
    >
      {/* Dialog panel — stop propagation so clicking inside doesn't close */}
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby={description ? "confirm-dialog-desc" : undefined}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: "18px",
          padding: "28px 26px 22px",
          maxWidth: "360px",
          width: "100%",
          boxShadow: "0 12px 40px -8px rgba(58,42,48,0.22), 0 2px 8px -2px rgba(58,42,48,0.10)",
        }}
      >
        {/* Title */}
        <div
          id="confirm-dialog-title"
          style={{
            fontWeight: 700,
            fontSize: "16px",
            color: "var(--foreground, #3A2A30)",
            fontFamily: "var(--font-display-stack, inherit)",
            marginBottom: description ? "10px" : "20px",
            lineHeight: 1.3,
          }}
        >
          {title}
        </div>

        {/* Description */}
        {description && (
          <div
            id="confirm-dialog-desc"
            style={{
              fontSize: "13.5px",
              color: "#7A6A6E",
              lineHeight: 1.5,
              marginBottom: "22px",
            }}
          >
            {description}
          </div>
        )}

        {/* Actions */}
        <div
          style={{
            display: "flex",
            gap: "10px",
            justifyContent: "flex-end",
          }}
        >
          {/* Use native buttons so we can attach refs without needing forwardRef on Button */}
          <button
            ref={cancelBtnRef}
            type="button"
            onClick={onCancel}
            style={{
              minWidth: "80px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "12px",
              padding: "11px 20px",
              fontWeight: 600,
              fontSize: "13.5px",
              border: "1.5px solid rgba(58,42,48,0.16)",
              cursor: "pointer",
              minHeight: "var(--tap-min)",
              fontFamily: "inherit",
              background: "transparent",
              color: "#3A2A30",
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              minWidth: "90px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "12px",
              padding: "11px 20px",
              fontWeight: 600,
              fontSize: "13.5px",
              border: "none",
              cursor: "pointer",
              minHeight: "var(--tap-min)",
              fontFamily: "inherit",
              background: "#C9486A",
              color: "#fff",
              boxShadow: "0 8px 18px -10px rgba(201,72,106,0.8)",
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── useConfirm hook ─────────────────────────────────────────────────────────

interface ConfirmOptions {
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
}

export function useConfirm() {
  const [state, setState] = useState<{
    open: boolean;
    options: ConfirmOptions;
    resolve: ((val: boolean) => void) | null;
  }>({ open: false, options: { title: "" }, resolve: null });

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setState({ open: true, options, resolve });
    });
  }, []);

  function handleConfirm() {
    state.resolve?.(true);
    setState((s) => ({ ...s, open: false, resolve: null }));
  }

  function handleCancel() {
    state.resolve?.(false);
    setState((s) => ({ ...s, open: false, resolve: null }));
  }

  const dialog = (
    <ConfirmDialog
      open={state.open}
      title={state.options.title}
      description={state.options.description}
      confirmLabel={state.options.confirmLabel}
      cancelLabel={state.options.cancelLabel}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  );

  return { confirm, dialog };
}

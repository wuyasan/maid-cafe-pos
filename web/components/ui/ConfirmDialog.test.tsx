/**
 * Tests for ConfirmDialog focus-trap behaviour.
 *
 * Coverage:
 *  - Tab on the last focusable element wraps back to the first
 *  - Shift+Tab on the first focusable element wraps to the last
 *  - Esc key fires onCancel
 *  - Focus is restored to the previously-focused element on close
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Render a controlled ConfirmDialog with default labels */
function renderDialog(
  open: boolean,
  onConfirm: () => void,
  onCancel: () => void,
) {
  return render(
    <ConfirmDialog
      open={open}
      title="Delete item?"
      description="This cannot be undone."
      confirmLabel="Confirm"
      cancelLabel="Cancel"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  );
}

/** Fire a Tab keydown event on the document */
function pressTab(shift = false) {
  fireEvent.keyDown(document, { key: "Tab", shiftKey: shift });
}

/** Fire Esc keydown event on the document */
function pressEsc() {
  fireEvent.keyDown(document, { key: "Escape" });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ConfirmDialog — focus trap", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("Tab on the last button wraps focus to the first button", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    renderDialog(true, onConfirm, onCancel);

    const cancelBtn = screen.getByRole("button", { name: "Cancel" });
    const confirmBtn = screen.getByRole("button", { name: "Confirm" });

    // Put focus on the last focusable element (Confirm button)
    confirmBtn.focus();
    expect(document.activeElement).toBe(confirmBtn);

    // Tab from last → should wrap to first (Cancel)
    pressTab(false);
    expect(document.activeElement).toBe(cancelBtn);
  });

  it("Shift+Tab on the first button wraps focus to the last button", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    renderDialog(true, onConfirm, onCancel);

    const cancelBtn = screen.getByRole("button", { name: "Cancel" });
    const confirmBtn = screen.getByRole("button", { name: "Confirm" });

    // Put focus on the first focusable element (Cancel button)
    cancelBtn.focus();
    expect(document.activeElement).toBe(cancelBtn);

    // Shift+Tab from first → should wrap to last (Confirm)
    pressTab(true);
    expect(document.activeElement).toBe(confirmBtn);
  });

  it("Esc key fires onCancel", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    renderDialog(true, onConfirm, onCancel);

    pressEsc();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("restores focus to the previously-focused element on close", () => {
    // Create an element outside the dialog that holds initial focus
    const trigger = document.createElement("button");
    trigger.textContent = "Open dialog";
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    function Wrapper() {
      const [open, setOpen] = useState(true);
      return (
        <ConfirmDialog
          open={open}
          title="Test"
          onConfirm={() => {
            onConfirm();
            setOpen(false);
          }}
          onCancel={() => {
            onCancel();
            setOpen(false);
          }}
        />
      );
    }

    render(<Wrapper />);

    // Dialog is open; trigger Esc to close
    pressEsc();

    // After close, focus should be back on the trigger button
    expect(document.activeElement).toBe(trigger);

    // Cleanup
    document.body.removeChild(trigger);
  });

  it("does not trap focus when closed (no keydown listener)", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    // Render closed — nothing should render, no keydown listener
    const { container } = render(
      <ConfirmDialog
        open={false}
        title="Test"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    // No dialog in DOM
    expect(container.querySelector('[role="alertdialog"]')).toBeNull();

    // Esc should not trigger onCancel when dialog is closed
    pressEsc();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("has correct ARIA attributes", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    renderDialog(true, onConfirm, onCancel);

    const dialog = screen.getByRole("alertdialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-labelledby")).toBe("confirm-dialog-title");
    expect(dialog.getAttribute("aria-describedby")).toBe("confirm-dialog-desc");
  });

  it("aria-describedby points to the description element when description is provided", () => {
    render(
      <ConfirmDialog
        open
        title="Delete item?"
        description="This cannot be undone."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("alertdialog");
    const descId = dialog.getAttribute("aria-describedby");
    expect(descId).toBe("confirm-dialog-desc");

    // The element with that id must exist and contain the description text.
    const descEl = document.getElementById(descId!);
    expect(descEl).not.toBeNull();
    expect(descEl!.textContent).toBe("This cannot be undone.");
  });

  it("aria-describedby is absent when no description is provided (destructive confirm without description has no false describedby)", () => {
    render(
      <ConfirmDialog
        open
        title="Mark as paid?"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("alertdialog");
    // Without a description, aria-describedby must be null (not set).
    expect(dialog.getAttribute("aria-describedby")).toBeNull();
    // And there must be no stale #confirm-dialog-desc element in the DOM.
    expect(document.getElementById("confirm-dialog-desc")).toBeNull();
  });
});

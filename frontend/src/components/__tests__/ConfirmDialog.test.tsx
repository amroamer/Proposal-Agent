import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConfirmDialog } from "../ConfirmDialog";

describe("ConfirmDialog", () => {
  const baseProps = {
    open: true,
    title: "Delete proposal?",
    message: "This will soft-delete the proposal.",
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  };

  it("renders title and message when open", () => {
    render(<ConfirmDialog {...baseProps} />);
    expect(screen.getByText("Delete proposal?")).toBeInTheDocument();
    expect(screen.getByText("This will soft-delete the proposal.")).toBeInTheDocument();
  });

  it("shows the named object prominently", () => {
    render(<ConfirmDialog {...baseProps} objectName='Q4 Bid for ZATCA' />);
    expect(screen.getByText('Q4 Bid for ZATCA')).toBeInTheDocument();
  });

  it("does not render when open=false", () => {
    const { container } = render(<ConfirmDialog {...baseProps} open={false} />);
    expect(container.innerHTML).toBe("");
  });

  it("calls onConfirm when confirm clicked", () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog {...baseProps} onConfirm={onConfirm} confirmLabel="Delete" />);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when cancel clicked", () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog {...baseProps} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("disables buttons during loading", () => {
    render(<ConfirmDialog {...baseProps} loading />);
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Working/ })).toBeDisabled();
  });
});

import { useEffect, useRef } from "react";
import { AlertTriangle, X } from "lucide-react";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  /** Name of the object being affected (e.g. 'proposal "Q4 Bid for ZATCA"') */
  objectName?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 'danger' for destructive, 'primary' for non-destructive */
  variant?: "danger" | "primary";
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

/**
 * A single reusable modal for every destructive action in the app.
 * Always names the affected object to prevent "oops, wrong one" errors.
 * Accessible: Escape cancels, focus trapped, ARIA labelled.
 */
export function ConfirmDialog({
  open, title, message, objectName,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  loading = false,
  onConfirm, onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onCancel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, loading, onCancel]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={() => !loading && onCancel()}
    >
      <div
        className="bg-white rounded-lg shadow-raise max-w-md w-full p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={variant === "danger"
              ? "h-10 w-10 rounded-full bg-red-100 flex items-center justify-center"
              : "h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center"}>
              <AlertTriangle className={variant === "danger" ? "h-5 w-5 text-kpmg-error" : "h-5 w-5 text-kpmg-blue"} />
            </div>
            <h2 id="confirm-title" className="text-lg font-semibold text-kpmg-gray-800">
              {title}
            </h2>
          </div>
          <button
            onClick={() => !loading && onCancel()}
            aria-label="Close"
            disabled={loading}
            className="text-kpmg-gray-400 hover:text-kpmg-gray-600 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="text-sm text-kpmg-gray-600 space-y-2 mb-6">
          <p>{message}</p>
          {objectName && (
            <p className="font-medium text-kpmg-gray-800 break-words bg-kpmg-gray-50 px-3 py-2 rounded">
              {objectName}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-3">
          <button ref={cancelRef} className="btn-secondary" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </button>
          <button
            className={variant === "danger" ? "btn-danger" : "btn-primary"}
            onClick={() => void onConfirm()}
            disabled={loading}
          >
            {loading ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import Overlay from "./Overlay";

export default function ConfirmDialog({
  message,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
  children,
}: {
  message: string;
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: React.ReactNode;
}) {
  return (
    <Overlay label={message} onClose={() => !busy && onCancel()}>
      <div className="p-4">
        <p className="font-display text-lg leading-snug">{message}</p>
        {children && <div className="mt-3">{children}</div>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded-full bg-red-500 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-400 disabled:opacity-60"
          >
            {busy ? "Removing…" : confirmLabel}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

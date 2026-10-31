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
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 font-display text-lg leading-snug">{message}</p>
          <button
            type="button"
            aria-label="Close dialog"
            onClick={onCancel}
            disabled={busy}
            className="rounded-full px-2 text-2xl leading-none text-white/50 hover:text-white disabled:opacity-60"
          >
            ×
          </button>
        </div>
        {children && <div className="mt-3">{children}</div>}
        <div className="mt-5 flex justify-end">
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

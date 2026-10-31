"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

export interface ToastOptions {
  action?: { label: string; onClick: () => void };
  durationMs?: number;
}

interface ToastItem {
  id: number;
  text: string;
  tone: "success" | "error";
  action?: ToastOptions["action"];
}

type Notify = (text: string, tone?: "success" | "error", opts?: ToastOptions) => void;

const ToastContext = createContext<Notify>(() => {});

export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((l) => l.filter((t) => t.id !== id)), []);

  const notify = useCallback<Notify>(
    (text, tone = "success", opts = {}) => {
      const id = nextId.current++;
      setToasts((l) => [...l, { id, text, tone, action: opts.action }]);
      setTimeout(() => dismiss(id), opts.durationMs ?? (tone === "error" ? 8000 : 4000));
    },
    [dismiss],
  );

  const value = useMemo(() => notify, [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-4 z-[60] sm:bottom-4 sm:top-auto flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            data-tone={t.tone}
            className={`pointer-events-auto flex w-full max-w-md animate-fade-up items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-medium shadow-card backdrop-blur-xl ${
              t.tone === "error"
                ? "border-red-400/40 bg-red-950/80 text-red-100"
                : "border-emerald-400/40 bg-emerald-950/80 text-emerald-100"
            }`}
          >
            <span className="min-w-0 flex-1 break-words">{t.text}</span>
            {t.action && (
              <button
                type="button"
                className="shrink-0 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold hover:bg-white/20"
                onClick={() => {
                  dismiss(t.id);
                  t.action?.onClick();
                }}
              >
                {t.action.label}
              </button>
            )}
            <button
              type="button"
              aria-label="Dismiss notification"
              className="shrink-0 rounded-full px-1.5 text-lg leading-none opacity-70 hover:opacity-100"
              onClick={() => dismiss(t.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

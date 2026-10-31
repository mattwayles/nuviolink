"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface Props {
  label: string;
  onClose: () => void;
  /** When given, desktop shows a popover next to this rect; mobile always shows a bottom sheet. */
  anchor?: DOMRect | null;
  children: React.ReactNode;
}

/** Modal dialog with focus trap, Esc to close, scroll lock and focus restore. */
/** Below this, an anchored popover is too cramped, so it centers instead. */
const MIN_ANCHORED_HEIGHT = 260;

export default function Overlay({ label, onClose, anchor, children }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const el = panel.current;
    (el?.querySelector<HTMLElement>(FOCUSABLE) ?? el)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !el) return;
      const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !el.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !el.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      previous?.focus?.();
    };
  }, []);

  const vw = typeof window === "undefined" ? 1024 : window.innerWidth;
  const vh = typeof window === "undefined" ? 768 : window.innerHeight;
  const mobile = vw < 640;
  const width = 340;
  const roomBelow = anchor ? vh - anchor.bottom - 16 : 0;
  const roomAbove = anchor ? anchor.top - 16 : 0;

  let cls: string;
  let style: React.CSSProperties = {};
  if (mobile) {
    cls = "fixed inset-x-0 bottom-0 max-h-[85vh] rounded-t-3xl pb-4";
  } else if (anchor && Math.max(roomBelow, roomAbove) >= MIN_ANCHORED_HEIGHT) {
    cls = "fixed rounded-2xl";
    style = { width, left: Math.max(8, Math.min(anchor.left, vw - width - 8)), maxHeight: Math.max(roomBelow, roomAbove) };
    if (roomBelow >= roomAbove) style.top = anchor.bottom + 8;
    else style.bottom = vh - anchor.top + 8;
  } else {
    cls = "fixed left-1/2 top-1/2 max-h-[85vh] w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl";
  }

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60" aria-hidden="true" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        style={style}
        className={`${cls} scroll-thin animate-fade-up overflow-y-auto border border-white/10 bg-ink-800/95 p-2 shadow-card backdrop-blur-xl`}
      >
        {children}
      </div>
    </div>
  );
}

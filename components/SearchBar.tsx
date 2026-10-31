"use client";

import { useEffect, useRef } from "react";

export default function SearchBar({
  value,
  onChange,
  placeholder,
  label,
  autoFocus = false,
  large = false,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label: string;
  autoFocus?: boolean;
  large?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Skipped on touch screens, where focusing can open the keyboard and shift the page.
    if (autoFocus && !window.matchMedia("(pointer: coarse)").matches) ref.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      ref.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="relative w-full">
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className={`pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-white/40 ${large ? "h-6 w-6" : "h-5 w-5"}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        ref={ref}
        type="search"
        role="searchbox"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={100}
        autoComplete="off"
        className={`glass w-full rounded-full text-white placeholder:text-white/40 focus:border-sky-400/60 focus:shadow-glow-soft focus:outline-none [&::-webkit-search-cancel-button]:hidden ${
          large ? "py-4 pl-14 pr-12 text-lg shadow-card" : "py-3 pl-12 pr-10 text-base"
        }`}
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            onChange("");
            ref.current?.focus();
          }}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full px-2 text-xl leading-none text-white/50 hover:text-white"
        >
          ×
        </button>
      )}
    </div>
  );
}

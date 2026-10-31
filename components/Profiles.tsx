"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { listProfiles } from "@/lib/nuvio/client";
import { NuvioError } from "@/lib/nuvio/session";
import type { Profile } from "@/lib/types";

interface ProfilesState {
  profiles: Profile[] | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

const Ctx = createContext<ProfilesState>({ profiles: null, loading: true, error: null, reload: () => {} });

export const useProfiles = () => useContext(Ctx);

export function ProfilesProvider({ children }: { children: React.ReactNode }) {
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listProfiles()
      .then((p) => !cancelled && setProfiles(p))
      .catch((e) => {
        // A dead session is handled by the auth gate (it will show the login form).
        if (cancelled || (e instanceof NuvioError && e.sessionExpired)) return;
        setError(e instanceof Error ? e.message : "Could not load profiles");
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const reload = useCallback(() => setAttempt((a) => a + 1), []);
  const value = useMemo(() => ({ profiles, loading, error, reload }), [profiles, loading, error, reload]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function ProfilesBanner() {
  const { error, loading, reload } = useProfiles();
  if (!error) return null;
  return (
    <div role="alert" className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 sm:px-6">
      <div className="flex w-full items-center gap-3 rounded-2xl border border-red-400/30 bg-red-950/60 px-4 py-3 text-sm text-red-200">
        <span className="flex-1">Could not load your profiles: {error}</span>
        <button type="button" onClick={reload} disabled={loading} className="btn-ghost shrink-0 py-1">
          Retry
        </button>
      </div>
    </div>
  );
}

export function ProfileDot({ profile, className = "" }: { profile: Profile; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-3 w-3 shrink-0 rounded-full ring-1 ring-white/30 ${className}`}
      style={{ backgroundColor: profile.avatarColorHex || "#64748b" }}
    />
  );
}

export function LockIcon() {
  return (
    <svg aria-label="PIN protected" role="img" viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-white/50" fill="currentColor">
      <path d="M17 9V7a5 5 0 0 0-10 0v2H5v12h14V9h-2Zm-8 0V7a3 3 0 0 1 6 0v2H9Z" />
    </svg>
  );
}

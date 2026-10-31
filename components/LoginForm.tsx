"use client";

import { useEffect, useState } from "react";
import { signIn } from "@/lib/nuvio/client";
import Wordmark from "./Wordmark";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Sign in | NuvioLink";
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
      setBusy(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <form
        onSubmit={submit}
        className="glass w-full max-w-sm animate-fade-up space-y-5 rounded-3xl p-6 shadow-card sm:p-8"
      >
        <div className="text-center">
          <Wordmark className="text-3xl text-glow" />
          <h1 className="mt-3 text-sm text-white/60">Sign in with your Nuvio account to manage your watchlists.</h1>
        </div>
        <label className="block text-sm">
          <span className="mb-1 block text-white/70">Email</span>
          <input
            type="email"
            name="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
            className="w-full rounded-xl border border-white/10 bg-ink-800 px-4 py-3 text-white placeholder:text-white/30 disabled:opacity-60"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-white/70">Password</span>
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
            className="w-full rounded-xl border border-white/10 bg-ink-800 px-4 py-3 text-white disabled:opacity-60"
          />
        </label>
        {error && (
          <p role="alert" className="rounded-xl border border-red-400/30 bg-red-950/60 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy} className="btn-glow w-full rounded-full px-5 py-3 font-semibold">
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}

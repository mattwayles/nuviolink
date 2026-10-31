"use client";

import { useEffect, useState } from "react";
import { onSessionChange, getSession } from "@/lib/nuvio/session";
import LoginForm from "./LoginForm";

type State = "loading" | "in" | "out";

/** Renders nothing until localStorage has been read (identical on server and first client render). */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    setState(getSession() ? "in" : "out");
    return onSessionChange((s) => setState(s ? "in" : "out"));
  }, []);

  if (state === "loading") return <div className="flex-1" aria-busy="true" />;
  if (state === "out") return <LoginForm />;
  return <>{children}</>;
}

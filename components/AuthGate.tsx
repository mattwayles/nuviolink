"use client";

import { useEffect, useRef, useState } from "react";
import { onSessionChange, getSession } from "@/lib/nuvio/session";
import LoginForm from "./LoginForm";

type State = "loading" | "in" | "out";

/** Renders nothing until localStorage has been read (identical on server and first client render). */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>("loading");
  const showedLogin = useRef(false);

  useEffect(() => {
    setState(getSession() ? "in" : "out");
    return onSessionChange((s) => setState(s ? "in" : "out"));
  }, []);

  // Sign-in swaps a short form for a long page, so start it at the top, including once a closing keyboard settles.
  useEffect(() => {
    if (state === "out") showedLogin.current = true;
    if (state !== "in" || !showedLogin.current) return;
    showedLogin.current = false;
    const toTop = () => window.scrollTo(0, 0);
    toTop();
    window.visualViewport?.addEventListener("resize", toTop);
    const stop = setTimeout(() => window.visualViewport?.removeEventListener("resize", toTop), 1000);
    return () => {
      clearTimeout(stop);
      window.visualViewport?.removeEventListener("resize", toTop);
    };
  }, [state]);

  if (state === "loading") return <div className="flex-1" aria-busy="true" />;
  if (state === "out") return <LoginForm />;
  return <>{children}</>;
}

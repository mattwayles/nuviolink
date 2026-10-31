import { NextResponse } from "next/server";
import { TmdbError } from "./server";

export function cached(body: unknown, sMaxAge: number): NextResponse {
  return NextResponse.json(body, {
    headers: { "Cache-Control": `public, s-maxage=${sMaxAge}, stale-while-revalidate=86400` },
  });
}

export function fail(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

/** Generic upstream failure: never leaks the key, the upstream URL or upstream bodies. */
export function upstreamFail(e: unknown): NextResponse {
  if (e instanceof TmdbError && e.status === 500) return fail("Service unavailable", 500);
  return fail("Upstream error", 502);
}

export function parsePage(raw: string | null): number | null {
  if (raw === null) return 1;
  if (!/^\d{1,3}$/.test(raw)) return null;
  const n = Number(raw);
  return n >= 1 && n <= 500 ? n : null;
}

import { cached, fail, parsePage, upstreamFail } from "@/lib/tmdb/route-utils";
import { search } from "@/lib/tmdb/server";

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const q = (sp.get("q") ?? "").trim();
  if (!q) return fail("Missing query", 400);
  if (q.length > 100) return fail("Query too long", 400);
  const page = parsePage(sp.get("page"));
  if (page === null) return fail("Invalid page", 400);
  try {
    return cached(await search(q, page), 600);
  } catch (e) {
    return upstreamFail(e);
  }
}

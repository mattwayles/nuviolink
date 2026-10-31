import { cached, fail, parsePage, upstreamFail } from "@/lib/tmdb/route-utils";
import { popular } from "@/lib/tmdb/server";

export async function GET(req: Request) {
  const page = parsePage(new URL(req.url).searchParams.get("page"));
  if (page === null) return fail("Invalid page", 400);
  try {
    return cached(await popular(page), 3600);
  } catch (e) {
    return upstreamFail(e);
  }
}

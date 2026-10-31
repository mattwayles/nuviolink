import { cached, fail, upstreamFail } from "@/lib/tmdb/route-utils";
import { lookup, type LookupQuery } from "@/lib/tmdb/server";

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const rawType = sp.get("type");
  if (rawType !== null && rawType !== "movie" && rawType !== "tv") return fail("Invalid type", 400);
  const type = rawType ?? undefined;
  const id = sp.get("id");
  const imdb = sp.get("imdb");

  let query: LookupQuery;
  if (id !== null && imdb === null) {
    if (!type) return fail("Missing type", 400);
    if (!/^\d{1,10}$/.test(id)) return fail("Invalid id", 400);
    query = { type, id: Number(id) };
  } else if (imdb !== null && id === null) {
    if (!/^tt\d{1,10}$/.test(imdb)) return fail("Invalid imdb id", 400);
    query = { type, imdb };
  } else {
    return fail("Provide either id or imdb", 400);
  }

  try {
    const title = await lookup(query);
    if (!title) return fail("Not found", 404);
    return cached(title, 86400);
  } catch (e) {
    return upstreamFail(e);
  }
}

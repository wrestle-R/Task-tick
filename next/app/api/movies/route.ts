import { allowRequest } from "../../../lib/limits";
import { authenticated } from "../../../lib/server";
export async function OPTIONS() {
  return new Response(null, { status: 204 });
}
export async function GET(request: Request) {
  try {
    const { user } = await authenticated(request);
    if (!allowRequest(`movies:${user.id}`, 30)) return Response.json({ error: "Too many searches. Try again shortly." }, { status: 429, headers: { "Retry-After": "60" } });
    const q = new URL(request.url).searchParams.get("q")?.trim();
    if (!q || q.length > 200)
      return Response.json(
        { error: "Enter a title (up to 200 characters)" },
        { status: 400 },
      );
    const key = process.env.TMDB_READ_ACCESS_TOKEN;
    if (!key)
      return Response.json(
        {
          error:
            "Movie search is not configured yet. You can still add a title manually.",
        },
        { status: 503 },
      );
    const result = await fetch(
      `https://api.themoviedb.org/3/search/multi?query=${encodeURIComponent(q)}&include_adult=false`,
      {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!result.ok) throw new Error("Movie search is temporarily unavailable");
    const data = await result.json();
    return Response.json({
      results: data.results.filter(
        (r: { media_type: string }) =>
          r.media_type === "movie" || r.media_type === "tv",
      ),
    });
  } catch (e) {
    return Response.json(
      { error: (e as Error).message },
      { status: /sign in|session/i.test((e as Error).message) ? 401 : 502 },
    );
  }
}

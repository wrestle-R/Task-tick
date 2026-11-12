import { latestRelease, trustedAsset } from "../../../../../../lib/releases";
export async function GET(
  _request: Request,
  {
    params,
  }: { params: Promise<{ target: string; arch: string; version: string }> },
) {
  const { target, arch } = await params;
  if (target !== "linux" || arch !== "x86_64")
    return new Response(null, { status: 204 });
  try {
    const release = await latestRelease();
    const asset = release?.assets.find((a) => a.name === "latest.json");
    if (!asset || !trustedAsset(asset.browser_download_url))
      return new Response(null, { status: 204 });
    const r = await fetch(asset.browser_download_url, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error("Manifest unavailable");
    const manifest = await r.json();
    const platform = manifest.platforms?.[`${target}-${arch}`];
    if (
      !platform ||
      !trustedAsset(platform.url) ||
      typeof platform.signature !== "string"
    )
      return new Response(null, { status: 204 });
    return Response.json(manifest);
  } catch {
    return Response.json(
      { error: "Update service unavailable" },
      { status: 502 },
    );
  }
}

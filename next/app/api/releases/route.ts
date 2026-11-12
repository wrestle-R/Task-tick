import { latestRelease, trustedAsset } from "../../../lib/releases";
export async function GET() {
  try {
    const release = await latestRelease();
    if (!release) return Response.json({ release: null });
    const apk = release.assets.find((a) => a.name === "Task-tick-android.apk");
    const sums = release.assets.find((a) => a.name === "SHA256SUMS");
    let sha256: string | null = null;
    if (sums && trustedAsset(sums.browser_download_url)) {
      const r = await fetch(sums.browser_download_url, {
        next: { revalidate: 300 },
        signal: AbortSignal.timeout(10000),
      });
      if (r.ok) {
        const line = (await r.text())
          .split("\n")
          .find((l) => /\s+\*?Task-tick-android\.apk$/.test(l));
        sha256 = line?.match(/^[a-f0-9]{64}/)?.[0] ?? null;
      }
    }
    return Response.json(
      {
        release: {
          version: release.tag_name.replace(/^v/, ""),
          url: release.html_url,
          android:
            apk && trustedAsset(apk.browser_download_url)
              ? { url: apk.browser_download_url, sha256, size: apk.size }
              : null,
        },
      },
      { headers: { "Cache-Control": "public, s-maxage=300" } },
    );
  } catch {
    return Response.json(
      { error: "Could not check for updates. Try again later." },
      { status: 502 },
    );
  }
}

export type ReleaseAsset = {
  name: string;
  browser_download_url: string;
  size: number;
};
export type Release = {
  tag_name: string;
  html_url: string;
  assets: ReleaseAsset[];
  draft: boolean;
  prerelease: boolean;
};
const origin =
  "https://api.github.com/repos/wrestle-R/Task-tick/releases/latest";
export async function latestRelease(): Promise<Release | null> {
  const r = await fetch(origin, {
    next: { revalidate: 300 },
    headers: { Accept: "application/vnd.github+json" },
    signal: AbortSignal.timeout(10000),
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error("Release service is temporarily unavailable");
  const value: Release = await r.json();
  return value.draft || value.prerelease ? null : value;
}
export function trustedAsset(url: string) {
  try {
    const u = new URL(url);
    return (
      u.origin === "https://github.com" &&
      u.pathname.startsWith("/wrestle-R/Task-tick/releases/download/")
    );
  } catch {
    return false;
  }
}

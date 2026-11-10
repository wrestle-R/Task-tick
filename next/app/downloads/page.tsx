import Link from "next/link";
type Release = {
  tag_name: string;
  html_url: string;
  assets: { name: string; browser_download_url: string; size: number }[];
};
export const metadata = { title: "Downloads" };
export default async function Downloads() {
  let release: Release | null = null;
  try {
    const r = await fetch(
      "https://api.github.com/repos/wrestle-R/Task-tick/releases/latest",
      {
        next: { revalidate: 300 },
        headers: { Accept: "application/vnd.github+json" },
      },
    );
    if (r.ok) release = await r.json();
  } catch {}
  return (
    <main className="document-page">
      <Link href="/">← Tick and Done</Link>
      <h1>
        Your list.
        <br />A little closer.
      </h1>
      <p>
        Android app and home-screen widgets. Linux desktop and Hyprland
        integration. Or just <Link href="/app">open the web app</Link>.
      </p>
      {release ? (
        <>
          <h2>Release {release.tag_name}</h2>
          {release.assets.map((a) => (
            <a
              className="release-file"
              href={a.browser_download_url}
              key={a.name}
            >
              <span>{a.name}</span>
              <span>{(a.size / 1048576).toFixed(1)} MB ↗</span>
            </a>
          ))}
          <p>
            <a href={release.html_url}>Release notes and checksums</a>
          </p>
        </>
      ) : (
        <>
          <h2>Downloads are being prepared.</h2>
          <p>
            No published release is available yet. We’ll list the APK and Linux
            packages here when builds have passed their release checks.
          </p>
          <p>
            <a href="https://github.com/wrestle-R/Task-tick/releases">
              Check GitHub Releases ↗
            </a>
          </p>
        </>
      )}
      <h2>Before installing</h2>
      <p>
        Use the checksum included with the release. Android may ask you to allow
        installation from your browser or file manager. Hyprland integration is
        optional and backs up existing configuration before changing it.
      </p>
    </main>
  );
}

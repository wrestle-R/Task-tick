import { MarketingSite } from "../site-navigation";

const latest = "https://github.com/wrestle-R/Task-tick/releases/latest/download";

export const metadata = { title: "Downloads" };

export default function Downloads() {
  return (
    <MarketingSite>
      <main className="document-page">
        <h1>Download Task-tick</h1>
        <a className="download-apk" href={`${latest}/Task-tick-android.apk`}>
          Download APK
        </a>
        <h2>Install on Linux</h2>
        <pre className="linux-install-command">
          <code>{`curl -fsSL ${latest}/install-app.sh | bash`}</code>
        </pre>
      </main>
    </MarketingSite>
  );
}

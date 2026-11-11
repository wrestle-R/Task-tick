import Link from "next/link";
import { MarketingSite } from "../site-navigation";
export const metadata = { title: "The details" };
export default function Docs() {
  return (
    <MarketingSite><main className="document-page">
      <h1>A little guide.</h1>
      <p>
        One todo list. One watchlist. Your own space on Android, Linux, and the
        web.
      </p>
      <h2>Getting started</h2>
      <p>
        Open <Link href="/app">your space</Link>, create an email/password
        account, and verify your email. Each account has its own private data.
        First sign-in needs internet; an existing session and saved lists
        continue working offline.
      </p>
      <h2>Your home-screen widgets</h2>
      <p>
        Choose the Todos or Movies widget from your Android launcher. Tap a
        title to open its details, the checkbox to finish it, and + to add
        something through a compact screen. Undo the latest completion for ten
        seconds. Finished items remain in Completed or Watched.
      </p>
      <h2>Offline is normal</h2>
      <p>
        Edits save locally before uploading. Pending changes survive normal
        restarts and sync after reconnecting. Different fields merge; if two
        devices change the same field, the last edit accepted by the server
        wins. Recover earlier edits for seven days. Deleted entries stay deleted
        until you restore them.
      </p>
      <h2>Reminders</h2>
      <p>
        Phone reminders are the default. Desktop reminders are opt-in. Website
        reminders run only while the website is open. Denied precise-alarm
        access may delay Android reminders. Explicitly force-stopping the
        Android app can interrupt widgets and reminders until you open it again.
      </p>
      <h2>Your watchlist</h2>
      <p>
        Add films or TV titles manually, or search TMDB when connected. Mark
        watched and optionally rate them from one to five stars, including
        half-stars. No episode tracking. Movie metadata uses TMDB; this product
        is not endorsed or certified by TMDB.
      </p>
      <h2>Linux & Hyprland</h2>
      <p>
        The desktop app has a tray menu and background operation. Its Hyprland
        integration adds Todos/Movies to the existing sidebar. Super+A starts on
        Todos; Super+Space controls Spotify playback. See the repository setup
        instructions before installing integration files.
      </p>
      <h2>Downloads & support</h2>
      <p>
        <Link href="/downloads">Find tested release downloads</Link>, or{" "}
        <a href="https://github.com/wrestle-R/Task-tick/issues">
          report an issue
        </a>
        . Only attach diagnostic information you are comfortable sharing
        publicly. Never include passwords or personal task contents.
      </p>
    </main></MarketingSite>
  );
}

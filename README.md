# Task-tick

Todos, a watchlist, and two home-screen widgets. A little less to keep in your head.

Bare React Native on Android, Tauri on Linux, and Next.js on the web. Each account has one todo list and one movie/TV watchlist. Changes save locally first and sync when connected.

## Workspace

| Directory | Purpose |
| --- | --- |
| `app/` | Bare React Native app, Kotlin SQLite bridge, native widgets and reminders |
| `next/` | Website, web app, authenticated API, TMDB proxy |
| `desktop/` | Packaged Linux app, SQLite store, tray, optional Hyprland integration |
| `packages/` | Shared domain protocol, web/desktop UI and browser storage |
| `supabase/` | Reviewed database migrations and RLS |
| `docs/` | Architecture, setup, verification and progress |

## Development

Use Node 24, Java 21 and Rust stable. Android needs SDK platform 37.0, Build Tools 37.0.0 and NDK 27.1.12297006. `app/` has its own dependency lockfile; the other JavaScript packages use the root workspace.

```sh
npm ci
npm ci --prefix app
cp next/.env.example next/.env.local
# Fill in your project's publishable Supabase key and server-only TMDB credentials.
npm run dev
```

```sh
npm test
npm run typecheck
npm run build
npm run desktop
```

For Android, set `ANDROID_HOME` and `JAVA_HOME`, then:

```sh
cd app
npm start
# In another terminal:
npm run android
```

Configure email verification/reset redirect URLs in your Supabase project to include the website's `/app` route. Never disable verification to work around missing email configuration. Apply migrations only after verifying the intended Supabase project and inspecting its existing schema.

## Offline behaviour

Each client has a durable local store and outbox. Retried mutations are idempotent. Different fields merge; competing changes to the same field use server acceptance order. Deletion wins over stale edits. Trash and edit recovery last seven days; deletion identities stay longer to prevent old devices resurrecting items.

The website needs an initial online load before offline reloads work. Browser storage can still be cleared by the user or evicted by the browser. Website reminders work only while the site is open; Android and the desktop background process handle native reminders.

## Downloads

[GitHub Releases](https://github.com/wrestle-R/Task-tick/releases) contains published builds when available. No release means downloads have not yet passed the release gate. Check `SHA256SUMS` before installing.

Version tags run the tested build pipeline. Android release publishing requires a stable signing key configured in GitHub Actions secrets; the workflow stops if it is missing. Debug builds are development artifacts, not production-signed releases.

See [setup](docs/setup.md), [architecture](docs/architecture.md), [verification](docs/verification.md), and [progress](docs/progress/README.md).

Movie metadata uses TMDB. This product is not endorsed or certified by TMDB.

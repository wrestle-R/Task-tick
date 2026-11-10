# Architecture

Tick and Done has one general todo list and one Movies list per account. Movies includes film and TV titles without episode tracking. Users sign up with verified email/password accounts.

## Client boundaries

- Android: React Native screens call a Kotlin repository. The app and both native collection widgets share SQLite and the durable mutation queue. Widget add opens a compact native Activity. Jobs handle sync, local alarms handle offline reminders, and Android Keystore protects stored session credentials.
- Linux: bundled React screens run inside Tauri, backed by SQLite. A user-private Unix socket connects the Quickshell sidebar to the same store. Closing the window keeps the tray/background process; Quit is explicit. Desktop reminders are opt-in.
- Web: Next.js serves the website and workspace; IndexedDB stores account data and outbox. A service worker caches the app shell. Only open-site browser reminders are supported.
- Backend: Next.js validates authenticated requests, then calls user-scoped Supabase sync RPC. TMDB requests use server-only credentials.

## Data and sync

The public primary tables are `code-todo` and `movies-todo`. The private schema contains replay receipts and recovery history. RLS restricts primary-table reads by authenticated owner. Clients cannot write directly: the private sync implementation validates ownership, field patches and operation identifiers. The exposed wrapper is security-invoker; its narrowly scoped non-exposed implementation checks auth.uid() before every operation.

Changes save locally before rendering success. A transaction also saves the outgoing mutation. Server acceptance, not a device clock, orders conflicts. Different-field patches preserve unrelated fields. Deletion wins over stale edits and explicit restore is required. Old content is recoverable for seven days; tombstone identity prevents resurrection by devices offline longer than that.

Parent completion completes its subtasks. Widget Undo restores the latest completion for ten seconds. Prior completed/watched items remain available in their app views. Seven-day history is independent of completed-item storage.

## Integration

Super+A opens the sidebar on Todos each time. Super+Space serializes Spotify quiet startup and toggles playback. The helper uses the installed player's local socket and stores last track/position without account keys. Provider queue restoration across a full engine restart requires separate verification; do not label last-track recovery as full queue recovery.

The optional Hyprland installer backs up existing files. Existing local sidebar todos remain available until the account-backed desktop store is ready. Installation must not reset unrelated bar or startup configuration.

## Delivery

The public GitHub repository is the sole website code deployment source for Vercel. Vercel builds the `next/` app with access to workspace packages. Native release builds are tag-triggered and must pass signing and verification gates before publication. Environment values are supplied separately; real local env files remain ignored and are synced through Varte.

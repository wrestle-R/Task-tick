# Sidebar integration contract

Use the [copy-paste prompt below](#sidebar-implementation-prompt) alongside the [sidebar screenshot](images/sidebar.png). The source contract takes precedence over this explanation when adding protocol versions. Never point a third-party panel directly at the primary database tables.

## Visual and lifecycle requirements

The screenshot uses fixture data. Adapt the panel to the host's actual theme rather than copying machine-specific colors. Preserve other sidebar sections. Todos/Movies is a two-way mode selector, not separate sidebars. Always open on Todos. Unfinished top-level rows sort by numeric `position`, then UUID byte order; newly created rows append. Explicit app drag-reordering remains respected. Recent completed rows follow, sorted by `updatedAt` descending. Show only those that fit the spare space. Overflow is a view decision, never a deletion. Full Completed/Watched data remains in the app.

The add field stays compact. Typing at least two movie characters debounces server search for 350ms; ignore stale responses if the text, mode or active account changed. Enter/+ can add a manual title while offline. TMDB results carry media type, numeric ID and poster path. Posters belong in roomy clients, not this panel or Android widgets.

## Linux native adapter

Run the installed desktop app in the background first, then sign in through its window. Its local store is authoritative. The download installer provides `~/.local/bin/task-tick`; the optional Hyprland installer provides the compatibility launcher `~/.local/bin/tick-and-done`. Detect the installed launcher. Use its `--ipc` argument with JSON passed as one argument (use argument arrays, not shell interpolation). It connects to `$XDG_RUNTIME_DIR/tick-and-done.sock`. Socket mode is 0600. The socket speaks one newline-delimited JSON request and one JSON response. It is local, not an HTTP endpoint.

```json
{"action":"state"}
```

Read `items`, `outbox` and `_account`. Never cache a mutable UI across an account change. Subsequent requests bind to that account:

```json
{"action":"add","kind":"todo","title":"Buy coffee","expectedAccount":"ACCOUNT_UUID"}
{"action":"toggle","kind":"todo","id":"ITEM_UUID","expectedAccount":"ACCOUNT_UUID"}
{"action":"search","query":"Arrival","expectedAccount":"ACCOUNT_UUID"}
{"action":"add","kind":"movie","title":"Arrival","tmdbId":329865,"mediaType":"movie","poster":"/poster-path.jpg","expectedAccount":"ACCOUNT_UUID"}
```

The add/toggle response is the new account-bound state. Search returns `{results:[...],_account:"..."}`; a duplicate movie returns `{existingId:"...",_account:"..."}`. Errors are `{error:"..."}`. Show them without claiming a save succeeded. The desktop keeps the user search token only in native memory and proxies requests; the sidebar never receives it. First sign-in/refresh and TMDB search require connectivity, while local add/toggle remain offline-capable. Poll state while visible, stop polling while hidden, and never overlap writes.

The existing Linux implementation is `desktop/hyprland/TickDashboard.qml`. The reversible installer is `desktop/hyprland/install.py`. It targets the existing illogical-impulse configuration, not arbitrary desktops. Read and review it before using it on a different setup.

## Cross-platform HTTP adapter

Base URL: `https://task-tick-beige.vercel.app`.

1. `GET /api/config` returns `{url,key}`: the Supabase origin and publishable client key. These are not administrator credentials.
2. Authenticate using the Supabase client `signInWithPassword({email,password})`, with normal refresh-token persistence protected by your platform's secret store. Public signup requires email verification. Do not put credentials in a panel config or command line.
3. `POST /api/sync` with `Authorization: Bearer <user access token>` and JSON. Use the shared core's `collectSyncPages` and `reconcile`, not an independent competing implementation.

Initial protocol-v2 request:

```json
{"protocol":2,"cursor":0,"mutations":[]}
```

Example queued change:

```json
{
  "protocol":2,
  "cursor":42,
  "mutations":[{
    "id":"NEW_STABLE_MUTATION_UUID",
    "itemId":"STABLE_ITEM_UUID",
    "kind":"todo",
    "action":"patch",
    "patch":{"title":"Buy coffee","done":false}
  }]
}
```

Replace the symbolic UUID strings with real UUIDs. Each batch has at most 100 mutations. Keep the same mutation ID after timeout/lost response. Create, patch, delete and restore all go through this queue; never reuse a mutation ID for different content. `action` is `patch`, `delete` or `restore`; deletion/restore use an empty patch unless explicitly restoring selected fields.

The v2 collector owns `pullUntil`, `historyAfter`, `historyUntil`, page cursors and acknowledgement accumulation. See its source and `docs/tests/paged-sync.mjs`. Commit page progress safely; never advance a cursor past unapplied rows. Retain confirmed server items separately and replay unacknowledged local mutations over them. `401` means refresh/re-authenticate; keep unsynced work. `429` means respect Retry-After. Other failures leave the outbox intact.

4. `GET /api/movies?q=Arrival`, with the same Bearer header, returns `{results:[...]}`. Results include `id`, `media_type`, `title`/`name` and optional `poster_path`; keep movie/TV results only. Match duplicates on `(media_type,id)`. The server owns TMDB credentials. Do not ask users for a TMDB token.

No browser or panel needs the Supabase database password, management token or service-role key. Never copy this repository owner's local environment file.

## Data safety and acceptance

A local edit and its outgoing mutation must commit atomically. A crash before commit changes neither; after commit both survive. Different fields merge; same-field conflicts use server acceptance order. Deletion wins over stale edits. Seven-day recovery/trash is independent of sync tombstone retention. Parent completion completes children atomically. Sign-out hides data and retains pending work for that same account unless explicitly discarded.

Test two accounts, network loss, restart, timeout replay, stale-account clicks and a long list. Use fixtures in public screenshots. Scope music keys to the empty input; typing a task with spaces must continue working. Do not claim reboot/music queue recovery or native macOS/Windows panel support without testing those platforms.

## Sidebar implementation prompt

```text
Build a Task-tick sidebar for my existing operating system and desktop setup.
Repository: https://github.com/wrestle-R/Task-tick
Backend: https://task-tick-beige.vercel.app
Reference screenshot: https://raw.githubusercontent.com/wrestle-R/Task-tick/main/docs/images/sidebar.png
Read docs/sidebar-integration.md, docs/architecture.md, packages/core/src/index.ts
and desktop/hyprland/TickDashboard.qml from that repository before coding.

First inspect my OS, desktop shell, panel framework, theme, existing shortcuts and
startup files. Preserve my existing panels and apps. Back up affected files and
make installation reversible. If my OS is not Linux, do not run Linux/Hyprland
commands: select a native panel mechanism for my OS and explain its limitations.

Visual layout, from top to bottom:
- Keep existing unrelated status/music panels in place.
- A small Task-tick header with unfinished count.
- Two compact theme-colored segments, Todos and Movies. Default to Todos every
  time the sidebar opens. No separate Completed tab.
- One compact add input with a small + button. Movies suggests film/TV titles
  from TMDB after 350ms and two typed characters; manual entry remains available.
- Compact unfinished rows ordered by position ascending, UUID as tie-breaker.
  New entries append at the bottom unless the user explicitly reorders them.
- Completed rows below unfinished rows, newest completions first. Only show as
  many as fit in spare panel space. Hide older completed rows from the panel;
  never delete, trash, or mutate those rows just to make the panel fit.
- Subtle saved/pending/error status. Match my panel's typography, roundness,
  colors and spacing. No stock black text fields or rectangular Qt buttons.
- No poster images in this small sidebar. Use posters in roomy app views only.

On Linux with Task-tick running, prefer its local store. The CLI reads/writes
one JSON request via: task-tick --ipc '<JSON>' (the optional Hyprland installer
uses the compatibility name tick-and-done). Detect which launcher is installed.
Read state with
{"action":"state"}; it returns items, outbox and _account. Every subsequent
write/search MUST include expectedAccount equal to that returned _account.
Add: {"action":"add","kind":"todo","title":"Buy coffee","expectedAccount":"UUID"}.
Toggle: {"action":"toggle","kind":"todo","id":"ITEM_UUID","expectedAccount":"UUID"}.
Search: {"action":"search","query":"Arrival","expectedAccount":"UUID"}.
For a selected movie result, add kind movie with title, tmdbId, mediaType
(movie or tv), and poster path. Duplicate TMDB entries return existingId.
Never read or write the SQLite file directly. Never expose session tokens in
commands, logs or screenshots. The local CLI does not return credentials.

For other platforms without the native store, implement an account-isolated
local store/outbox using the shared core protocol. GET /api/config returns the
publishable Supabase URL/key. Use Supabase email/password authentication and
refresh sessions normally. POST /api/sync uses Authorization: Bearer USER_TOKEN
and Content-Type: application/json. Reuse collectSyncPages/reconcile from the
core; do not hand-roll pagination or generate new mutation IDs on retries.
GET /api/movies?q=TITLE uses the same user Bearer token. No TMDB secret belongs
in the sidebar. Read the full contract for complete protocol examples.

Persist edits and outbox in one local transaction before showing success.
Isolate accounts; a pending request from A must never write into B. Preserve
unsynced edits for the same account on logout. Respect deletion-wins, field
merges, server acceptance ordering and seven-day Trash/recovery. Never hardcode
my login or request privileged database/service-role keys.

Bind Space to my existing Spotify toggle ONLY when the capture field is empty;
otherwise type an ordinary space. Scope this to the sidebar, never globally
intercept Space. Keep my existing global music shortcut intact. If my player
cannot restore its queue, report that limitation without inventing a queue.

Verify: offline add survives restart; reconnect creates one server item;
completion moves down; overflow hides old completed rows without deleting;
Movies autocomplete and manual add both work; duplicate TMDB entries reuse;
account switching clears old content; stale actions fail; empty-input Space
controls music, text-input Space types; install/uninstall preserves my setup.
Show me screenshots with sample data and report checks and remaining limits.
```

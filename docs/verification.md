# Verification

Checks distinguish source implementation, build success, integration evidence, and published release readiness.

## Confirmed during initial implementation

- Shared protocol tests: replay-safe acknowledgement preserves edits made during upload; stale edits cannot resurrect deleted items; parent completion; validation rejects unsupported fields/ratings.
- Supabase rollback tests before schema application: replay idempotency, different-field merge, deletion wins/stale-edit recovery, and cross-account RLS isolation.
- Real temporary account: password authentication → authenticated Next.js endpoint → database persistence → response, repeated mutation, anonymous request rejection, and live TMDB search. Test account/data removed afterward.
- Workspace typecheck, Next.js production build, Vite production build, Tauri cargo check and Linux debug binary build.

## Acceptance gates

- Android: APK compile/install, native module startup, local writes after process eviction, two launcher widgets and every tap destination, compact add, ten-second Undo, resize/theme settings, account switch isolation, and offline/reconnect flows.
- Desktop: packaged offline launch, menu/tray, explicit Quit, background reminders, one autostart process, sidebar default Todos, edits through IPC without lost updates, and existing todo fallback.
- Spotify: UI absent but engine alive; engine absent; last-track recovery; rapid repeated shortcuts; unavailable network/login/no prior track. Full provider queue restoration is a separate gate.
- Sync: same-field conflict history, field merges, stale device deletion, account isolation, mutation batching, response loss and recovery beyond seven days.
- Notifications: permission denial, exact-alarm fallback, reboot rescheduling, sleep/resume summary and cancellation of locally known completed/deleted tasks. Force Stop is distinct from normal process eviction.
- Release: stable APK signing and update-over-install, tested Linux artifacts, checksums and truthful download listings. Never publish a debug-key-signed APK as a production release.

Screenshots and test credentials containing private account information are not repository artifacts.

## Repeatable integration checks

Use Node 24. Run `npm test`, `npm run typecheck`, `npm run build`, and `cargo test --locked --manifest-path desktop/src-tauri/Cargo.toml`.

With an authorized database environment file, set `TICK_TEST_DATABASE_ENV_FILE` and run `node docs/tests/protocol.mjs`. It rolls back all temporary data and checks replay safety, merges, conflict history, deletion recovery, restore and account isolation.

For the browser suite, start the production Next server on port 3001 and run `node docs/tests/browser.mjs` with the same environment-file path. It uses a temporary verification account and removes it afterward. Override `TICK_TEST_BASE_URL` or `TICK_CHROMIUM_PATH` when needed.

2026-11-10: browser suite passed, including offline reload and phone-width layout; latest Android debug APK compiled; both Rust sidebar tests passed. Real device and release acceptance remain open.

# Interface milestones, 2026-11-12

Web and desktop now use a top bar with Todos, Watchlist and a combined Trash. Completed rows stay below unfinished rows and collapse as a group. Movie entry provides debounced TMDB suggestions with cancellation/account guards and optional posters. The website uses copied Skeuomorphism UI button/theme/switch/surface components with local native CSS.

Verified: production Next/Vite builds, workspace typechecks, real browser sign-in/offline reload/reconnect/Undo, combined cross-list Trash and completed grouping. Marketing checks at 1366/1024/390/320 pass theme persistence, menu Escape/focus, first-view action and overflow/runtime checks.

# Implementation progress

### Current interface and update evidence, 2026-11-11

Task-tick branding, the approved folded-mark website hero, compact widget creation/editing and persistent Android System/Light/Dark controls are implemented. Marketing acceptance passes at 1366, 1024, 390 and 320 pixels, including first-viewport heading/action, decoded artwork, no horizontal overflow, theme persistence, menu keyboard focus and documentation/download navigation. Source artwork and its prompt are recorded in `docs/design/hero-direction.md`.

On the isolated Android16 emulator, the production-signed versionCode3 APK updated the existing signed installation with its configured widget and offline task intact. Light persisted after reopening; Dark and the compact editor also worked. Signing out with a pending mutation cleared widget account content. Account A then showed its own tasks without B's pending task. Returning to B restored and synchronized exactly one copy with its original notes; a server query confirmed no copy in A. Native resume now registers sync jobs and reschedules reminders even while offline. These observations cover this update/account-transition slice, not the entire lifecycle matrix.

Twelve core tests, shared theme generation checks, workspace/app typechecks, production web/desktop builds, four Rust tests, eight installer tests, three Spotify-helper tests and Android debug/release builds pass. Branded deb/AppImage packages build locally. The user chose continued emulator testing; physical-phone acceptance, installed desktop/Spotify cold recovery, reminder/reboot matrices and verified published releases remain open.

Delivery evidence for `f9360e9`: GitHub run43065393190 passed web, Rust and Android jobs. The linked Vercel deployment succeeded; the production marketing suite passed the same four-width hero/navigation/theme checks.

Reminder observations on the isolated Android16 emulator: a future reminder displayed its correct Task-tick title in the OS notification shade at22:40 while airplane mode was on, Wi-Fi/mobile data were off and the app was in the background. A second deadline at22:52 passed during a subsequent cold boot. A changed guest boot ID confirmed a real Android restart; without opening the main app, the launcher and notification shade showed retained widget content and the newly delivered overdue reminder offline. This establishes scheduled offline delivery and overdue recovery after cold boot. It does not establish a future deadline reached after boot, the full permission/cancellation matrix or physical-device behaviour. An earlier AVD shutdown/reopen used Quick Boot and is deliberately excluded from cold-boot evidence.

- [x] Approved product scope and client architecture
- [x] Shared offline mutation protocol and focused behaviour tests
- [x] Supabase schema applied after rollback/isolation checks
- [x] Next.js app/API and marketing/docs/download pages build
- [x] Live auth → API → database and TMDB verification
- [x] Tauri/SQLite desktop source and development binary
- [x] Native Android storage/widgets/reminder source
- [x] GitHub-linked Vercel project/environment configuration
- [x] Android debug APK compile (latest source)
- [ ] Device installation and real widget/reminder acceptance
- [x] Browser sign-in, offline add/reload, reconnect, Undo, manual movies and mobile layout integration test
- [x] Rust sidebar parent/child atomic completion and account isolation tests
- [ ] Desktop notification/IPC/integration runtime acceptance
- [ ] Spotify warm/cold recovery acceptance
- [x] GitHub-triggered Vercel deployment and deployed offline-browser suite
- [x] Production-signed Android APK (apksigner verified), Linux deb/AppImage builds and local SHA256 checksums
- [ ] Native installation/update/widget/reminder acceptance and published release

Source implementation alone does not close a runtime or release gate. Keep remaining failures and external configuration requirements explicit.

## Current release gates

CI now checks Node 24 web/core builds, bare Android compile, and Rust tests. Tags prepare a draft with signed APK/Linux artifacts and checksums; publication follows device/install acceptance. Android release packaging requires an explicit production signing identity and cannot fall back to the debug key. A stable private signing identity has been generated outside the repository and configured in GitHub’s native-release environment. Signed build and update acceptance are still required.

Android device discovery now works, and a dedicated Android16 emulator supports launcher/widget acceptance. Installed Hyprland integration exists; actual tray, sidebar, autostart and notification behaviour still needs acceptance. Spotify helper startup exposed a file-writing bug, now fixed; warm playback was confirmed, while full queue and reboot recovery remain open.

2026-11-10 verification update: database protocol integration suite passed and rolled back its data. Latest Linux deb/AppImage packages built successfully; packaged binary started and its IPC correctly requires sign-in. Latest Android debug APK installed successfully on the connected phone. The earlier Device panel discovery block was subsequently resolved; see the Android widget evidence below. GitHub main implementation commit is pushed and triggered Vercel production deployment and CI.

CI run 42865969433 passed web, Rust and Android checks for commit 49f28fc. Emulator provisioning is being repaired to enable isolated native acceptance.

## Six-phase completion run (2026-11-11)

Implementation resumed against the six-phase completion plan. New source fixes guard web/native outgoing sync against account transitions, clear account-owned Android notifications on signout/sign-in, check overdue reminders during native refresh, and reverse known integration config changes without replacing unrelated later edits. Three installer regression tests cover preserved edits and conflict refusal. Generated artifact cleanup and reviewed legacy adoption are now covered by the subsequent installer lifecycle batch.

These changes do not close account/mailbox, widget, reminder-delivery, desktop or release acceptance gates. No new native release is published.

Real email verification acceptance (2026-11-11): the designated account received its verification email, the user reported the link opened Task-tick, and a read-only database check confirmed verified state. Password-reset delivery/form acceptance is still pending; the reset request was accepted without changing the account password.

Completion batch (2026-11-11): confirmed server-state storage and stale-acknowledgement regressions pass for web/desktop; generated integration artifacts now have conflict-aware install/reinstall/uninstall coverage; the helper restores engine-owned playback queues/options using an additive Spotify-Tui engine contract (owning source commit e2c0449, 13 Rust tests passing). Six core, five installer and three helper tests pass; desktop Rust tests pass. These are implementation results, not evidence of physical widget delivery, real reboot recovery, external-provider queue access or a verified public release. Legacy integration adoption and bounded pull/history pagination are implemented in the subsequent batches.

Paged sync v2 (2026-11-11): additive migration applied after rollback testing. Up to250 item/history entries per page, independent revision cursors/snapshot bounds,100-mutation batches, progress checks and completed-batch checkpoints are implemented in web/desktop and native Kotlin. Legacy RPC remains available. Nine core tests, source migration tests with600 items/400 history entries, replay/account isolation/post-snapshot catch-up/legacy compatibility, production browser integration and Android compile passed. Physical native paging acceptance and other phase gates remain open.

Installer lifecycle (2026-11-11): seven disposable config/artifact tests pass, including reviewed legacy adoption and refusal of unknown helpers. Read-only preflight passed on the existing personal integration; it was upgraded to v3 snapshots with original backups retained. Live uninstall was not performed because the integration remains in use.

### Android widget deadlock and destinations, 2026-11-11

On an isolated Android 16 emulator, tapping a Todos widget checkbox exposed an ANR: Android's synchronous RemoteViews collection conversion waited for a row reader while `mutate` held the repository monitor during widget refresh. Mutation and logout now finish their locked store/session writes before notifying widgets. Local state and outbox still commit together. Widget title navigation now resets the active list and clears an already-open detail/settings screen. Empty custom Movies titles retain the correct list default.

Rebuilt production-signed APKs were installed over the previous signed build without deleting app data. The existing account, tasks, widget and custom appearance persisted. Device observations pass Todos checkbox completion without opening the app, immediate Undo, exact row-detail destination, compact quick-add, custom title/light setting, and title navigation from an existing detail screen. The original ANR trace confirms the lock cycle; the fixed completion/Undo updates were observed through the launcher. Node 24 core tests (9), workspace/app typechecks and Android debug/release builds pass. This is partial Android acceptance; Movies/multiple instances/resize/scroll/offline and reminder lifecycle matrices remain open.

### List ordering contract, 2026-11-11

Order v1 now defines numeric ranks plus ordinal UUID ties across web, desktop, React Native, collection widgets and sidebar. Shared move planning excludes the dragged row from its neighbours and detects exhausted rank spacing. Dense ranks rebalance through one local state/outbox write; native Kotlin validates and commits the batch atomically. Moves preserve concurrent inserts and unrelated fields; same-item rank conflicts keep the existing server-acceptance rule. Metro resolves shared-source runtime helpers through the bare app's installed dependencies.

Twelve core tests, workspace/app typechecks, production web/desktop builds, seven installer lifecycle tests and the live rollback protocol suite pass. Android debug/release builds passed serially after a concurrent packaging attempt was discarded; the APK archive and production signature were verified before installation. Movies watched-row hiding and immediate widget Undo also pass on the isolated emulator. Native drag persistence acceptance is being recorded separately; no full phase closure or release publication is claimed.

Native order observation: dragging the first of two temporary Todos below the second changed the rendered order, queued the position mutation, and retained the new order after closing/reopening the app and sync. This proves the normal native move path on Android16; dense-rank/concurrent native adapter scenarios remain distinct from the shared planner tests.

### Account-bound native actions and notifications, 2026-11-11

Android login/refresh/sync now carry a session generation so a late response cannot survive signout or an A→B→A transition. App/widget writes identify their originating account; stale item edits are rejected instead of creating empty items in another account. Widget row data retains its owning account with each row, and failed actions refresh with a useful error. Reminder notification decisions serialize with account transitions.

Sidebar writes now require the account marker returned by its last state read; stale/unbound writes are refused. Desktop account activation finishes before loading retained state. Desktop reminders use typed D-Bus calls rather than a `notify-send` subprocess, retain the notification ID and close it on account changes. Failed notification delivery remains retryable. The existing locked dbus crate was added as a direct dependency without changing any dependency version.

Four Rust tests pass, plus the explicitly invoked live D-Bus notification create/close check. This proves service acceptance, not visible tray/notification presentation. Twelve core tests, workspace/app typechecks, web/desktop production builds, Android debug/release builds and seven installer lifecycle tests pass. Linux deb/AppImage rebuild completed. On Android16, signing out cleared visible widget account content; signing into a second disposable account showed an empty workspace. Full retained-offline/account-transition and notification lifecycle matrices remain open.

Recovery acceptance: the user corrected an earlier old-link observation and supplied the current production password-update screen. Real email delivery and the production recovery form therefore pass. A separate disposable-account hosted integration passes recovery session ownership, password update, old-password rejection, new-password sign-in and invalid/reused-token rejection; the fixture was removed. The real mailbox's password was not changed. Shared auth Site URL was preserved, and no email-template change was needed.

# Milestone acceptance

Updated 2026-11-10. Build success is recorded separately from product acceptance.

| Milestone | Evidence completed | Remaining acceptance |
| --- | --- | --- |
| 0. Reference and environment | Connected phone via ADB; reference screenshot retained privately; target database schema inspected and integration tested | Actual TickTick widget tap map and settings comparison |
| 1. Design and packaging | Web/desktop frontend builds; Android debug and production-signed APK; Linux deb and AppImage | Visual app/widget review and installation acceptance |
| 2. Offline core | TypeScript protocol tests; Rust sidebar atomic parent/child and account isolation tests; web offline persistence/reload/Undo | Android emulator: online add, airplane-mode add/relaunch durability, reconnect sync, completion/Undo and manual movie passed. Remaining: concurrent edits and account-transition acceptance. |
| 3. Accounts and sync | Live temporary account, replay/lost response, field merges, server conflicts/history, deletion/stale recovery, restore, cross-user RLS isolation | Real email verification/reset delivery and callbacks; multi-device disconnected reconciliation and account-transition acceptance |
| 4. Android widgets | Two native widget implementations; APK compile and debug install | Real launcher resize, settings, scrolling, all tap targets, offline add/completion/Undo, process eviction and isolation |
| 5. Desktop and Spotify | Packaged Linux binary starts; IPC requires sign-in; integration installed; Spotify helper startup bug fixed and warm playback toggles confirmed | Offline package installation; visible top-right tray; sidebar account edits; fresh-login autostart; notifications; Spotify reboot/full queue restoration |
| 6. Reminders and movie/web flows | Server TMDB verified; manual movies; deployed browser offline reload/reconnect/Undo/mobile suite | Native notification permissions, reboot and sleep/wake behaviour; desktop reminder opt-in; full native movie acceptance |
| 7. Downloads | Stable private Android signing identity; verified APK signature; Linux builds; local checksums; CI and tag-triggered draft workflow | Android update over prior production-signed install; Linux install/uninstall acceptance; successful tag pipeline; publish tested release |

Device discovery and isolated emulator now work. Android sync required a missing ACCESS_NETWORK_STATE manifest permission, fixed in 59c3d93. Widget setup is blocked by the driver refusing the launcher transition and failing to open the launcher twice, including its suggested debug retry. No production release is published while those gates are open. Production signing secrets are configured; key material is stored outside the repository and must never be committed.

# Milestone acceptance

Updated 2026-11-11. Build success is recorded separately from product acceptance.

| Milestone | Evidence completed | Remaining acceptance |
| --- | --- | --- |
| 0. Reference and environment | Connected phone via ADB; reference screenshot retained privately; target database schema inspected and integration tested | Actual TickTick widget tap map and settings comparison |
| 1. Design and packaging | Web/desktop frontend builds; Android debug and production-signed APK; Linux deb and AppImage | Visual app/widget review and installation acceptance |
| 2. Offline core | TypeScript protocol tests; Rust sidebar atomic parent/child and account isolation tests; web offline persistence/reload/Undo | Android emulator: online add, airplane-mode add/relaunch durability, reconnect sync, completion/Undo and manual movie passed. Remaining: concurrent edits and account-transition acceptance. |
| 3. Accounts and sync | Live temporary account, replay/lost response, field merges, server conflicts/history, deletion/stale recovery, restore, cross-user RLS isolation | Real verification delivery/callback passed with user observation and DB confirmation. Reset redirect allow-list repaired; reset delivery/form/password acceptance remains open, as do multi-device disconnected reconciliation and account transitions |
| 4. Android widgets | Both widget types installed on isolated Android16 emulator; Todos completion/Undo, exact row, compact add, title/settings and Movies watched/Undo observed; widget-refresh ANR fixed | Remaining: full multi-instance settings/resize/scroll, offline lifecycle, process eviction/Undo expiry and account isolation; actual phone reference comparison |
| 5. Desktop and Spotify | Packaged Linux binary starts; IPC requires sign-in; integration installed; Spotify helper startup bug fixed and warm playback toggles confirmed | Offline package installation; visible top-right tray; sidebar account edits; fresh-login autostart; notifications; Spotify reboot/full queue restoration |
| 6. Reminders and movie/web flows | Server TMDB verified; manual movies; deployed browser offline reload/reconnect/Undo/mobile suite | Native notification permissions, reboot and sleep/wake behaviour; desktop reminder opt-in; full native movie acceptance |
| 7. Downloads | Stable private Android signing identity; verified APK signature; Linux builds; local checksums; CI and tag-triggered draft workflow | Same-version signed APK replacement preserved temporary account/tasks/widgets/settings. Remaining: versioned production update with pending work/reminders; Linux install/update acceptance; successful tag pipeline and tested release |

Device discovery and isolated emulator now work. Explicitly targeting the documented NexusLauncherActivity through the bound device driver resolved the earlier launcher block. The original Todos checkbox ANR was reproduced, traced to a repository/RemoteViews lock cycle, fixed and verified with real completion/Undo. Both widgets remain under acceptance; neither the native phases nor the public release gate is complete. Production signing secrets are configured and the stable identity remains private.

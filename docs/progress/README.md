# Implementation progress

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
- [ ] Verified GitHub-triggered Vercel deployment
- [ ] Signed native releases and download checksums

Source implementation alone does not close a runtime or release gate. Keep remaining failures and external configuration requirements explicit.

## Current release gates

CI now checks Node 24 web/core builds, bare Android compile, and Rust tests. Tags prepare a draft with signed APK/Linux artifacts and checksums; publication follows device/install acceptance. Android release packaging requires an explicit production signing identity and cannot fall back to the debug key. A stable private signing identity has been generated outside the repository and configured in GitHub’s native-release environment. Signed build and update acceptance are still required.

Android device discovery currently reports that the SDK is unavailable to the Device panel. Installed Hyprland integration exists; actual tray, sidebar, autostart and notification behaviour still needs acceptance. Spotify helper startup exposed a file-writing bug, now fixed; warm playback was confirmed, while full queue and reboot recovery remain open.

2026-11-10 verification update: database protocol integration suite passed and rolled back its data. Latest Linux deb/AppImage packages built successfully; packaged binary started and its IPC correctly requires sign-in. Latest Android debug APK installed successfully on the connected phone. Device UI automation remains blocked by Device panel SDK discovery. GitHub main implementation commit is pushed and triggered Vercel production deployment and CI.

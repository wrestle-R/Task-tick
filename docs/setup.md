# Setup

## Server

Copy `next/.env.example` to `next/.env.local`. Set the Supabase URL and publishable key. Configure TMDB read access on the server. Do not expose the TMDB token with a NEXT_PUBLIC_ prefix. Never copy another project's database environment file wholesale.

Supabase must allow open email/password registration, verify addresses, and deliver password reset emails. Add the deployed website `/app` URL to allowed redirects. Existing project-wide auth settings may serve other applications; review before changing them.

The migration creates two primary tables plus private sync support. Review the migration against the target project's current schema. Avoid applying it twice or overwriting an existing table with the same name.

## Android

Install Java 21, Node 24, Android SDK platform `platforms;android-37.0`, Build Tools 37.0.0 and NDK 27.1.12297006. Set ANDROID_HOME. Run `npm ci --prefix app`.

For a development keystore (not production signing):

```sh
keytool -genkeypair -noprompt -keystore app/android/app/debug.keystore -storepass android -keypass android -alias androiddebugkey -dname 'CN=Android Debug,O=Android,C=US' -keyalg RSA -keysize 2048 -validity 10000
```

Use `./gradlew :app:assembleDebug` from `app/android` or the React Native CLI. Android configuration uses your website backend to fetch publishable client settings; the app never needs the database password.

Add either widget from the launcher's widget picker. Widget + opens compact add; row text opens details; completion is a separate target. Configure the widget title, light/dark appearance and opacity per instance. Notifications need permission; exact alarms are optional with a delayed fallback.

## Linux / Hyprland

Install WebKitGTK 4.1, GTK 3, libayatana-appindicator, notify-send and the usual Rust build toolchain. `npm run desktop` starts development; `npm run tauri -w desktop -- build` packages the app.

After building, optional integration into illogical-impulse Quickshell:

```sh
python3 desktop/hyprland/install.py --binary /absolute/path/to/tick-and-done
```

The installer backs up the affected configuration, adds autostart, registers a desktop launcher, and connects the sidebar. Preserve those backups. The tray uses the existing right-hand StatusNotifier host; visibility depends on the user's bar pin/overflow settings. The installer leaves existing local todo storage intact.

To restore backed-up files:

```sh
python3 desktop/hyprland/install.py --binary /absolute/path/to/tick-and-done --uninstall
```

The Spotify helper expects the user's installed Spotify TUI with its own login/provider setup. Tick and Done does not collect Spotify credentials. It can reconnect the helper quietly; a first playable track still has to be selected once.

## Release signing

Set GitHub environment `native-release` secrets `TICK_ANDROID_KEYSTORE_BASE64`, `TICK_ANDROID_STORE_PASSWORD`, `TICK_ANDROID_KEY_ALIAS`, and `TICK_ANDROID_KEY_PASSWORD` from the project's stable production signing identity. Keep its offline backup private. Never reuse the generated debug identity for releases. Local release builds use `TICK_ANDROID_KEYSTORE` as a file path and the other three settings as environment variables.

Tags run checks and build draft releases. Validate Android installation/update, Linux offline launch, reminders and widgets before manually publishing the draft. No tag or production release has been published during initial implementation.

### Upgrading a legacy integration

New installs record config and generated-artifact snapshots. Updates preserve the first baseline; uninstall reverses only known changes and restores prior files. Modified managed sections/artifacts cause a conflict before config changes. Original backup directories are retained privately.

For a reviewed legacy installation, run the installer once with `--adopt-legacy` and the binary currently targeted by the existing app symlink. This explicitly confirms the recognized files belong to this integration. Adoption checks the managed config edits, exact desktop launcher, binary link and shipped helper/QML hashes. It refuses unknown files, missing original backups or backups that already contain managed integration. After adoption, the regular install/update/uninstall path applies. Do not use this flag to suppress a conflict with personal edits.

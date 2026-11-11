# Shared application theme

Web, desktop and Android use the palette in `packages/core/src/theme.ts`. Both light and dark modes share paper, surface, sidebar, text, border, accent, hover and error colors, plus control geometry.

Web and desktop load `packages/ui/src/theme.css`, derived from that source. After changing the palette, run `node packages/ui/scripts/theme.mjs`. CI runs the same command with `--check` to reject drift. Android consumes the shared module directly through its Metro watch folder.

DM Sans body text and Manrope headings are bundled from Google Fonts with their OFL licenses. Web/desktop bundle the same files that Android includes as font assets; external font requests are unnecessary. Responsive web, desktop and native layouts retain their platform dimensions.

Appearance selection is currently device-local; this change does not introduce account-synced theme preferences. Widget translucency/settings remain independently configurable.

# Tick and Done

Read docs/architecture.md and docs/progress/README.md before changing behaviour. Keep the repository root clean. Android is bare React Native, never Expo. Two widget types only: Todos and Movies.

Use Node 24. Root npm workspace excludes app/; app/ has its own npm lockfile. Preserve checked-in package versions and lockfiles. Native storage must remain the source of truth for Android widgets and Linux sidebar integration.

Never commit real environment files, API credentials, signing keys, private local-docs/ memory, screenshots containing user data, or build outputs. Client bundles may use only publishable Supabase credentials. TMDB access belongs on the server.

Respect the sync contract: stable mutation IDs, atomic local writes/outbox, server-ordered same-field conflicts, different-field merges, deletion wins, seven-day recovery/trash. A lost response must not duplicate a mutation. Account transitions must isolate retained offline data.

Verify behaviour through meaningful protocol and integration tests. Run npm test, npm run typecheck, production builds, Android compile and Rust checks as appropriate. Real widget/notification claims require device evidence. Do not describe unverified release artifacts as ready.

Website code deployments use the linked GitHub repository, not local Vercel deployment commands. Vercel configuration/environment changes are separate from code deployment. Sync real environment-file changes to Varte using the confirmed repository/directory/name and never print values.

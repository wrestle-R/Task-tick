# Security verification

The 0.2.4 candidate hardens existing account boundaries; it is not a claim that software has no vulnerabilities.

- Desktop native storage holds the active-account lock through reads and writes. Stale callbacks cannot access a previous account after a transition. The regression also covers signed-out access.
- Web responses disallow framing, disable MIME sniffing, suppress referrers and constrain embedded objects/base URLs. This is a targeted browser hardening policy, not a complete script CSP.
- Sync returns a generic service failure for database RPC errors rather than database internals. Malformed JSON gets a fixed validation message.
- Android clears local credentials immediately on sign-out and attempts to revoke the captured device's server session when connected. Offline sign-out cannot guarantee remote revocation; access tokens may remain valid until expiry. Retained offline lists remain isolated for the same account.
- Root dependency advisories were resolved through Vite7.3.8 and patched lockfile dependencies. Mobile tooling uses minimatch11.0.8 for the affected dependency range.
- GHSA-gcqx-w48m-w2h4 affects deepmerge4.3.1 and has no published patched version. `app/scripts/harden-deepmerge.cjs` applies a hash-guarded fix during installation: own keys are defined as data properties instead of invoking inherited setters. Both the distributed entry and source are patched. The exploit/compatibility regressions run after clean installation and in Android CI. npm still reports nine low-severity dependency-chain entries for this upstream advisory; that metadata does not account for the local patch. Remove the patch only after adopting and testing an upstream fixed release.

Checks performed: core tests, desktop native account-transition regression, TypeScript, production web/desktop builds, clean mobile dependency install, CLI configuration, prototype-poisoning and merge compatibility regressions, Android compilation, database RLS/mutation-replay/pagination tests with rollback, push-registry cross-account tests with rollback, and deployed endpoint rejection of missing/forged JWTs. The publishable-config check verifies that no privileged key is returned.

Password strength, email verification/reset and password policy are managed by the existing Supabase project. Use strong, unique passwords. This audit does not silently change shared-project policies used by other apps. Browser/desktop sessions rely on their existing user-private client storage; Android sessions use Keystore encryption. Local malware running as the user and a compromised OS remain outside these account-isolation tests.

Release and installation evidence is recorded in `docs/progress/README.md`. Secrets, private test accounts and device screenshots stay outside Git. Website code deploys through GitHub.

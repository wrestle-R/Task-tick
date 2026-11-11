# Tick and Done: implementation completion plan

Status: implementation resumed by explicit user instruction on 2026-11-11. All six phases remain subject to their acceptance gates.
Prepared: 2026-11-10. Audited source baseline: `267d176`.
Structure: six larger phases, as requested, each containing small end-to-end slices.

This document replaces informal remaining-percentage estimates. It does not reopen the agreed product scope or declare existing code complete. A slice closes only when its implementation and acceptance evidence both exist.

## Planning method and sources

This plan applies Matt Pocock's specification synthesis and vertical-slice planning approach: preserve durable architecture, describe complete user journeys, attach external-behaviour tests, and make dependencies and acceptance explicit.

- Current official [to-spec skill](https://github.com/mattpocock/skills/blob/main/skills/engineering/to-spec/SKILL.md), read during planning.
- Official historical [prd-to-plan skill](https://github.com/mattpocock/skills/blob/ab45d5e6e1733b7ae27a0795f2a86418c2d451a0/prd-to-plan/SKILL.md), read during planning; its older phase-planning workflow fits this request.
- Approved product decisions from this conversation and the original private project plan.
- Repository architecture, progress records, migration, native repository, desktop store/integration installer and release workflow.

The deliverable stays under the existing documentation directory to preserve the clean repository root. It is a local review draft, not a published GitHub issue or an agent-ready work queue. No implementation, builds, installs, service restarts, schema changes or deployments are authorized by this planning turn. Existing implementation authorization is superseded by the latest planning-only instruction until the user explicitly resumes it.

## 1. Problem and completion target

The user wants one dependable todo/watchlist system across Android, two home-screen widgets, web, Linux desktop and a Hyprland sidebar. The code now exists across these surfaces, but build success and isolated tests have repeatedly been confused with full completion. Some behaviour remains unimplemented or insufficiently specified; other behaviour has source code but lacks end-to-end evidence.

Completion means the original user journeys work with local-first persistence, correct account isolation, predictable recovery and installable updates. A working happy-path demo, a generated APK or a checked checklist is insufficient.

### Current evidence baseline

| Area | Evidence already recorded | What that evidence does not establish |
| --- | --- | --- |
| Core and server | Four core tests; live rollback integration for replay, merges, conflict history, deletion, restore, ownership, seven-day expiry and retained tombstones | Every native adapter, concurrent device schedule, batching boundary or migration recovery |
| Web | Production builds; deployed sign-in, add, offline reload, reconnect, completion/Undo, manual movies and mobile-width browser checks | Real email delivery, all account transitions, reminders or every item-detail interaction |
| Android | Bare RN/native compile; debug and stable-key-signed APK; signature verification; installs; emulator sign-in, local add, offline relaunch persistence, reconnect, completion/Undo and manual movies | Widget acceptance, native reminders/reboot, full account isolation, production update migration or latest concurrency changes under load |
| Desktop | Frontend build, Rust checks/tests, deb/AppImage packaging, packaged process start, signed-out IPC rejection and tray registration | Offline package install, visible tray placement, account-backed sidebar edits, wake reminders or fresh-session autostart |
| Spotify | Quiet helper startup, observed warm play/pause, regression for preserving position when stopped | Full queue restoration, reboot recovery or all provider/auth failure modes |
| Delivery | GitHub-triggered Vercel deployment; one full web/Rust/Android CI run passed; draft release workflow and private signing identity exist | Latest-head checks, successful tagged release build, update-over-install or published verified downloads |

Historical results are retained as evidence, not assumed to apply automatically to later source changes. Freshness is evaluated against the code touched in each slice.

### Evidence classification

Every requirement must have exactly one current state:

1. **Verified:** behaviour demonstrated on the named source version and environment.
2. **Implemented, unverified:** source exists, but acceptance is incomplete.
3. **Missing or defective:** implementation is absent or fails a recorded scenario.
4. **Blocked:** a named prerequisite prevents the next acceptance step; record the error, attempted recovery and exact unblock action.

Do not estimate a percentage until this inventory exists. Do not label a whole phase verified when only its build gate passed.

## 2. Scope and durable decisions

### Product scope

- One general Todos list and one Movies list per private account; films and TV, no episode tracking.
- Todos include title, notes, subtasks, due date/reminder, priority, completion and ordering.
- Completing a parent completes children; completing children does not implicitly complete the parent.
- Movies support manual offline entry, authenticated server TMDB lookup, watched state and optional 1–5 rating in half-star steps.
- Exactly two Android list widget types, Todos and Movies; independently configurable instances.
- Full web workspace plus marketing/docs/downloads; installable Linux desktop; optional Hyprland/Quickshell integration and Spotify shortcut behaviour.
- Open email/password signup, verified email, password reset and per-account isolation.

### Architecture and contracts

- Android stays bare React Native with Kotlin SQLite as the app/widget source of truth. No Expo.
- Desktop and sidebar use one native SQLite/service boundary. No competing QML database or independently synced sidebar copy.
- Web uses its existing local browser store and cached application shell.
- Authenticated Next backend owns sync access and TMDB credentials. Public clients contain only publishable Supabase configuration.
- Existing `code-todo` and `movies-todo` primary tables remain the two user-facing lists; internal sync/history metadata may evolve through reviewed migrations.
- Stable item/mutation IDs, atomic local state/outbox writes, idempotent retries, server-accepted same-field order, different-field merges and deletion wins remain mandatory.
- Seven-day trash/history retention is separate from longer-lived deletion identity and replay metadata.
- Account transitions retain pending work for the same account when chosen; signed-out surfaces and other accounts cannot expose it.
- Widget Undo lasts ten seconds and must preserve unrelated later edits. Parent/child completion and recovery are atomic user operations.
- Native reminders operate from local state. Website reminders operate only while the site is open. No Web Push is being added.
- Android denied precise-alarm permission permits an explained delayed fallback. Resume produces one summary of still-unfinished overdue tasks.
- Backend URL is fixed by the shipped clients. No user-facing backend setup field.
- Node 24; retain checked-in package versions and lockfiles unless a demonstrated fix requires an explicit dependency decision. Android remains outside the root npm workspace.
- Website code deploys through linked GitHub. Environment/configuration changes are separate, and any changed real environment files must be synced through the confirmed Varte destination.
- Reuse the existing stable production signing identity. Never replace it to solve an update-install failure.

### Out of scope

iOS/macOS/Windows native apps, recurring tasks, shared lists, extra list types, episode tracking, Web Push, adding unrelated Spotify product features, broad redesigns, dependency upgrades without a demonstrated need, and KDE Connect removal. These do not become requirements through incidental testing discoveries.

## 3. User stories and traceability

| ID | User story |
| --- | --- |
| U01 | As a user, I can install and open the app without configuring a server. |
| U02 | I can register, verify email, sign in, reset my password and recover from an expired session. |
| U03 | I can switch/sign out of accounts without exposing or losing retained offline edits. |
| U04 | I can create/edit todos with notes, priority, due dates and subtasks on each supported surface. |
| U05 | I can complete a parent and Undo the operation without corrupting prior child states or later edits. |
| U06 | I can reorder items without losing concurrent inserts or receiving inconsistent order across devices. |
| U07 | I can edit offline, restart, reconnect and receive one correct result even if an upload response was lost. |
| U08 | I can recover conflicts and deleted content for seven days, while stale devices cannot resurrect deleted items. |
| U09 | I can add manual movies offline or find film/TV metadata online, with clear duplicate handling. |
| U10 | I can mark watched and rate a movie, and find it again in Watched. |
| U11 | Each widget tap opens the intended list/detail/add/settings destination. |
| U12 | Widget completion and ten-second Undo work offline and while the main app is absent. |
| U13 | I can resize and customize separate widget instances without their settings interfering. |
| U14 | I receive useful native reminders, understand denied permissions and avoid stale notification bursts after wake. |
| U15 | The Linux package opens offline and continues appropriate background work after its window closes. |
| U16 | Super+A opens the sidebar on Todos, backed by the same store as the desktop app. |
| U17 | The desktop starts once, has a visible top-right tray entry, and exits when I explicitly choose Quit. |
| U18 | Super+Space toggles actual playback, quietly starts an absent engine, and restores the supported last playback state. |
| U19 | Integration install/update/uninstall preserves unrelated configuration and existing data. |
| U20 | I can download verified packages, check their integrity and install updates without losing my data. |
| U21 | I see accurate pending/retrying/sign-in-required status instead of false success or raw implementation errors. |
| U22 | The product remains usable in light/dark modes, at phone widths, with readable text and accessible actions. |

## 4. Phase order and dependencies

| Phase | End-to-end outcome | Depends on | Original milestones |
| --- | --- | --- | --- |
| 1 | Reliable account entry and an auditable test baseline | Planning approval | 0, 1, 3 |
| 2 | Safe offline edits, reconciliation and recovery across real adapters | 1 | 2, 3 |
| 3 | Complete Todos/Movies journeys through native widgets and apps | 1; final closure requires 2 | 0, 1, 4, 6 |
| 4 | Correct local reminders through permissions, restart and wake | 1, 2; native UI from 3 | 6 |
| 5 | Dependable desktop/sidebar/Spotify lifecycle and reversible integration | 1, 2; reminder closure requires 4 | 5 |
| 6 | Tested update paths and verified public delivery | 1–5 all accepted | 7 |

Default execution is sequential to limit cross-surface regressions. Independent read-only investigation may occur earlier, but it does not close dependent acceptance gates. No background/delegated implementation is implied by this plan.

## 5. Phase 1: account entry and a trustworthy baseline

**Stories:** U01, U02, U03, U21, U22.

**Entry:** explicit user instruction to resume implementation; baseline source and clean/dirty state recorded.

### Slices and work

1. **One account reaches a usable workspace.** Inventory each requirement against source and existing results. Establish clean temporary accounts and deterministic test data. Verify shipped fixed-backend configuration, native startup and one authenticated read/write on Android, web and desktop.
2. **Verification/reset reaches the intended product.** Trace signup and recovery from the email action through redirects, callback state, password update and subsequent sign-in. Check desktop and Android handoff behaviour separately. A link landing on the website is insufficient if the required native return path remains absent. Inspect shared Supabase auth settings before any change; preserve unrelated applications.
3. **Account transitions preserve privacy.** Exercise A with pending edits, signout warning/retention, B sign-in, then A return. Include widgets, sidebar, notifications, local config caches and token refresh completing during a transition.
4. **Usable entry states.** Verify light/dark entry, keyboard handling, large text, loading/disabled actions and useful errors. The backend field must remain absent.

### Acceptance criteria

- [ ] Latest source/build identifiers and environment are attached to results.
- [ ] New verified account can sign in on all three clients.
- [ ] Actual verification and reset messages reach a controlled mailbox; invalid/expired/reused links fail clearly.
- [ ] Reset changes the password and preserves correct account ownership; sign-in with the old password fails.
- [ ] No account content, retained queue or notifications appear for B or while signed out.
- [ ] A's preserved pending edits remain recoverable after returning to A.
- [ ] Expiring/refreshing sessions cannot repopulate a signed-out or different account's credentials.
- [ ] No secrets or private test account data appear in tracked output.

**Test seam:** supported authentication/client entry boundary, then rendered workspace/local-store effects. Use existing authenticated API seams rather than mock Supabase internals.

**Evidence:** account-flow matrix, redacted callback traces, per-client transition results, cleanup confirmation.

**Stop condition:** wrong auth project/redirect destination, cross-account leak, lost queue or inaccessible mailbox. Resolve the exact dependency; do not disable verification or alter another product's auth setup as a workaround.

**Exit:** every account story passes or a proposed scope change is explicitly accepted. A temporary service timeout is retried with a recorded bounded policy, not treated as successful coverage.

## 6. Phase 2: offline correctness through sync and recovery

**Stories:** U03–U08, U21.

### Slices and work

1. **Durable single-client editing.** On each real local adapter, add/edit/delete offline, terminate/restart the app normally, and confirm state and stable mutation IDs survive. Inject failure between attempted local state and outbox writes; either both persist or neither does.
2. **Lost response and in-flight work.** Commit a mutation server-side, suppress the response, retry the same ID and confirm one result. Make additional edits during upload; acknowledgement cannot discard them. Exercise foreground/background overlap and delayed responses on Android, and desktop/sidebar concurrent writes.
3. **Two-device reconciliation.** Fork two clients from a common state. Apply different-field and same-field changes in controlled server acceptance orders; inspect both final state and seven-day recovery history. Repeat delete-vs-edit and explicit restore. Invalid mutation-ID reuse must be rejected.
4. **Order and atomic completion.** Compare the current per-item position scheme with the approved list-order semantics. Decide and document the list operation/tie-break contract before changing it. Test concurrent inserts, equal positions, parent completion, Undo after unrelated edits, and recoveries while later changes exist.
5. **Large queues and old clients.** Cross the 100-mutation upload boundary, interrupt batch processing, and resume. Audit currently unbounded change/history responses against durable pagination and snapshot recovery requirements. Specify cursor/page/snapshot contracts before introducing protocol changes; update every adapter together. Check seven-day purging without losing tombstones or replay protection.

### Acceptance criteria

- [ ] Each adapter proves atomic local write/outbox persistence under failure and restart.
- [ ] Lost responses do not duplicate effects or history entries.
- [ ] Edits made during upload remain queued until their own acknowledgement.
- [ ] Cursor progress never regresses and no accepted changes are skipped across page/batch boundaries.
- [ ] All clients converge for both same-field acceptance orders and different-field merges.
- [ ] Delete wins against fresh and ancient stale edits; explicit restore is the only resurrection path.
- [ ] History/trash expire at the agreed boundary; completed/watched content remains durable.
- [ ] Parent completion and Undo preserve child states and unrelated later edits atomically.
- [ ] Reordering converges while concurrent new items remain included.
- [ ] Session expiry, API failure and retry preserve pending work and show accurate status.

**Test seam:** existing authenticated sync boundary plus each native/browser storage boundary. Reuse common scenario fixtures and expected results across adapters; do not claim TypeScript tests prove Kotlin/Rust behaviour.

**Evidence:** scenario/adapter result table, source-versioned protocol decisions, replay traces, migration rollback/isolation results and cleanup logs.

**Stop condition:** data loss, ownership mismatch, cursor gaps, conflicting contract interpretations or unreviewed production migration. Freeze dependent feature closure until corrected.

**Exit:** the same behavioural scenarios pass on web, Android and desktop, including sidebar mutations where relevant.

## 7. Phase 3: full task/movie experience and two trustworthy widgets

**Stories:** U04–U13, U21, U22.

### Slices and work

1. **Reference and test-host setup.** Inspect TickTick's permitted widget destinations and visual behaviour on the actual phone when it is available. Retain private screenshots only in ignored notes. Repair or replace the launcher automation route through supported device tools; inspect the documented failure rather than repeat the same command. If it remains unavailable, arrange an explicit manual acceptance run. Never mark a screenshot-only inference as observed interaction.
2. **Complete task editing.** Cover title/notes/priority/subtasks/reminder/order, parent-vs-child completion, detail opening, Completed/Trash/History and restore on each shipped UI. Include accessible names, large text, touch targets and keyboard behaviour.
3. **Complete film/TV journey.** Test online TMDB lookup through server-only credentials, selection/details, duplicate provider identity reuse, similar manual-title confirmation, offline manual entry and cached-poster fallback. Watch/unwatch and half-star rating must round-trip through local storage and sync without introducing excluded tracking fields.
4. **Widget list and destinations.** Add Todos and Movies widgets, then verify title, row text, checkbox, plus and overflow independently. Add multiple instances with different settings. Resize, scroll, change theme/opacity, and confirm the instances remain independent.
5. **Widget offline lifecycle and Undo.** Complete/add while offline, while the app is backgrounded, and after ordinary process eviction. Verify ten-second Undo expiry even if the originating receiver/process dies. Audit the current delayed refresh mechanism against that lifecycle. Signed-out widgets must clear private content; permission denial cannot create false success. Force Stop is tested and documented separately from ordinary eviction.

### Acceptance criteria

- [ ] Every agreed task and movie interaction completes across local UI, durable store and eventual sync.
- [ ] Same TMDB identity is reused; uncertain manual matches are not silently merged.
- [ ] Both widget types show correct account/list content, scroll and resize with readable contrast.
- [ ] Title opens its list; text opens its exact item; checkbox does not open the app; plus opens compact add; overflow opens that instance's settings.
- [ ] Completed/watched rows disappear from widgets and remain available in app views.
- [ ] Offline quick-add/completion is durable before success is rendered.
- [ ] Widget Undo works within ten seconds, expires visibly and survives the required lifecycle cases.
- [ ] Multiple instances do not overwrite one another's title/theme/opacity/list state.
- [ ] No private data is visible after signout/account change.
- [ ] Phone reference comparison and actual-device evidence are recorded separately from emulator checks.

**Test seam:** visible application/widget actions through supported device automation or an explicit manual run, checked against local/server outcomes. Meaningful regression fixtures accompany discovered logic defects.

**Evidence:** tap-target matrix across lifecycle states, before/after private screenshots or recordings, instance settings matrix, offline/reconnect records and measured widget refresh timings. Set performance targets from observed baseline and review them before claiming guarantees.

**Stop condition:** launcher/device driver fails twice after its documented recovery, wrong foreground app, phone actively in unrelated use, private data exposure or destructive install required. Record the unblock action; do not bypass device-tool restrictions or erase installed data silently.

**Exit:** full task/movie journeys and every widget acceptance criterion pass on the declared Android test environments.

## 8. Phase 4: reminders that survive the real lifecycle

**Stories:** U04, U14, U15, U21.

### Slices and work

1. **One offline phone reminder.** Set a local due time, leave the app, go offline and observe the notification. Complete/delete/reschedule locally before firing and confirm cancellation/replacement behaviour.
2. **Permission-aware recovery.** Test notifications allowed/denied and precise alarms allowed/denied on supported Android versions. Confirm useful guidance and delayed fallback without repeated permission nagging. Audit permissions needed by job scheduling against the shipped manifest.
3. **Restart and wake.** Reboot the test device, cross due times while suspended, change time/timezone and resume. Confirm persisted schedules and one summary of still-unfinished overdue tasks. Ensure known completed/deleted tasks do not reappear as reminders.
4. **Desktop opt-in.** Enable reminders for one desktop/account and leave another disabled. Exercise window closed, explicit Quit, session restart and suspend/resume. Notifications must not expose another account after a transition.
5. **Open-site reminders.** Check the web reminder path while open and permission-denied states. Documentation must clearly describe the supported open-site lifecycle and possible duplication between offline native devices.

### Acceptance criteria

- [ ] Native local due items notify without a network dependency.
- [ ] Completed/deleted/rescheduled items cancel or update pending local reminders.
- [ ] Permission-denied states remain usable and explain available fallback accurately.
- [ ] Reboot reschedules pending work; normal process eviction is not confused with Force Stop.
- [ ] Resume emits one useful overdue summary rather than a stale notification burst.
- [ ] Desktop opt-in is durable, account-isolated and respected when disabled.
- [ ] Explicit Quit behaviour and suspended/off-device limitations are accurate.
- [ ] Browser behaviour matches the open-site-only promise.

**Test seam:** local task scheduling through actual OS notification delivery, not merely a scheduler API returning success.

**Evidence:** permission/device/lifecycle matrix, notification timestamps and contents, reboot/resume logs, cancellation results.

**Stop condition:** unavailable permission controls, inability to observe OS delivery, disruptive physical-device reboot, or a notification privacy leak. Arrange a controlled device run instead of claiming delivery from source or logs alone.

**Exit:** the supported reminder matrix passes and product help matches observed limitations.

## 9. Phase 5: desktop/sidebar and Spotify as one dependable OS flow

**Stories:** U15–U19, U21, U22.

### Slices and work

1. **Offline desktop installation.** Install each declared Linux artifact on its supported distribution/session, launch without network, then reopen with network and sync. Verify native library dependencies, account persistence, single-instance behaviour, close-to-tray and explicit Quit. Do not equate building a deb on an Arch host with testing Debian installation.
2. **Sidebar shares the same durable state.** Add/edit/complete through both desktop and sidebar while racing writes and reconnecting. Verify optimistic concurrency retries, accurate pending state, signed-out fallback, socket ownership/permissions and no unauthenticated retained content. Every Super+A opening resets to Todos.
3. **Reversible installation and upgrades.** Audit repeated install/update/uninstall with disposable copies of the user's config. The current whole-file backup restoration could overwrite changes made after installation; plan a managed-block/three-way conflict policy before touching live config. Preserve original backups across repeat installs and track generated launchers/helpers/symlinks for cleanup. Do not discard existing local todos.
4. **Autostart and visible tray.** Prove one background process after login and after repeated opens; verify the actual right-side tray layout and menu actions. Registration alone is not visible placement. Verify user-initiated Quit and subsequent restart.
5. **Spotify cold recovery.** Determine which queue/context/index/options the installed provider actually exposes. Define a durable versioned playback snapshot and restore algorithm with confirmed command outcomes. Save the track/position, queue or context when available, selected index and supported playback options without account credentials. Serialize rapid shortcuts and avoid overwriting recovery state with an empty/stopped engine.
6. **Playback failure and reboot matrix.** Exercise UI absent/engine alive, engine absent, fresh boot, offline, expired login, no previous track and rapid repeated hotkeys. Observe actual playback and position/queue progression. If full provider queue cannot be recovered, document the exact unsupported boundary and seek an explicit product decision; do not silently substitute last-track-only recovery.

### Acceptance criteria

- [ ] Supported packages launch offline and preserve data through update/restart.
- [ ] Window close preserves background work; explicit Quit terminates the intended service.
- [ ] Desktop/sidebar edits share one store and do not lose concurrent changes.
- [ ] Super+A always starts on Todos and preserves Movies data.
- [ ] Exactly one autostarted process exists, with a visibly accessible top-right tray/menu.
- [ ] Install/update/uninstall preserve unrelated config, post-install edits and existing todo data.
- [ ] Super+Space quietly starts an absent engine and toggles one intended playback action.
- [ ] Last track/position and the agreed queue/context recover after full engine shutdown/reboot.
- [ ] Provider/auth/network failure produces an actionable result without claiming playback success.
- [ ] Spotify integration changes outside Task-tick are isolated, documented and verified in their owning project.

**Test seam:** packaged desktop plus private IPC/sidebar and actual player state/audio outcomes. Use temporary configuration trees for installer regression tests; do not exercise destructive restore tests against live personal config.

**Evidence:** supported-platform install matrix, desktop/sidebar concurrency transcript, tray screenshot, fresh-session process counts, install/uninstall config diff, Spotify before/after snapshots and confirmed playback results.

**Stop condition:** unavailable provider queue contract, necessary external-project change without a defined owner/scope, config merge conflict, missing Linux test environment or disruptive logout/reboot. Keep the exact slice blocked while independent slices continue.

**Exit:** the user's OS flow works across login, window close, network loss, playback shutdown and uninstall.

## 10. Phase 6: verified updates, releases and honest completion

**Stories:** U01, U20; final regression of U02–U22.

### Slices and work

1. **Release identity and versioning.** Verify the stable signing identity exists privately and in the intended GitHub environment without printing values. Align Android version name/code, desktop/package version, tag and download metadata. Increment update versions; never solve signature mismatch by deleting user data. Test production-to-production updates separately from existing debug installs.
2. **Candidate from the exact commit.** Run applicable core, API integration, client typechecks, production builds, Android compile, Rust tests and native acceptance against one recorded candidate. Trigger the tag pipeline only after the candidate is eligible. Verify artifact provenance and workflow failures/cancellations, not just local builds.
3. **Install and update paths.** Install fresh and over a previous production-signed installation with realistic local state and a pending outbox. Verify migrations, retained identity, widget configuration, reminders, desktop integration and eventual sync. Test documented uninstall behaviour without wiping unrelated settings.
4. **Draft release and integrity.** Confirm the draft contains the intended APK and tested Linux artifacts, version metadata, SHA256 checksums and readable install/update instructions. Verify signatures and hashes from downloaded artifacts, not only build-directory copies. Exclude secret files, private notes, screenshots with user data and build intermediates from Git.
5. **Publication and website.** Publish only after Phases 1–5 and update gates pass. Verify release assets are public and download links resolve. Deploy website code solely through GitHub and verify its displayed version/download listings after cache refresh. Configure environment changes separately and sync any changed real environment files to Varte with confirmed mapping and successful CLI output.
6. **Final audit and handoff.** Reconcile every original milestone and U01–U22 with evidence, residual limitations and open defects. The repository's progress page and installation docs must describe what was actually tested. Maintain private continuity notes without uploading them.

### Acceptance criteria

- [ ] Latest candidate has the applicable automated checks green on the exact source revision.
- [ ] Stable signatures and coherent versions are verified; release identity has not changed.
- [ ] Production update preserves data, pending work, accounts, widget settings and reminders.
- [ ] Tested Linux artifacts install/update on their declared supported environments.
- [ ] Tagged CI produces the expected draft artifacts; downloaded hashes/signatures match.
- [ ] Public release assets, documentation and website download/version metadata agree.
- [ ] GitHub-triggered website deployment is verified independently of native release publication.
- [ ] Any environment-file changes have confirmed Varte sync status, with no secret disclosure.
- [ ] No required original milestone or user story remains missing, defective or blocked.

**Test seam:** downloaded, installed release artifacts and the deployed public product, with provenance back to a single commit/tag.

**Evidence:** candidate checklist, CI links, signature/hash results, fresh/update installation records, release/download checks and completed requirement matrix.

**Stop condition:** unsigned/debug-signed production artifact, failed candidate check, update data loss, missing release asset, inconsistent version, unverified environment sync or any earlier required acceptance gate still open. Keep the release draft unpublished.

**Exit:** every original milestone is accepted, verified release downloads are available, and the final handoff accurately records supported behaviour and limits.

## 11. Testing and evidence policy

Prefer external behaviour at existing seams. Avoid broad test frameworks, component smoke tests, snapshots of whole screens and assertions that merely mirror implementation. Add focused regressions for real defects, then the smallest integration scenario that demonstrates the fix.

| Scenario | Required surfaces/evidence |
| --- | --- |
| Account A/B isolation and retained offline work | Android app/widgets, desktop/sidebar, web; local and server results |
| Lost response and concurrent edits | Authenticated sync plus each adapter; stable IDs and final state |
| Same/different fields, delete/restore, seven-day purge | Server protocol plus two real clients; history and tombstones |
| Parent completion, Undo and ordering | Each adapter; app/widget where supported; unrelated-edit preservation |
| Offline cache and restart | Web initial-load/cache/reload; native restart; desktop packaged offline start |
| Widget destinations and lifecycle | Emulator and actual phone; target-by-target observable outcomes |
| Reminders and permissions | Actual OS notification evidence across required lifecycle cases |
| Sidebar and startup | Installed desktop/Quickshell/Hyprland, process counts and visible tray |
| Spotify recovery | Confirmed playback/position/queue across warm/cold/boot/failure cases |
| Release updates | Fresh and production-to-production installs; pending data and migrations |

Record: requirement ID, source revision, artifact/version, environment/OS, preconditions, actions, expected result, observed result, evidence location and cleanup. Private evidence stays ignored; public docs contain sanitized results. A test runner exit zero is evidence only for the scenarios it actually executed.

Expected existing commands include `npm test`, `npm run typecheck`, `npm run build`, app TypeScript checking, Android compile, `cargo test --locked`, Python helper tests, and the current browser/live-protocol integration suites. Exact commands and environment paths are resolved during execution, not hardcoded into the product UI. Run integration suites only against the authorized project and clean up temporary accounts/data.

## 12. Blocker handling and execution discipline

For each blocker record: affected slice, exact error, attempted documented recovery, state left behind, owner of the unblock action and what independent work can continue. Repeated failures do not justify silently reducing acceptance requirements.

Current known blockers or unresolved prerequisites:

| Item | Current finding | Planned unblock action |
| --- | --- | --- |
| Widget automation | Driver refuses launcher transition; explicit launcher open and debug retry failed | Investigate supported launcher targeting outside the failed run; use a compliant manual device session if unavailable. No repeated forbidden fallback. |
| Physical phone availability | Phone has been actively used during previous checks | Arrange a controlled acceptance window; do not capture or manipulate unrelated apps. |
| Mail delivery | Temporary verified accounts bypassed actual mailbox acceptance | Use a controlled mailbox and inspect allowed redirects/shared auth configuration. |
| Spotify queue | Helper stores track/position; full queue contract remains unproven | Inspect owning player/provider contract and define recoverable snapshot semantics before implementation. |
| Safe uninstall | Current backup restore replaces whole configuration files | Design conflict-aware managed integration restore and verify with disposable config trees. |
| Sync contract completeness | Existing response aggregates changes without explicit bounded pull pagination; ordering uses per-item positions | Specify consistent pagination/snapshot and ordering semantics, then implement all adapters and migration together if required. |
| Update identity | Existing phone debug install differs from stable production signing identity | Use isolated production-signed installs for update acceptance; preserve phone data instead of uninstalling silently. |
| Linux environment | Packaging success does not prove installation on each supported distribution | Declare and obtain appropriate test environments; test native and portable artifacts separately. |

Do not restart Metro, local servers or background desktop services during planning. At implementation resume, check whether each required process still exists before repeating state-changing actions after a restart. Never recreate signing identity or reset/pull environment files to bypass a failure.

## 13. Commit and change boundaries

Use small commits around a verified behaviour or tightly coupled protocol change. Keep schema/API/all-adapter protocol migrations together when compatibility requires it. Include relevant evidence and limitations in review descriptions. Do not mix unrelated redesigns, package upgrades or personal OS changes into a slice.

Preserve a rollback path for schema, client compatibility and optional integration changes. Rollback must preserve user data and the production signing identity. Do not publish half-upgraded protocol clients without an explicit compatibility strategy.

Before later commits/pushes: inspect the full staged diff, scan for forbidden artifacts and secrets, run checks appropriate to the touched behaviour, and update accurate progress. Private memory and real environment files are never staged. Commit/push/release actions require implementation to have been explicitly resumed; this draft does not trigger them.

## 14. Decisions required before or during execution

Already settled: six larger phases; original product scope; fixed backend; two widget types; native local storage; sync conflict/retention policy; no Expo; website-open-only reminders; stable production signing identity; GitHub-only website code deployments.

Proposed execution decisions, pending review:

1. Use the six-phase order and existing high-level test seams above.
2. Treat pagination/snapshot/order contract gaps as Phase 2 work, not deferred release polish.
3. Require full agreed Spotify queue/context recovery; accept any reduced fallback only through an explicit scope decision.
4. Keep initial findings and planning documents local; publish implementation tickets only if requested later.
5. Finalize supported Linux distribution/version and Android device/version matrix from available test environments before promising support.

Environment facts are agent discovery tasks. User input is reserved for actual product tradeoffs, access only the user can provide, controlled phone/mailbox/reboot availability, and explicit scope changes. Use private secret entry tools when credentials are required; never request secret values in chat.

## 15. Ready-to-start handoff

Implementation can resume when the user explicitly asks to start after reviewing this plan. The next action is Phase 1 inventory and test-baseline setup, followed by its first complete account journey. It is not another broad request to build everything at once.

At each phase exit, update the requirement/evidence matrix, name unresolved failures precisely, and proceed to the next unblocked slice. Only Phase 6's exit permits the statement “the full implementation plan is complete.”

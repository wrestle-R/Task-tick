# Confirmed state and pending edits

Web and desktop persist the latest confirmed server items separately from local pending overlays. Reconciliation removes only acknowledged mutation IDs, advances the cursor monotonically, and accepts item snapshots only from responses at least as recent as the current cursor. It then reapplies remaining pending edits over the confirmed base.

This prevents a delayed acknowledgement from an older browser tab from overwriting newer accepted server data, or leaving an acknowledged overlay visible indefinitely. Existing local stores without a confirmed base request a full pull from cursor zero once, preserving their durable outbox.

Android serializes foreground/background sync within its native repository; native parity and cross-device schedules remain part of acceptance. The v2 protocol below adds bounded pull/history pages. The existing order protocol is unchanged.

## Paged sync v2

Clients opt in with protocol2. Each request accepts at most100 mutations and returns at most250 changed items and250 history entries. Item and history cursors use independent monotonic revisions. The first page captures upper revision bounds; subsequent requests traverse those bounds. Changes accepted later remain discoverable in the next pull. History starts from zero for each sync round so seven-day expiry is reflected in the resulting local view.

Clients upload each mutation batch once, request the remaining pages without resending that batch, and checkpoint only after the complete batch snapshot is collected. A later failure preserves checkpoints already saved and leaves remaining operations queued. Stable mutation receipts still protect a lost response. A nonadvancing response is rejected; a per-run request limit prevents an infinite pull. Read-page requests have a separate authenticated limit from mutation requests.

The legacy RPC remains available. Old clients keep the original response; new clients can consume it during a rolling deployment. Apply the additive migration before deploying the API. To roll back the API, keep the additive schema in place; rolling back schema is unnecessary for the original RPC. Avoid removing new RPCs while deployed API instances still depend on them.

Use the paged-sync integration suite against an authorized database environment. It tests the source migration inside a rollback transaction, including on an already-migrated database, and checks bounded pages, post-snapshot catch-up, replay and account isolation. Sequence gaps from rolled-back tests are expected.

# Confirmed state and pending edits

Web and desktop persist the latest confirmed server items separately from local pending overlays. Reconciliation removes only acknowledged mutation IDs, advances the cursor monotonically, and accepts item snapshots only from responses at least as recent as the current cursor. It then reapplies remaining pending edits over the confirmed base.

This prevents a delayed acknowledgement from an older browser tab from overwriting newer accepted server data, or leaving an acknowledged overlay visible indefinitely. Existing local stores without a confirmed base request a full pull from cursor zero once, preserving their durable outbox.

Android serializes foreground/background sync within its native repository; native parity and cross-device schedules remain part of acceptance. The v2 protocol below adds bounded pull/history pages. The order-v1 contract below specifies compatible rank operations.

## Paged sync v2

Clients opt in with protocol2. Each request accepts at most100 mutations and returns at most250 changed items and250 history entries. Item and history cursors use independent monotonic revisions. The first page captures upper revision bounds; subsequent requests traverse those bounds. Changes accepted later remain discoverable in the next pull. History starts from zero for each sync round so seven-day expiry is reflected in the resulting local view.

Clients upload each mutation batch once, request the remaining pages without resending that batch, and checkpoint only after the complete batch snapshot is collected. A later failure preserves checkpoints already saved and leaves remaining operations queued. Stable mutation receipts still protect a lost response. A nonadvancing response is rejected; a per-run request limit prevents an infinite pull. Read-page requests have a separate authenticated limit from mutation requests.

The legacy RPC remains available. Old clients keep the original response; new clients can consume it during a rolling deployment. Apply the additive migration before deploying the API. To roll back the API, keep the additive schema in place; rolling back schema is unnecessary for the original RPC. Avoid removing new RPCs while deployed API instances still depend on them.

Use the paged-sync integration suite against an authorized database environment. It tests the source migration inside a rollback transaction, including on an already-migrated database, and checks bounded pages, post-snapshot catch-up, replay and account isolation. Sequence gaps from rolled-back tests are expected.

## List order v1

An item carries one finite numeric `position`. Every client, collection widget and sidebar sorts by ascending position, then ascending canonical UUID string using ordinal comparison. This tie-break does not depend on locale or response/insertion order. Existing clients and RPCs retain their item schema; no whole-list replacement operation is introduced.

A move removes the dragged item before finding its destination neighbours. Normally it changes only that item's rank to a strictly interior midpoint, or a rank outside the first/last item. Equal ranks or exhausted floating-point spacing trigger a rebalance of the currently visible list to multiples of1024, followed by the requested order. The client persists every rank change and its stable mutation ID in one local state/outbox transaction. Android validates the affected items before committing; web/desktop use their serialized storage transaction. New items unknown to the moving client remain present, because moves never send an authoritative list of IDs.

The existing field conflict policy applies: later server-accepted position changes win on the same item; changes to other fields merge. Concurrent moves of different items both survive. A dense-rank rebalance can conflict with another rank edit and uses the same policy, rather than silently promising preservation of both intentions. Delivery of a large rebalance may span sync batches; its local write is atomic, and other devices converge after all accepted rank changes arrive. Deletion still wins. Completed/watched/trash views do not receive active-list drag updates.

Focused tests cover equal-rank permutations, removing the dragged neighbour, exhausted spacing, concurrent insertion and unrelated edits. The database protocol suite checks server acceptance order, field merging, retained inserts and idempotent move replay. Real adapter/native drag acceptance remains a separate gate.

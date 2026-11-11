# Confirmed state and pending edits

Web and desktop persist the latest confirmed server items separately from local pending overlays. Reconciliation removes only acknowledged mutation IDs, advances the cursor monotonically, and accepts item snapshots only from responses at least as recent as the current cursor. It then reapplies remaining pending edits over the confirmed base.

This prevents a delayed acknowledgement from an older browser tab from overwriting newer accepted server data, or leaving an acknowledged overlay visible indefinitely. Existing local stores without a confirmed base request a full pull from cursor zero once, preserving their durable outbox.

Android serializes foreground/background sync within its native repository; native parity and cross-device schedules remain part of acceptance. This change does not add bounded server pull pagination or replace the existing order protocol.

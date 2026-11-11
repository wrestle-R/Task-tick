# Spotify recovery contract

The local playback engine can now publish an additive `sequence` field with `uris` and `index` through its existing state response. The corresponding Spotify-Tui source change owns this contract. Existing clients ignore the field; helpers using it must run an engine containing the source change.

The Tick and Done helper persists that queue with its last confirmed track/position, volume, shuffle and repeat settings. It validates track URIs and queue bounds, restores via the existing play-sequence command, disables incompatible repeat mode before enabling the desired one, and seeks after confirmed playback. Invalid saved queues are rejected rather than silently replaced with another track. Stopped state cannot overwrite the recovery snapshot.

This covers queues owned by the local engine. It does not claim access to a queue controlled solely by an external Spotify device/provider. Actual engine shutdown/reboot restoration and provider-only context recovery remain acceptance gates.

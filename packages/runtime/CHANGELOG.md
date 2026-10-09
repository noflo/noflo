# Changelog

## [Unreleased]
### Added
- Initial package scaffold for `@noflo/runtime` (work document #28): the isomorphic FBP Protocol 2.0 runtime for NoFlo over Reticulum, superseding the `noflo-runtime-base`/`noflo-runtime-websocket` lineage with a Reticulum-only, protocol-2.0-only design
- `RuntimeServer.grantedFor()` and `RuntimeServer.canReceive()` accessors with an outbound capability map, letting transports filter broadcast fan-outs per context (work document #30)
- `ReticulumBinding` options `authorizeUnidentified` and `maxResources`, forwarded through `bindReticulum` (work document #30)
- `TelemetryProtocol` options `flushCeilingMs` (default 5 minutes) and `maxSubscriptionsPerContext` (default 32), with a `subscriptionlimit` event on exhaustion (work document #30)
- `GraphProtocol` option `maxKnownClocks` (default 1024) bounding the attacker-populated client clock map (work document #30)
- `assembleRuntime` options `permissions`, `capabilityPolicy`, and `limitationCode`, forwarded to the server core (work document #30)
- `RuntimeServer.resolveCapabilities()` — the one identity-based capability resolution path, consultable by transports; `authorize` is refactored onto it (work document #30)
- Baseline resource fetches now re-check the requester's identity-based capability decision (`GRAPH_READ`) on every fetch instead of serving to any linked peer holding the token — revocations bite the next fetch, and the token is reduced to addressing and integrity (work document #30)
### Fixed
- Security audit findings (work document #30): `0x27 CMD_COMP_INSTALL_REQ` now requires `COMPONENT_WRITE` and `0x10 CMD_CRDT_SYNC_REQ` requires `GRAPH_READ` — both were previously invokable by any peer, including fully denied ones, making the package-install hook reachable without authentication and the graph baseline fetchable without `GRAPH_READ`
- The server core now fails closed: contexts the transport never authorized are denied everything instead of falling back to the permissions store's default mask, closing the attacker-controlled pre-identification window and the DACAR bypass for peers that never identify (work document #30)
- Broadcasts no longer reach peers whose granted capabilities do not cover the frame (work document #30)
- The wire `entity_id` of a CRDT insert op is authoritative over a payload-supplied override (work document #30)
- Malformed hex identity/destination hashes fail loudly instead of silently resolving to zero-filled bytes (work document #30)
- `undecodable` event details carry at most a 256-byte diagnostic prefix of hostile bytes (work document #30)

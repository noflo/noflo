# Changelog

## [Unreleased]

## [2.0.0-alpha.7] - 2026-10-16

## [2.0.0-alpha.6] - 2026-10-16
### Added
- The `0x44 CMD_PROCESS_LIST_REQ` handler — the §8 process listing of the main graph's current epoch. Component kinds are declared data from the registry catalog (a node whose component the catalog does not know lists as `stub`, the unimplemented marker), and the execution state is network-scoped (enabled while the network runs) until per-process disable (`0x43`) is more than an engine gap. Placeholder nodes — no component, no process — are skipped, so one of them can never take the listing into wire silence

## [2.0.0-alpha.5] - 2026-10-16

## [2.0.0-alpha.4] - 2026-10-16
### Changed
- **The static permissions store is removed** — capability resolution always goes through the `capabilityPolicy` (DACAR is the native implementation), which is now required at construction. The advertised capability surface is enforced as the ceiling of every grant (granted ∩ advertised)
- `ReticulumBinding` loses `authorizeUnidentified`: an unidentified peer has no identity for the plane to evaluate
- The graph protocol is plane-aware: ops and syncs carry a plane_id; unknown non-main planes are materialized as ephemeral graph planes on first op; the main plane is nil
- The `0x02` auth response carries runtime metadata and the advertised capability ceiling alongside the granted mask
### Added
- `0x47 CMD_PACKET_SEND` handler: resolves the plane's exported inport and injects the packet via `network.addInitial`
- `0x48 CMD_GET_STATUS` handler: answers epoch, run state, uptime, and the advertised ceiling
- `0x16 CMD_PLANE_LIST` handler: answers the plane tree — main, ephemera, and subgraph planes registered at network build with deterministic `sg/…` ids, reconciled per build (work document #4 update #42: the plane tree follows the component's presence in the built graph)
- `0x17 CMD_OP_REJECTED` emission: structurally-rejected ops and permission denials surface to the client explicitly (silence never carries semantics)
- `TelemetryProtocol.observeHost()`: wire an ephemeral plane host's events into the telemetry stream, with the plane id carrying through to the emitted `0x32` chunks (events are grouped per source plane on flush, so an ephemeral plane's START/STOP/DATA are attributed to the plane, not the main plane)
- Subgraph planes: `GraphProtocol.registerSubgraphPlanes()` walks a built network and registers every subgraph instance anchored to its node id, with the parent chain mirroring the walk; `subgraphPlane()` resolves by anchor for telemetry's effective-plane attribution — events sourced inside a nested subgraph are attributed to the subgraph's plane, and the engine's internal subgraph path never travels the wire (update #42)
- Live `0x01 DATA` telemetry carries the §7 envelope `[src, tgt, value]` with refs from the event's socket — the same envelope the tracefile produces; bracket events keep their plain label payloads — the wire `0x02`/`0x03`
  event-type vocabulary renames to `BEGIN_BRACKET`/`END_BRACKET`, the
  brackets/streams they always were (update #42)
- `GraphProtocol.getPlane()`: public accessor for the execution protocol's multi-plane support
- The e2e fbp-spec interaction test: mint an ephemeral plane, build a fixture via CRDT ops, start via `0x40`, inject via `0x47`, observe via `0x32`, query `0x48`, tear down via `0x15` — with assertions for telemetry plane attribution and the `0x15` ack; plus a subgraph integration test pinning registration, `0x16` anchors, subgraph-attributed DATA chunks, and the `0x15` refusal
- Round-trip spec pinning the NoFlo core `Flowtrace` recorder's JSON state to the binary trace-file encoding (`assembleTraceFileFromRecorder`), and the duplicated event-vocabulary constants to equality between `@noflo/noflo` and `@noflo/fbp-protocol` (work document #23 update #2)
### Fixed
- `0x47 CMD_PACKET_SEND` answers `0x17 CMD_OP_REJECTED` with a reason on every rejection path (no running network, no plane model, no exported inport) instead of wire silence
- `0x26 CMD_COMP_SOURCE` answers with a nil source when the runtime holds no `readSource` hook, matching SPEC's "nil source when the runtime holds none" instead of staying silent
- `0x15 CMD_PLANE_DROP` acknowledges the requesting context (echo to requester only); a failed ephemeral-plane start records FAILED/ERROR telemetry attributed to the plane
- `0x15 CMD_PLANE_DROP` refuses subgraph planes with `0x17` and cascades to subgraph descendants when an ephemeral plane drops; client-minted ephemeral ids using the reserved `sg/` prefix are rejected with `0x17` on sync and ops (update #42)
- Rejections carry `REASON` codes (work document #4 update #43, from the MicroFlo constrained-runtime port): `0x47` paths answer `INVALID_STATE`/`UNKNOWN_TARGET`, reserved-id and subgraph-plane refusals answer `UNSUPPORTED`, and engine-unsupported commands (pause/step/breakpoints on engines without them) now answer `0x17 UNSUPPORTED` to the requesting context instead of wire silence — the telemetry ERROR event stays for other subscribers; dropping the main plane (nil plane id) is refused rather than acknowledged

## [2.0.0-alpha.3] - 2026-10-10
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

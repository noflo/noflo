# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.0.0-alpha.7] - 2026-10-16
### Added
- The client-side schema store (work document #37 phase 2): `SchemaCache` fetches bodies over `0x28`/`0x29` and verifies every body against its digest before caching — a poisoned body is discarded and treated as absent. Closure completeness is client-checked against the local cache: a fetched root is unusable while any referenced digest is missing, and follow-up requests target only the missing digests. `RuntimeClient.syncSchemaBodies()` collects the schema digests the synced catalog's details reference and fetches the missing ones with closure bundling; the `UiEventSurface`'s `components` event now carries `schemaBodies` alongside the catalog. A runtime without a schema table answers all-nil and the store stays empty — the degradation ladder, not an error

- Initial package: `@noflo/runtime-client`, the FBP Protocol 2.0 client library over Reticulum (work document #29 phases 1–5)
- `discoverRuntime()` — announce-based runtime discovery through the §3 app_data decode
- `connectRuntime()` — link establishment, client identity, and the `0x02` auth handshake with the capability mask
- `RuntimeClient` — frame send/receive, the graph mirror (epoch handshake `0x10`–`0x12`, baseline fetch, `0x14` op consumption as `op` events), plane listing (`0x16`), and status (`0x48`); extends `EventTarget`
- `RegistryCache` — the Two-Step Cache consumer: local registry-hash sync, `0x21`–`0x24` manifest and detail flow, sig-hash-keyed detail caching
- `TelemetryClient` — `0x30` pubsub subscriptions, `0x32` chunk decoding with delta-to-absolute timestamps, client-side event-type filtering
- `ExecutionClient` — run control (`0x40`), breakpoints (`0x41`/`0x42`), per-process control (`0x43`), process listing (`0x44`/`0x45`), edge capacity (`0x46`), and packet injection (`0x47`)
- `UiEventSurface` — the UI event vocabulary over a standard `EventTarget`: `graph`, `graphchanged`, `components`, `packets`, `processes`
- `getSource(name)` / `setSource(name, source)` — the `0x26`/`0x25` component source read and atomic write
- `watch(session, options)` — subscribe to the telemetry stream and deliver decoded, filtered chunks; `capture(session, options)` — capture the `0x32` stream into a `0xF0` tracefile; `replayTraceFile(bytes, options)` — offline playback through the same decode path (phase 3)
- `runControl(session, action, planeId)`, `sendPacket(session, packet)`, `setBreakpoint`/`clearBreakpoints`, `processes(session)`, `setProcessState(session, nodeId, action)`, `setHwm(session, highWaterMark)` — the execution-control command surface (phase 3)
- `RuntimeClient` re-exports: the client now carries an `ExecutionClient` instance at `client.execution` and re-emits inbound `0x32` chunks as typed `telemetry` events
- `RuntimeClient` gains a CRDT identity: a `clientId` (constructor option or property) and a `logicalClock` counter, stamped onto outgoing `0x14` ops by `sendGraphOp` — emitting semantic ops no longer requires touching CRDT bookkeeping
- Inbound `0x17 CMD_OP_REJECTED` frames are decoded and re-emitted as `oprejected` events carrying `{ rejectedCmd, planeId, detail }` — the runtime's explicit "no" with its reason, per work document #4 updates #34/#35
- `nextFrame()` waiters carry a `cancel()` so abandoned sync-loop waiters never reject into the void after their consumer left
- `discoverRuntime()` recalls a runtime already known to the transport's destination cache when a live path exists — announce echo does not reliably reach late-joining clients within a shared rnsd instance. A cached destination on a stale path solicits a fresh announce via a path request instead; `solicit: true` forces that flow (used when a cached path failed to link). The cache is read only after the transport state's async load settles

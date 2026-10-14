# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Added

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

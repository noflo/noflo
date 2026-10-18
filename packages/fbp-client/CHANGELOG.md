# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
### Fixed
- The CLI's flowtrace event-name table covered only the first seven event types, so later events printed as raw numbers in `watch` and `replay` output — a stub component's `0x09 STUB_ERROR` would render as `9` instead of its name. The table now covers the full shared `EVENT_TYPE` vocabulary (work document #19)

## [2.0.0-alpha.11] - 2026-10-18

## [2.0.0-alpha.10] - 2026-10-17

## [2.0.0-alpha.9] - 2026-10-17

## [2.0.0-alpha.8] - 2026-10-17

## [2.0.0-alpha.7] - 2026-10-16
### Added
- The guard advisory on the authoring paths (work document #37 §3.1): `add-iip` and `send` compare the value against the target port's in-band guard from the synced signature before shipping, and warn to stderr on a violation — advisory only, the value goes out regardless; the runtime records the violation diagnostic-only on its side. Tier B hard validation at injection stays deferred: a full JSON Schema validator is a large dependency for the CLI, and that enforcement properly lives in the noflo-ui editor (work document #57)
- `fbp-client schemas`: the schema bodies the synced catalog's details reference, fetched over `0x28`/`0x29` and digest-verified (work document #37 phase 2); each entry carries the reference id, when one exists, and the verified body. A runtime without a schema table answers all-nil and the listing stays empty

- Initial package: `@noflo/fbp-client`, the command-line tool and scriptable front for FBP Protocol 2.0 runtimes (work document #34 phases 1–2)
- `connectSession()` — discovery through announce app_data plus link establishment and the `0x02` auth handshake
- `status()` — `0x48` run state, uptime, epoch, and granted-vs-advertised capability masks
- `planes()` — the `0x16` plane listing
- `graph()` — the mirrored graph as a canonical JSON document, or as `.fbp` DSL source via `graph --format fbp` (phase 5's `toFBP()` writer; `dot` lands with a later phase)
- `components()` / `component(name)` — the Two-Step Cache registry catalog and single entries with cached signatures (phase 2)
- `getSource(name)` / `setSource(name, source)` — the `0x26`/`0x25` component source read and atomic write (phase 2)
- `fbp-client` binary with `scan`, `status`, `planes`, `graph`, `components`, `component`, and `source get|set` subcommands, `--json` machine-readable output, and rnsd TCP interface wiring (`--interface host:port`)
- Phase 3: `watch` (live decoded telemetry stream with `--types` filtering), `trace <file>` (0xF0 tracefile capture, `--duration` window), offline `replay <file>` (no runtime connection needed), `run`/`pause`/`step`/`stop`, `send <port> <data>` (JSON payload injection), `breakpoint set|clear`, `processes`, `enable|disable <id>`, and `hwm <n|nil>` subcommands
- Phase 4: the graph modification surface — `addNode`/`addEdge`/`addIip`/`addExport`/`addGroup`/`removeEntity`/`setMetadata` command functions over the `0x14` op vocabulary (INSERT_*, TOMBSTONE, UI_METADATA), with entity ids minted when not given and outcomes confirmed against the runtime's epoch via the mirror resync; `applyGraphOp(session, op)` exposes the same flow for raw ops. On named planes, where no baseline resource exists to resync against, confirmation is the bounded rejection wait (`confirmMs`, default 5s) short-circuited by a refusal
- Rejection UX: `OpRejectedError` carries the decoded `0x17` rejection (`rejection.detail` with the echoed op identity and reason); `describeRejection()` renders numeric reason codes via the exported `REASON_NAMES` vocabulary or the runtime's free-form reason string — a refused op surfaces *why*, not just that it failed
- `connectSession()` gains a `clientId` option: the caller's CRDT identity, required for the modification commands
- The binary gains the modification subcommands `add-node`, `add-edge`, `add-iip`, `add-export`, `add-group`, `remove`, and `set-metadata` with `--plane`, `--id`, and `--metadata <json>` options, and prints rejection reasons with exit code 1
- Identity persistence: the binary stores its Reticulum identity at `~/.fbp-client/identity.key` (`--identity <file>` or `FBP_CLIENT_IDENTITY` override) with fail-loud load semantics, and derives the stable CRDT client id from it, so graph ops stay attributable across sessions
- Transport state persistence: the binary also persists the Reticulum node identity and learned destinations under `<identity dir>/state` and flushes them before shutdown, so only the first run needs to hear an announce — later runs connect from the destination cache (`FileStorageAdapter`)
- `connectSession()` marks the runtime destination contacted on a successful link (so the transport persists it) and retries once with solicited discovery — a path request plus announce wait — when a cached path fails to link
- Fixed: the modification subcommands rendered every successful edit as `no change` — the result-reporting helper received the session object instead of the modification result. Found by the live end-to-end verification of this document's hello-world editing session; the unit suite only exercised the binary's `--help` path
- `spec/e2e.js` — the hello-world editing session as a self-contained end-to-end suite: the spec assembles a `@noflo/runtime` with real components and the committed `fbp-client` binary drives it as spawned child processes (scan, the full modification sequence, `graph --format fbp`, rejection UX, status). The runtime hosts a `TCPServerInterface` on an ephemeral loopback port, so no rnsd is needed for the sequential session. The watch-and-run flow needs two concurrent clients, which a leaf-mode Reticulum cannot serve simultaneously — that test runs only with `RUNTIME_E2E_RNSD` pointing at a transport node

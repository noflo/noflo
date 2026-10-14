# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Added

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

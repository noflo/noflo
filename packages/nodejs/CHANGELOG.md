# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
### Changed
- Ingested into the `noflo/noflo` monorepo as `@noflo/nodejs` (work document #31): package renamed and versioned in the monorepo lockstep, git history preserved via `git filter-repo`. The 1.x runtime stack — `noflo-runtime-base`/`-websocket`/`-webrtc` over the fbp-protocol 1.x wire, WebSocket/WebRTC serving, secret-based auth, flowhub-registry pings, mDNS advertisement — is not carried forward. The modernized host re-architects around `@noflo/runtime` and FBP Protocol 2.0 over Reticulum
- Configuration moves from `flowhub.json` to layered `.noflo.json` (user-level, project-level, env, CLI, generated), with the mesh-facing surface replacing the socket-era options: the runtime's Reticulum identity is generated on first run and persisted in the transport storage, mesh attachment prefers the local shared Reticulum instance and falls back to AutoInterface (plus an optional rnsd uplink), and `--host`/`--port`/`--tls-*`/`--secret`/`--signaller`/`--mdns`/`--registry`/`--open` are gone
- Authorization is Dacar: the host evaluates grants from the node store the `dacar` CLI maintains (`DACAR_HOME`, default `~/.dacar`) — trust anchors, salts, and grants never appear in the host configuration, and the legacy static permission maps are gone. With no Dacar store the host runs fully deny-closed with a warning; `SIGHUP` re-reads the grant store after an external `dacar sync`
### Added
- Batch mode owns its shutdown: on network end the host stops itself and flushes the trace before the CLI exits, so an immediately-finishing graph cannot race the exit path
- Trace recording writes the streamable FBP Protocol 2.0 trace file format (`.flowtrace/*.trace`) via the core `Flowtrace` recorder and `assembleTraceFileFromRecorder`, flushed on network end, `SIGTERM`/`SIGINT`, and `SIGUSR2`
- Process errors now surface both in debug output and as `0x04 ERROR` trace events
- Programmatic entry `run(graph, options, preStart)` returning a `HostHandle` (network, mesh binding, trace recorder, stop)
- `README.md` rewritten for the 2.x host: configuration reference, mesh attachment, the Dacar grant workflow (granting access on the admin machine and delivering deltas to the runtime machine), signals, and the 1.x migration notes

## noflo-nodejs 0.15.3 (12-01-2024)

* Now using the community version of NoFlo UI by default

## noflo-nodejs 0.15.2 (29-12-2022)

* Options are now passed to the preStart callback when used as a library

## noflo-nodejs 0.15.1 (14-01-2021)

* Fixed graph properties when auto-saving

## noflo-nodejs 0.15.0 (14-12-2020)

* Updated to the new Promise-based NoFlo 1.4 APIs

## noflo-nodejs 0.14.0 (25-11-2020)

* Updated to the new built-in Flowtrace functionality in NoFlo 1.3.0

## noflo-nodejs 0.13.1 (16-11-2020)

* Compatibility with the TypeScript version of fbp-graph

## noflo-nodejs 0.13.0 (02-10-2020)

* Added support for WebRTC protocol as an alternative to WebSockets

## noflo-nodejs 0.12.5 (24-09-2020)

* Graphs created by fbp-spec for test execution purposes no longer get auto-saved

## noflo-nodejs 0.12.4 (23-09-2020)

* Specs sent by IDE via `setSource` are no also auto-saved

## noflo-nodejs 0.12.3 (23-09-2020)

* Graph names are used without namespace when auto-saving

## noflo-nodejs 0.12.2 (17-09-2020)

* Added auto-saving support for components written in TypeScript

## noflo-nodejs 0.12.1 (02-09-2020)

* Modified SSL warnings to be written to STDOUT instead of STDERR to improve operation with fbp-spec

## noflo-nodejs 0.12.0 (02-09-2020)

* Switched to the NoFlo 1.2 "network drives graph" mode for more accurate error handling
* Added support for discovering the noflo-nodejs runtime via mDNS

## noflo-nodejs 0.11.1 (26-02-2019)

Bugfixes:

* noflo-nodejs library mode also subscribes to runtime now, so that `autoSave` mode works

## noflo-nodejs 0.11.0 (25-02-2019)

New features:

* noflo-nodejs is now much easier to embed in existing Node.js applications as a library
* Added `--auto-save` option to enable saving edited graphs and components to disk automatically

## noflo-nodejs 0.10.1 (23-03-2018)

New features:

* Added `--open` option to control whether to open the runtime in user's IDE when started. Defaults to `true`.

## noflo-nodejs 0.10.0 (22-03-2018)

New features:

* Changed  configuration file `flowhub.json` to be automatically saved from command-line arguments, persisting settings like runtime ID and secret between runs
* Added support for encrypted WebSockets with `--tls-key` and `--tls-cert` options
* When Flowtracing is enabled with the `--trace` option, uncaught exceptions also trigger the trace to be saved
* Uncaught exceptions are now printed in a more readable format, with a truncated stack trace
* The runtime registry URL can now be configured with the `--registry` option
* Runtime registry pinging can be disabled with `--registry-ping=0`
* If running on a desktop machine, the runtime will be automatically opened in user's default browser
* Added compatibility with FBP Protocol version 0.7

Removal of deprecated features:

* Removed deprecated `noflo-nodejs-init` tool
* Removed deprecated `--register` option. Your runtime can be registered with Flowhub by opening it there

Internal changes:

* Ported noflo-nodejs from CoffeeScript to ES6

## noflo-nodejs 0.9.0 (05-11-2017)

* Compatibility with NoFlo 1.x

## noflo-nodejs 0.8.3 (12-05-2017)

Deprecations

* `noflo-nodejs --register` is **deprecated**, in favor of `flowhub-registry-register` or accessing the live URL.
Support will be removed in 0.9.x.

Breaking changes

* Registration with Flowhub is no longer done by default. Must be enabled using `--register true`

Additions

* All options/features are now available on `noflo-nodejs`, so `noflo-nodejs-init` can be skipped
* Support pinging Flowhub registry using option `--ping true` or envvar `NOFLO_RUNTIME_PING=true`
* Support specifying runtime id using `NOFLO_RUNTIME_ID` envvar
* Support passing runtime `id` in live URLs
* Now gives a warning when no `secret` is passed, since will not be able to connect over WebSocket (no permissions)
* Supports Flowhub "Edit as Project" feature, by passing component namespace via FBP protocol

Bugfixes:

* Fixed --version being called --0.8.x
* Fixed --permissions not having effect on commandline

## noflo-nodejs 0.8.1 (2017-03-01)

* Updated to **NoFlo 0.8.x**

## noflo-nodejs 0.7.0 (2016-03-31)

* Updated to **NoFlo 0.7.x**

## noflo-nodejs 0.6.1

* Support for [Flowtrace](https://github.com/flowbased/flowtrace) when using `--trace` option.
* For long-running programs, flowtrace dumps can be triggered via `SIGUSR2` Unix signal

## noflo-nodejs 0.5.0

* Implements FBP protocol version 0.5. Use of a runtime `secret` is now enforced
* Support for `--debug`, `--verbose` and `--capture-exception` flags to tune logging behavior.
* Support for `--host` and `--port` options, with defaults. Port also respects PORT envvar.
* Support for multiple levels of `permissions` based on provided secret and configured
* Support for a `--batch` mode, where process exists when graph stops. Intended to replace the `noflo` executable
* Several FBP protocol fixes from noflo-runtime-base 0.5.x. Should now work with [fbp-spec](https://github.com/flowbased/fbp-spec)
* Registration with Flowhub registry is optional, just warning

## noflo-nodejs 0.0.6

* ...

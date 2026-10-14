# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Added

- Initial package: `@noflo/fbp-client`, the command-line tool and scriptable front for FBP Protocol 2.0 runtimes (work document #34 phase 1)
- `connectSession()` — discovery through announce app_data plus link establishment and the `0x02` auth handshake
- `status()` — `0x48` run state, uptime, epoch, and granted-vs-advertised capability masks
- `planes()` — the `0x16` plane listing
- `graph()` — the mirrored graph as a canonical JSON document, or as `.fbp` DSL source via `graph --format fbp` (phase 5's `toFBP()` writer; `dot` lands with a later phase)
- `fbp-client` binary with `scan`, `status`, `planes`, and `graph` subcommands, `--json` machine-readable output, and rnsd TCP interface wiring (`--interface host:port`)

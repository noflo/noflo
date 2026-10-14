# @noflo/runtime-client

FBP Protocol 2.0 client library over Reticulum (work document #29). The
client of [`@noflo/runtime`](../runtime) — holds a `GraphModel` mirror of
the runtime's wire state, converges via `0x14` ops in both directions,
runs the epoch handshake, and fetches baselines when stale.

Isomorphic: plain ESM, no Node builtins — consumable in browsers under
the no-build contract. Server-side runners (the CLI, tests) provide their
own transport from `@reticulum/node`.

## License

EUPL-1.2

# @noflo/runtime

FBP Protocol 2.0 runtime for NoFlo over Reticulum (work document #28): wires the 2.x engine to the mesh, on servers and in browsers. The server side of [`@noflo/runtime-client`](../runtime-client).

A runtime announces itself on the mesh (`fbp.runtime` announce app_data), establishes zero-trust links with clients, and serves the protocol surface: the CRDT graph synchronization (epoch handshake, baseline snapshots, bidirectional `0x14` ops), the Two-Step Cache component registry, execution control and telemetry, and DACAR capability grants per link.

Isomorphic: plain ESM, no Node builtins in the protocol handlers — the Reticulum transport is injected, so the same runtime serves over `@reticulum/node` on servers and over browser transports.

## License

EUPL-1.2

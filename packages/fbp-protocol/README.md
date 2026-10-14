# @noflo/fbp-protocol

FBP Protocol 2.0 over Reticulum (work document #4): wire-format constants and codecs shared by [`@noflo/runtime`](../runtime), [`@noflo/runtime-client`](../runtime-client), and the [`@noflo/fbp-client`](../fbp-client) CLI.

Covers the whole opcode vocabulary — CRDT graph synchronization (`0x10`–`0x17`), the component registry's Two-Step Cache (`0x20`–`0x26`), telemetry pubsub and the `0xF0` flowtrace capture format, execution control (`0x40`–`0x48`) — plus the announce app_data decode and the MsgPack frame primitives. Every codec encodes and decodes one frame type; silence never carries semantics.

Isomorphic: plain ESM, no Node builtins — consumable in browsers under the no-build contract.

## License

EUPL-1.2

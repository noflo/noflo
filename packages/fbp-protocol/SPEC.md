# FBP Protocol 2.0 — Specification

SPDX-License-Identifier: CC0-1.0

To the extent possible under law, the copyright holders of this specification
have waived all copyright and related or neighboring rights to this document
under the Creative Commons CC0 1.0 Universal public domain dedication. This
specification is a public reference: anyone may implement, copy, modify,
publish, use, and distribute it freely, for any purpose, without conditions
or attribution requirements. The reference *implementation* in this package
is licensed separately under the EUPL-1.2 (see `LICENSE`).

Status: draft, tracked as work document #4 on the noflo project board
(`rns://` rngit repository of the noflo/noflo monorepo). The wire format is
not yet frozen; items explicitly marked **open** must be decided before
freeze. Changes to this document that affect byte layouts are protocol-visible
and must land together with their implementation and AsyncAPI counterparts.

## 1. Core architecture & philosophy

FBP Protocol 2.0 is a decentralized, asynchronous runtime protocol designed
for peer-to-peer visual programming environments (like NoFlo and MicroFlo)
operating over the Reticulum Network Stack (RNS). It rejects the assumption
of high-bandwidth, always-on cloud infrastructure. Built on permacomputing
principles, it treats networking as a local, sovereign fabric governed by
hostile physical constraints (low bandwidth, intermittent power, and high
latency).

Core design principles:

- **Protocol defines shape; physics dictates policy.** Wire formats
  (MessagePack) and state synchronization are strictly standardized.
  Execution frequency, chunk limits, and transmission intervals are never
  hardcoded — they are left entirely to the runtime's local physical context
  (solar availability, battery state, link bandwidth).
- **Zero-trust identity.** Cryptographic verification is delegated entirely
  to Reticulum's built-in `link.identify()`, eliminating application-layer
  handshakes and protecting user identities from passive mesh surveillance.
- **Logless synchronization.** Supports both fully persistent server runtimes
  and SRAM-constrained microcontrollers via a unified Micro-Epoch sync model.
- **Byte-frugal framing.** All messages use flat, positional MessagePack
  (MsgPack) arrays. Keyed dictionaries (JSON-RPC style) are banned to
  preserve radio airtime.

## 2. Protocol versioning

The protocol generation is a single unsigned integer, `PROTOCOL_VERSION = 2`,
advertised in two places:

- **Announce app_data** (see §3): a client scanning announces learns
  compatibility before spending link-establishment airtime and Proof-of-Work
  on an incompatible runtime.
- **`0x02 CMD_AUTH_RESPONSE`** (see §4): the in-link truth for stale or
  cached announces.

The version integer is a protocol generation, bumped only on breaking wire
changes. Additive evolution (new event enums, new commands) does not bump it.
A runtime serves exactly its current generation; clients link only if their
own supported envelope contains the announced version. A `[min, max]`
supported-range alternative was considered and rejected: it buys smoother
rolling upgrades at the cost of extra bytes and dual-generation serving logic
in every runtime, including SRAM-constrained microcontrollers.

The protocol ships with a maintained AsyncAPI document from the first frozen
release: one channel per command code with explicit direction, payloads
described as fixed-arity positional arrays mirroring the MsgPack wire format,
per-channel capability-mask requirements, and a transport section describing
the RNS bootstrap (announce app_data schema and the `0x02` handshake), since
AsyncAPI has no native RNS binding. No wire-format change lands without its
AsyncAPI counterpart in the same change set. The document lives at
`asyncapi.json` next to the implementation, carries the same CC0-1.0
dedication as this specification, and is machine-verified against the codecs:
its test suite decodes every wire example through the real encoders and
decoders, re-encodes byte-for-byte, and checks one-to-one parity between the
channel table and the command constants.

## 3. Transport: announce app_data

Runtimes announce under a stable RNS destination aspect. The announce
app_data carries the version advertisement and connection coordinates as
flat positional MsgPack (the earlier `fbp-conn-[Base64Encoded_JSON]`
bootstrap string was rejected as contrary to the byte-frugality rule: keyed
JSON, Base64 and hex overhead):

```
app_data = msgpack([ protocol_version, destination_hash_raw16, node_name ])
```

- `protocol_version` (uint) comes first, so a scanner can reject an
  incompatible announce after decoding a single fixint.
- `destination_hash_raw16` is the raw 16-byte destination hash (no hex
  string, no JSON quoting).
- `node_name` is a MsgPack string. The whole payload stays far under the
  128-byte announce app_data limit.

The destination aspect is the discovery filter in RNS; app_data is opaque
binary. The aspect name is NOT versioned (e.g. `fbp.conn.v2` was rejected):
versioning the aspect would force re-announcing under a new name on every
major bump and fragment discovery. The aspect itself is pinned as
**`fbp.runtime`** (`ANNOUNCE_ASPECT` in the reference implementation):
named for the protocol rather than any single runtime — NoFlo, MicroFlo,
and other FBP runtimes share one discovery namespace.

## 4. Transport & identity (0x00 – 0x0F)

Connections are established over Reticulum Links, normally discovered via
the announce app_data (§3), but links may also be established from cached or
relayed destination hashes without a recent announce. Auth is handled
entirely by the transport layer (`link.identify()`); the payload carries no
secrets.

**`0x02` CMD_AUTH_RESPONSE** — unilaterally sent by the runtime immediately
after Reticulum fires the `link_established` event with a verified identity.
The runtime maps the identity against its DACAR capability plane and filters
the result through its advertised technical surface: the granted mask is
what the peer may exercise, and the advertised mask is the ceiling —
together they tell the client whether a denial is a permission issue or an
unsupported feature (external review, update #35: the
`allCapabilities` vs `capabilities` distinction).

- Format: `[0x02, protocol_version, granted_mask, limitation_code, runtime_metadata, advertised_mask]`
- Types: `[uint8, uint8, uint8, uint8, map, uint8]` — `runtime_metadata` is a free-form map identifying the runtime kind (e.g. `{ type: "noflo-nodejs", label: "...", version: "..." }`), the `runtime:runtime` equivalent from 1.x.
- The `granted_mask` is what this peer may exercise; `advertised_mask` is the runtime's full technical surface.

Capability mask (bitwise):

| Bit   | Capability       |
| ----- | ---------------- |
| `0x01` | `GRAPH_READ`     |
| `0x02` | `GRAPH_EDIT`     |
| `0x04` | `METADATA_SYNC`  |
| `0x08` | `TELEMETRY_READ` |
| `0x10` | `COMPONENT_READ` |
| `0x20` | `COMPONENT_WRITE` |
| `0x40` | `LIFECYCLE_CTRL` |
| `0x80` | `ADMIN`          |

Limitation codes:

| Code   | Meaning                |
| ------ | ---------------------- |
| `0x00` | Full access            |
| `0x01` | Hardware constrained   |
| `0x02` | Permission denied      |
| `0x03` | Link saturated         |
| `0x04` | Concurrency lock       |

## 5. CRDT graph synchronization (0x10 – 0x1F)

Graph mutation relies on CRDT-style positional operations flowing both
directions — runtime-initiated graph changes converge to connected clients
via the op log, so the 1.x limitation of runtime→UI commands being ignored
is structurally absent.

**Plane addressing.** Every command in this block carries a `plane_id` —
an identifier for the graph instance the command targets. `nil` addresses
the runtime's main graph. Client-minted ids open **ephemeral planes**:
the runtime materializes a fresh graph model on first sync/op addressed
to the id, and the plane exists until explicitly dropped with `0x15` or
the runtime restarts. Ephemeral planes are the remote fbp-spec runner's
fixture mechanism — one plane per suite, cases run inside it, dropped
after. Subgraph instances are anchored to their node id in the parent
plane and are materialized as planes when the component instantiates
(their tree position is derivable from the parent chain in the `0x16`
listing); lifecycle commands never target them — they follow the parent
(update #28's lifecycle matrix).

**`0x10` CMD_CRDT_SYNC_REQ** — client requests state sync:
`[0x10, plane_id, epoch_id, { "client_a": 15 }]` (map of client → logical clock; `plane_id` nil = main).

**`0x11` CMD_CRDT_UP_TO_DATE** — epochs match; no delta transfer needed:
`[0x11, plane_id, epoch_id]`. The reply names the plane and its epoch so
an up-to-date client learns what it is synced to (update #26).

**`0x12` CMD_CRDT_STALE_EPOCH** — forces the client to fetch a baseline
snapshot via the Reticulum Resource API:
`[0x12, plane_id, new_epoch_id, rns_resource_hash]`. The plane id names
the plane the stale epoch belongs to. For ephemeral planes the baseline
is whatever state the plane's model holds — the client built it from ops.

**`0x14` CMD_CRDT_UPDATE** — positional graph operation:
`[0x14, plane_id, client_id, logical_clock, op_type, entity_id, payload]`.

**`0x15` CMD_PLANE_DROP** — drop an ephemeral plane:
`[0x15, plane_id]`. Stops the plane's network if one is running and
discards its state wholesale — the fbp-spec runner's one-command fixture
teardown. The main plane is not droppable: nil is rejected. Subgraph
planes follow their component's presence in the graph and are never
dropped via a lifecycle command. Requires `LIFECYCLE_CTRL`.

**`0x16` CMD_PLANE_LIST** — list the runtime's graph planes:
request `[0x16]`; the runtime answers on the same opcode with
`[0x16, [[plane_id, kind, parent_plane, node_id, component_name, name], ...]]`.
Every running graph instance is a plane — the main graph, each subgraph
instance anchored to its node id, and client-minted ephemera. The
component name resolves the plane to its catalog definition. Requires
`GRAPH_READ`.

**`0x17` CMD_OP_REJECTED** — the runtime's explicit "no":
`[0x17, rejected_cmd, plane_id, detail]`. Permission denials per plane,
Dacar-evaluation refusals, and structurally-rejected graph operations
alike. For rejected `0x14` operations the detail carries
`{ client_id, logical_clock, entity_id, reason }` so the client can
revert the op in its mirror and the changeset model holds. Sent
runtime → client whenever an operation is refused — silence never carries
semantics (the `0x21` rationale, generalized). Always deliverable.

Op types (`op_type`) — the mapped projection of the changeset reference
model is total: every structural entity kind of the graph model has an
insert op, removals share the tombstone, and modify projects to
tombstone + insert:

| Code   | Operation                                          | Payload                                                |
| ------ | -------------------------------------------------- | ------------------------------------------------------ |
| `0x01` | Insert node                                         | `{ component, metadata? }`                              |
| `0x02` | Insert edge                                         | `{ from, to, metadata? }` — port refs `{ node, port, index? }` |
| `0x03` | Insert IIP                                          | `{ to, data, metadata? }`                               |
| `0x04` | Tombstone                                           | nil — kind resolved from the entity's registration      |
| `0x05` | UI metadata (dropped by constrained nodes)          | the metadata map; nil `entity_id` = graph-level         |
| `0x06` | Insert export                                       | `{ direction, public, internal, metadata? }`            |
| `0x07` | Insert group                                        | `{ name, nodes, metadata? }`                            |

The payload is the entity definition without its id — `entity_id` carries
it. The op taxonomy is an explicitly-mapped projection of the changeset
reference model owned by the noflo-ui materialization work (board
`rns://3ea5aad068a337670f5bb8073226adb4/public/noflo-ui`, WD #43): node,
edge, IIP, group and export add/remove/modify ops with per-op change
classes `structural`/`semantic`/`positional`. Modify is encoded as
tombstone + insert at the wire level — a wire-level encoding detail, never
the semantic unit; consumers reason in changeset ops. Node renames
likewise project at the changeset→protocol boundary: the wire carries
tombstone + insert of the renamed entity and its rewritten references, not
a rename op. The mapping table is part of the AsyncAPI release gate.
Positional/UI metadata is droppable by constrained nodes, corresponding to
the changeset engine's `positional` class that auto-resolves and never
blocks merges.

Edge-level high-water marks travel as edge metadata inside the `0x14`
payload (the `highWaterMark` field of the native graph model's edge
metadata), so inserts carry them and a change projects to tombstone +
insert per the mapping above — modify stays a wire-level encoding detail,
never the semantic unit (WD #4 update #8). The runtime-global high-water
mark is runtime configuration, not graph state, and is set with `0x46
CMD_HWM_SET` (§8).

## 6. Component registry & code management (0x20 – 0x2F)

Component registries use a **Two-Step Cache** model to avoid saturating
links with redundant port signatures: the manifest step carries only
`sig_hash` values per component; clients request details only for unknown
hashes. Source code updates strictly use atomic, full-file overwrites to
maintain deterministic runtime hashing, avoiding CRDT text resolution at the
engine level. (The CRDT-plane transport of source edits stays span-based in
noflo-ui; the projection between the two planes happens at the
changeset→protocol boundary.)

**`0x20` CMD_COMP_SYNC_REQ** — client requests registry sync:
`[0x20, local_registry_hash]`.

**`0x21` CMD_COMP_UP_TO_DATE** — the client's `local_registry_hash` matches
the runtime's; no manifest follows: `[0x21]`. Mirrors the graph block's
`0x11`: the runtime always answers a `0x20` request, with silence never
carrying semantics, so the request/response pairing stays unambiguous even
on an otherwise-quiet link.

**`0x22` CMD_COMP_MANIFEST** — registry manifest:
`[0x22, new_registry_hash, { "math/Add": ["sig_hash_1", "elementary"], ... }]`.
Each entry is the positional `[sig_hash, kind]` tuple: the manifest carries
the declared component kind (see below) and is valid with a signature and no
source — top-down design (#593) means a declared
signature-without-implementation is valid state, not an error. Clients never
infer kind from absence of source; an entry whose kind is not in the shared
vocabulary is a malformed frame.

**`0x23` CMD_COMP_DETAIL_REQ** — client requests only unknown definitions:
`[0x23, ["math/Add"]]`.

**`0x24` CMD_COMP_DETAIL_RES** — component definitions:
`[0x24, { "math/Add": { "type": "elementary", "in": [...], "out": [...] } }]`.
Succeeds for stubs, answering from the signature. Each component object
carries its declared kind in `type` and its ports as MsgPack maps. A port map
carries the full publish-time manifest port field set (WD #25): `id` (the
manifest's `name`), `type` (datatype), plus the optional `addressable`,
`description`, `required`, and `control` (inports only) — absent optional
fields are omitted from the map to save airtime. A wire signature, a manifest
signature, and a sidecar signature are the same data. The `type` field
carries the component kind declared in the manifest; clients never infer
kind from absence of source.

**`0x25` CMD_COMP_WRITE** — atomic full-source update:
`[0x25, component_name, source_string_or_rns_hash]`. For sources over 500
bytes, clients SHOULD pass a Reticulum Resource hash instead of a raw string.
A source write to a previously stub-only entry implements it while the
signature stays unchanged — source and signature are orthogonal.

**`0x26` CMD_COMP_SOURCE** — read a component's source from the runtime:
request `[0x26, component_name]`; the runtime answers on the same opcode with
`[0x26, component_name, source]` — nil source when the runtime holds none
(native or hardware components). The read counterpart of `0x25` (external
review, update #35: pulls source from embedded devices, syncs a project
back). Requires `COMPONENT_READ`.

**`0x27` CMD_COMP_INSTALL_REQ** — dynamic ES module injection via HTTP, npm,
or RNS: `[0x27, package_uri]`. Third-party libraries MUST be compatible with
EUPL-1.2. With the ecosystem component catalog (WD #26), the `package_uri`
resolves through the catalog's npm/JSR/version/hash provenance fields, so a
runtime-installed library records the same package/version/hash the catalog
and the client's project state carry.

**Component kind vocabulary.** One enum on every surface — publish-time
manifests (WD #25), loader sidecar declarations, `0x20`/`0x22` manifest
entries, `0x24` details, and process listings:

- `elementary` — a code module implements the component
- `subgraph` — a graph file wired as a component
- `stub` — a declared signature with no implementation

`sig_hash` values (and `registry_hash`) are hashes of canonical bytes.
The canonical *signature* serialization is sorted-key JSON over the
component's kind and full port field set (absent optional port fields
omitted), UTF-8 encoded; the `sig_hash` is its SHA-256 hex digest. The
canonical *manifest* serialization is sorted-key JSON over
`name → [sig_hash, kind]`, UTF-8 encoded; the `registry_hash` is its
SHA-256 hex digest, computed by runtimes (for `0x22`) and clients (for
`0x20`) over the manifest they currently hold. The canonical serialization
substrate is shared with the noflo-ui materialization
work (WD #43 owns byte-stable canonical serialization; round-trip
byte-identity is a hard test requirement there). A serialization change
breaking byte-stability is protocol-visible.

**Open** (before freeze): the encoding for stub-raised
`StubNotImplementedError` — classifiable as unimplemented rather than
indistinguishable from genuine component failures — whether as a convention
on the `0x04 ERROR` payload or its own signal (WD #4 update #9).

## 7. Live streaming telemetry (0x30 – 0x3F)

Visual programming causes event storms (thousands of packets per second)
that crash radio links. FBP 2.0 solves this using **streaming flowtraces**:
buffering execution events into chunked, delta-encoded arrays — a unified
black-box flight recorder. Explicit start/stop/reset/dump commands of 1.x
are replaced by pub/sub subscriptions with client-requested flush intervals;
"dump" is the streamable trace file format (§10).

**`0x30` CMD_PUBSUB_SUB** — subscribe:
`[0x30, sub_id, target_type, target_id, requested_flush_interval_ms]`. The
flush interval is a request; the runtime's actual flush cadence is its
physical-policy decision.

**`0x32` CMD_FLOWTRACE_CHUNK** — buffered execution trace:
`[0x32, sub_id, plane_id, base_timestamp_ms, [trace_events_array]]` — the
plane_id attributes the whole chunk to the graph instance it was recorded
on; nil for the main plane (update #32: frugal-path attribution by
compact id, never names).

Each item in `trace_events_array` is a tuple
`[time_delta_ms, event_type, payload]`, where `time_delta_ms` is a `uint32`

**DATA event payload envelope.** For `0x01 DATA` events, the payload is
the positional tuple `[src, tgt, value]` — where each ref is
`[node_id, port, index?]` or nil (an IIP has no source; an unconnected
outport has no target). `node_id` is the graph model's entity id within
the attributed plane — the exact identifier the `0x14` ops use, so
consumers join events against the frame-1 topology without name
resolution. Nested subgraph instances are their own planes (update #33):
the chunk's plane_id anchors the tree position through the `0x16` parent
chain, so no subgraph path arrays travel per event.

**Connection framing.** `EVENT_TYPE` gains `0x0b CONNECTION_OPEN` and
`0x0c CONNECTION_CLOSE` — the framing 1.x UIs animate edge activity with.
Payload: `[src_node, src_port, tgt_node, tgt_port]`.
offset from `base_timestamp_ms`.

Unified event types:

| Code   | Event         | Payload                                   |
| ------ | ------------- | ----------------------------------------- |
| `0x01` | `DATA`        | raw value                                  |
| `0x02` | `BEGIN_GROUP` | group string                               |
| `0x03` | `END_GROUP`   | group string                               |
| `0x04` | `ERROR`       | exception string                           |
| `0x05` | `CONSOLE`     | `[stream_id, log_string]`                  |
| `0x06` | `LIFECYCLE`   | transition code (uint8)                    |
| `0x07` | `VISUAL_STATE`| `[format_type, binary_pixels]`             |
| `0x08` | `BREAKPOINT_HIT` | `[breakpoint_id, node_id, port]`        |
| `0x09` | `STUB_ERROR`  | exception string                           |

Lifecycle transition codes (`0x06 LIFECYCLE` payloads):

| Code   | Transition        |
| ------ | ----------------- |
| `0x01` | Start              |
| `0x02` | Stop               |
| `0x03` | Safe-mode entered  |
| `0x04` | Failed transition  |
| `0x05` | Paused             |
| `0x06` | Resumed            |

A `FAILED` code encodes a *failed* transition — a rejected `start()` leaves
the runtime an honest message to send (WD #4 update #1). UIs render the
transition as errored from the code itself, without parsing exception
strings; the detail travels in an accompanying `0x04 ERROR` flowtrace event,
frugalized per local policy.

`0x05 PAUSED` and `0x06 RESUMED` announce run-state changes of the execution
control block (§8) — client-requested run control and breakpoint hits alike
— so every telemetry subscriber learns the state change, not only the client
that caused it. `0x08 BREAKPOINT_HIT` events carry the breakpoint cause as
the positional `[breakpoint_id, node_id, port]` tuple; the packet itself
travels as its own `0x01 DATA` event.

A `STUB_ERROR` event is the canonical classification for errors raised by
stub components — the `StubNotImplementedError` of the StubComponent
contract (WD #19): the payload is the exception string, exactly as in
`ERROR`, but the event type itself marks the error as *unimplemented*
rather than a genuine component failure, with no string-parsing convention
(WD #4 update #9). Runtimes MAY additionally record it in the LXMF
`[errors]` snapshot field (§9).

Visual-state format types:

| Code   | Format                          |
| ------ | ------------------------------- |
| `0x01` | FontAwesome                     |
| `0x02` | P4 Netpbm 84x84 monochrome      |
| `0x03` | P6 Netpbm 18x18 RGB             |

**Edge capacity observation** — `0x0a EDGE_CAPACITY` events sample the
backpressure state: one event per edge per flush, payload
`[edge_id, in_flight, desired_size]`, where `in_flight` is the number of
admitted in-flight packets and `desired_size` is the live remaining capacity
(`desiredSize()`), nil when the edge is unbounded. Sampling rides the
subscription's flush cadence — the runtime's physical-policy decision — and
the sample's delta places it at flush time. Backpressure is normal
operation, not a fault: the event lives on the data channel, never an error
channel (WD #4 update #9). The consumer is the noflo-ui high-water-mark
visual vocabulary (route color/age).

## 8. Execution control & debugging (0x40 – 0x4F)

The debugging surface replaces the pause/step support 1.x never had
(noflo/noflo-ui #243/#245) and adds the per-process execution control #317
asked for. The control commands require the `LIFECYCLE_CTRL` capability; the
read-only process listing requires `GRAPH_READ`. Run-state changes are
announced on the telemetry stream as `0x06 LIFECYCLE`
events (`0x05 PAUSED`, `0x06 RESUMED`); breakpoint hits carry their cause
as `0x08 BREAKPOINT_HIT` flowtrace events. There are no dedicated ack
frames, consistent with the rest of the protocol. Pausing stops the
processing of queued events — in-flight packets complete and further
packets keep buffering under the runtime's backpressure policy; buffering
depth is physics, not protocol.

**`0x40` CMD_RUN_CTRL** — run control: `[0x40, action, plane_id?]`. The
optional plane_id starts/stops an ephemeral plane's network (update #28
option b: the program tree stays main-only, ephemera are not part of it);
nil addresses the main plane.

| Code   | Action                                                  |
| ------ | ------------------------------------------------------- |
| `0x01` | Pause — stop processing queued events                   |
| `0x02` | Resume                                                  |
| `0x03` | Step — process exactly one queued event, remain paused  |
| `0x04` | Start — build and start the network                     |
| `0x05` | Stop — stop the running network                         |

Stepping while paused processes one queued event and leaves the runtime
paused; the step's own flowtrace events show what ran. Start and stop are
the lifecycle control the `LIFECYCLE_CTRL` capability names: a start that
the runtime rejects (component startup failure, graph error) surfaces as a
`0x04 FAILED` lifecycle event with the detail in an accompanying `0x04
ERROR` event (WD #4 update #1), not as silence.
**`0x41` CMD_BREAKPOINT_SET** — set a data breakpoint:
`[0x41, breakpoint_id, node_id, port]`. The runtime pauses when a packet
arrives at the node — at any triggering inport when `port` is nil,
otherwise the named one — and emits `PAUSED` plus a `0x08 BREAKPOINT_HIT`
event. Breakpoint ids are client-chosen (non-empty string or non-negative
integer) and scoped to the link. The packet itself travels as its own
`0x01 DATA` event.

**`0x42` CMD_BREAKPOINT_CLEAR** — clear breakpoints:
`[0x42, breakpoint_id]`. A nil id clears every breakpoint.

**`0x43` CMD_PROCESS_CTRL** — per-process execution control (#317):
`[0x43, node_id, action]`.

| Code   | Action                                                                    |
| ------ | ------------------------------------------------------------------------- |
| `0x01` | Disable — the node stops activating; queued packets are kept, not dropped |
| `0x02` | Enable                                                                    |

Disabled state is runtime-side execution state, not graph state: it does
not travel the CRDT op log, and it is deliberately not `0x05` UI metadata,
which constrained nodes drop. Clients observe disabled nodes through the
process listing below.

**`0x44` CMD_PROCESS_LIST_REQ** — request the live process listing: `[0x44]`.

**`0x45` CMD_PROCESS_LIST** — the authoritative live view:
`[0x45, epoch_id, { "node-1": ["math/Add", "elementary", 0x01], ... }]`.
Each entry is the positional `[component, kind, state]` tuple: the component
the node resolves to, that component's declared kind — the shared vocabulary
of §6, so clients never infer stub-ness by joining component names against
their own registries (WD #4 update #9) — and the node's execution state:

| Code   | State     |
| ------ | --------- |
| `0x01` | Enabled   |
| `0x02` | Disabled  |

The `epoch_id` is the graph epoch the listing reflects, correlating with the
CRDT sync handshake (§5). The listing requires `GRAPH_READ`, not
`LIFECYCLE_CTRL`: it is introspection, and the state it reports is exactly
what `0x43` controls.

**`0x46` CMD_HWM_SET** — set the runtime-global high-water mark:
`[0x46, high_water_mark]`. The value is a non-negative integer (`0`
synchronous, `n` up to `n` admitted in-flight packets) or nil (unbounded).
It is the global default in the backpressure hierarchy — edge metadata
overrides it, port defaults sit between. The change takes effect on the
live network; there is no ack frame, and clients observe the effective
per-edge outcome through `0x0a EDGE_CAPACITY` samples (§7), which reflect
the hierarchy's resolution. Runtime configuration, not graph state: it does
not travel the CRDT op log.

**`0x47` CMD_PACKET_SEND** — send one packet into a running network's
inport: `[0x47, plane_id, port, payload]`. The plane addresses the graph
instance (nil = main); the port is an inport name — an exported port of
the main plane, or an inport of an ephemeral plane's fixture. One command
serves interactive packet injection, the remote fbp-spec runner's
sequenced case inputs, and the runtime-as-remote-component pattern
(update #36). Requires `LIFECYCLE_CTRL`.

**`0x48` CMD_GET_STATUS** — query the current run state: request
`[0x48]`; the runtime answers on the same opcode with
`[0x48, epoch_id, run_state, uptime_ms, advertised_mask]` — the main
plane's epoch, the run state (`0x00` STOPPED, `0x01` RUNNING, `0x02`
PAUSED, `0x03` FAILED), the network's uptime in milliseconds, and the
runtime's full advertised capability surface. The `getstatus` equivalent
— late subscribers and monitors ask instead of inferring from lifecycle
events they never saw. Requires `GRAPH_READ`.

## 9. Offline LXMF store & forward

For asynchronous monitoring, runtimes dispatch state to the mesh via LXMF
(`app_name: fbp.telemetry`). To respect Proof-of-Work limits on
microcontrollers, LXMF drops MUST be event-driven (e.g. fault conditions) or
scheduled opportunistically during peak solar-generation hours with
randomized jitter. The payload is a flat array:

```
[ timestamp, uptime, is_safe_mode, [ battery, solar, ram, cpu ],
  [ visual_format, visual_bitmap ], [ errors ] ]
```

## 10. Streamable trace serialization (file format)

Flowtraces record to disk as fully self-contained, append-only recordings,
enabling seamless playback in UI Web Workers (no external replay tool):

1. **Frame 1 (topology snapshot)** — must be the first frame:
   `[0xF0, format_ver, timestamp_ms, runtime_metadata, complete_graph_definition]`
2. **Frames 2..N (execution stream)** — raw `0x32` CMD_FLOWTRACE_CHUNK byte
   arrays appended sequentially as they flush from the engine.

## 11. Out-of-band observability

For broader infrastructure monitoring, runtimes (like a Node.js daemon)
SHOULD expose a separate endpoint emitting standard Influx line protocol
metrics. Tools like RNMon can scrape this over isolated Reticulum links,
keeping host-level infrastructure data entirely separate from the FBP canvas
telemetry.

## 12. Deliberate omissions

The following 1.x capabilities are deliberately absent from this protocol,
with the design reasons:

* **Multi-graph per destination** — the plane model (§5) replaces 1.x's
  `graph_id`-on-everything: one plane per graph instance, addressed by the
  additive `plane_id` fields. Multiple graphs per *process* are supported
  through multiple runtime destinations sharing one Reticulum identity.
* **Remote-subgraph packets** (1.x `runtime:packet` on subgraph exported
  ports) — planned as a follow-on to `0x47 CMD_PACKET_SEND` (§8): the
  runtime-as-remote-component pattern where packets flow through exported
  ports. The plane-addressed injection and the telemetry envelope are the
  prerequisites.
* **`network:persist`** — superseded by CRDT convergence: the plane's state
  is the authority, and persistence is a host-side application concern over
  the converged state (the changeset-era autoSave work). There is nothing
  for a wire command to flash that convergence does not already make local.
* **Port schema URIs** — datatype/schema handling needs end-to-end design
  from `noflo.BasePort` through the protocol's port definitions to
  noflo-ui's rendering. The RNS resource-hash variant is one candidate
  shape. Port `values` and `default` are in the signature (§6); full
  schema support is a follow-on design.
* **`network:error.stack`** — the `0x04 ERROR` payload is the exception
  string (frugalized per local policy); stack traces are not carried.
* **`previewurl` output type** — visual output preview is UI territory,
  not wire protocol.

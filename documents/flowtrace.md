# Flowtrace: recording and reading NoFlo executions

Flowtrace is the native trace recorder in `@noflo/noflo` (work document #23). A `Flowtrace` instance records one network execution as a sequence of events in the FBP Protocol 2.0 telemetry vocabulary (work document #4 §7): every information packet, bracket stream boundary, process error, console output, network lifecycle transition, and — since work document #43 — every process activation. The recording starts as in-memory state (`trace.toJSON()`), and can be exported as the streamable binary trace file format (§10) through `@noflo/fbp-protocol`.

The two representation layers:

- `@noflo/noflo` (`Flowtrace`): owns the event model as data. No wire-format dependencies.
- `@noflo/fbp-protocol` (`assembleTraceFileFromRecorder`, `readTraceFile`): the binary MsgPack framing. A round-trip spec in `@noflo/runtime` pins the two together.

## The event vocabulary

Event types as recorded by the engine-side recorder:

| Code | Event | Payload |
| --- | --- | --- |
| `0x01` | `DATA` | the packet value (in JSON state; on the wire the `[src, tgt, value]` envelope) |
| `0x02` | `BEGIN_BRACKET` | bracket label |
| `0x03` | `END_BRACKET` | bracket label |
| `0x04` | `ERROR` | exception string |
| `0x05` | `CONSOLE` | `[stream_id, log_string]` |
| `0x06` | `LIFECYCLE` | transition code (see below) |
| `0x0d` | `ACTIVATION_BEGIN` | `[node_id, load]` — the node's load after the increment |
| `0x0e` | `ACTIVATION_END` | `[node_id, load]` — the load after the decrement; `0` marks the node going idle |

Lifecycle transition codes for `0x06`: `0x01` START, `0x02` STOP (the recorder emits these two; `SAFE_MODE`, `FAILED`, `PAUSED`, `RESUMED` exist for run-control producers).

Every event carries metadata in the JSON state: `graph` (the name the network is recorded under), and for IP and activation events the `subgraph` path. IP events additionally carry `src`/`tgt` as `{node, port}` refs, plus `datatype` and `schema`. Subgraph networks register themselves with the same recorder, and their events attribute to their subgraph path (`["Sub", "A"]` for a node `A` inside the subgraph `Sub`), so one recording covers the whole tree.

Process activation semantics worth knowing:

- A `Subgraph` component opens its activation when its inner network starts and closes it when the inner network ends, so subgraph wrappers record spans covering the whole inner execution. Their activation begins can legitimately precede the outer network's `LIFECYCLE START` in the stream.
- A process function that sends inside a callback (or returns a resolved promise and sends later) records `ACTIVATION_END` before its output `DATA` event: the implicit-Promise bridge closes the activation on a void resolution, and the send lands afterwards.

## Triggering a recording

### 1. Plain `noflo.Network`

Pass a `Flowtrace` instance as the `flowtrace` network option:

```js
import noflo from "noflo";

const trace = new noflo.Flowtrace({
  runtimeMetadata: { name: "my-app", type: "in-process" },
});

const network = await noflo.createNetwork(graph, {
  flowtrace: trace,
});

// ... run the network ...

const state = trace.toJSON();
```

To attach a recorder to an already-built network (including its existing subgraphs), or to change the name a network records under:

```js
network.setFlowtrace(trace, "main", true);
```

One `Flowtrace` instance records one execution. Passing the same instance to several networks is only meaningful for the subgraph tree: a main network and its subgraph networks share the recorder, with the main network recording everything under its name. A second, independent recording needs a second instance.

### 2. `noflo.asPromise`

`asPromise` accepts the same `flowtrace` option and is the quickest way to get a trace for a single component or a graph run:

```js
const trace = new noflo.Flowtrace();
const wrapped = noflo.asPromise("strings/SplitStr", {
  loader,
  flowtrace: trace,
});

const result = await wrapped("a,b,c");
const { chunks } = trace.toJSON();
```

A component run is recorded as a one-node graph named after the component (`snapshot.main === "strings/SplitStr"`), with the component's instantiation, IIP delivery, activation pair, and outputs all in the event stream. Because `asPromise` resolves only after the network ends, the trace is complete when the promise resolves — no cleanup needed.

### 3. `noflo-nodejs`

The `--trace` flag records a trace file of the whole run:

```sh
noflo-nodejs --graph ./graphs/Build.fbp --trace
```

The flag is part of the project settings, so enabling it in `noflo.json` (or the environment) persists across runs. The recorder is created automatically with `runtimeMetadata` naming the runtime (`{ type: "noflo-nodejs", name }`).

The recording is written to the project's `.flowtrace/` directory as a binary trace file, named `YYYY-MM-DD-noflo-nodejs-<graph>.trace`. Flushing happens on network end, on `SIGTERM`/`SIGINT` (so an interrupted run still writes its trace), and on `SIGUSR2` as a mid-run snapshot without stopping the network. With `--catch-exceptions`, an uncaught exception is flushed to the trace before the process exits — the trace file then contains the error event and the activations that were open when the crash happened.

## Reading a trace

### JSON state: `trace.toJSON()`

```js
const state = trace.toJSON();
// state.snapshot = {
//   formatVersion,           // trace file format version (1, pre-freeze)
//   timestampMs,             // recording start, epoch ms
//   runtimeMetadata,         // free-form runtime identification
//   graphDefinition,         // the main graph's definition (FBP JSON)
//   graphs,                  // all registered graphs, including subgraphs
//   main,                    // main graph name
// }
// state.chunks = [
//   [timeDeltaMs, eventType, payload, meta],  // delta-encoded from timestampMs
//   ...
// ]
```

The first three elements of each chunk tuple are exactly what a binary `0x32` chunk carries; the fourth (`meta`) is the JSON-level enrichment (graph, subgraph, src/tgt, datatype, schema). Payloads are frugalized at export time: a value that cannot survive JSON serialization is replaced with a type-named placeholder instead of failing the recording.

### Binary trace files: `readTraceFile`

```js
import { readTraceFile, EVENT_TYPE } from "@noflo/fbp-protocol";
import { readFile } from "node:fs/promises";

const bytes = await readFile(".flowtrace/2026-10-17-noflo-nodejs-build.trace");
const { snapshot, chunks } = readTraceFile(bytes);
for (const chunk of chunks) {
  for (const event of chunk.events) {
    // event = { timeDeltaMs, eventType, payload }
  }
}
```

### The `fbp-client` commands

`@noflo/fbp-client` works with traces over the wire and offline:

- `fbp-client watch` — subscribe to a running runtime's live telemetry stream (`0x30`/`0x32`) and print decoded events
- `fbp-client trace <file>` — capture the live stream into a `0xF0` tracefile (default 5 second window)
- `fbp-client replay <file>` — play back a stored tracefile through the same decode path, with no runtime connection

Capture and replay use the same decode path, which makes the round-trip the cheapest end-to-end verification of a runtime's telemetry. Note that live streaming today carries the IP, error, console, and lifecycle events; activation events are currently recorder-side only (they appear in `Flowtrace` JSON exports and trace files written by `noflo-nodejs --trace`, and the live-streaming follow-up is tracked in work document #43).

## Debugging a hang with the trace

The activation walk is the tool for the most common NoFlo debugging question — "why didn't the network finish". Per node, the payload walk of activation events is the previous value ± 1; a node whose last activation event is an `ACTIVATION_BEGIN` (or whose `load` never returned to `0`) holds an open activation — that is the hung process, and the events around it show what it last received:

```js
import { EVENT_TYPE } from "@noflo/fbp-protocol";

function hungNodes(traceState) {
  const load = new Map();
  const last = new Map();
  for (const [, eventType, payload] of traceState.chunks) {
    if (eventType === EVENT_TYPE.ACTIVATION_BEGIN || eventType === EVENT_TYPE.ACTIVATION_END) {
      const [node, value] = payload;
      load.set(node, value);
      last.set(node, eventType);
    }
  }
  return [...load.entries()]
    .filter(([node, value]) => value > 0)
    .map(([node, value]) => ({ node, load: value, lastEvent: last.get(node) }));
}
```

Nodes with a positive final load and an `ACTIVATION_BEGIN` last event are mid-activation when the recording ended: for a network that hangs, that is the component stuck waiting on preconditions, and the `DATA`/bracket events before its begin show exactly which port delivered what.

## Recorder contract notes

The network consumes the recorder through a duck-typed contract (`mainGraph`, `addGraph`, `addNetworkPacket`, `addNetworkStarted`, `addNetworkStopped`, plus the activation and error/output methods), so an external implementation of that contract works in place of the shipped class — `Flowtrace` is the default, not a coupling. Recording failures never take down an execution: unserializable payloads are frugalized, and export-time serialization issues surface in the JSON state rather than the running network.

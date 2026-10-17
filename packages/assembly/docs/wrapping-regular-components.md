<!-- Part of the Assembly Line documentation set; work document #36 -->

# Wrapping regular components

The modernized ecosystem is mostly regular Process API components: multiple
ports, `error` outports, control ports, bracketed output streams. Assembly
lines speak the message-envelope convention instead: one `msg` per request,
errors accumulating into `msg.errors`, relay-style components. `asAssembly`
bridges the two worlds — without rewriting the regular components.

## The contract

```js
import { asAssembly } from "@noflo/assembly";

const graph = asAssembly(innerComponent, {
  target: "filesystem/CopyFile",
  mapping: {
    // optional overrides; defaults map port name ↔ msg field name
    in: { source: "source" },
    out: { destination: "destination" },
  },
});
```

- `innerComponent` — an **instantiated** regular component; its port
  metadata (names, control, required, addressable) drives the mapping
- `options.target` — the **registry-resolvable name** of the inner
  component; the generated graph references the inner component by this
  name and resolves it through the same registry the application loaded
  the wrapper with
- `options.mapping` — optional per-port overrides; a `null` value maps the
  **whole message** to that port (the webserver-middleware case)

The result is a `GraphModel`: a real adapter subgraph, not a compiled
driver. Register it as a component definition and the loader wraps it in a
subgraph — the generated graph and the running thing are the same object,
so `getSource` cannot drift from the implementation.

## Mapping rules

- **Non-control inports** receive `msg[field]` of the same name
  (`filesystem/CopyFile`: `source` ← `msg.source`)
- **Control inports** are configuration, not per-message data: they pass
  through onto the wrapped signature, fed by graph defaults or IIPs
- **Outports** overwrite the same-named message field
  (`image/Crop`: `canvas` in → `canvas` out replaces the field)
- **Whole-message mapping** (`in: null`): the port receives the entire
  message — the `webserver` middleware pattern
- **Bracketed inner output streams** are collected into an array under the
  mapped field; a single-packet stream unwraps to the value directly
  (`filesystem/ReadDir` → array, `Stat` → value)
- **Side-effect-only components** (no data outports) relay the message
  unchanged
- **The `error` outport** accumulates into `msg.errors` — the message
  still relays
- **Unwrappable shapes** (addressable ports) reject loudly at wrap time

## The adapter subgraph

The generated graph is:

```
msg inport → Fork ─┬→ ExtractField(source) → inner.source
                   ├→ (extractors per mapped inport)
                   ├→ CollectFields.msg
                   └→ (control passthroughs)
ExtractField.error → CollectFields.error   (one wire per extractor)
inner.destination → CollectFields.data[0]
inner.error       → CollectFields.error
CollectFields.out → outport
```

- **ExtractField** reads the assembly message and emits one field per
  mapped inport; the field name is the node's metadata, persistent for
  every message through the node. A message lacking the mapped field is
  malformed: the absence surfaces on the extractor's `error` outport,
  wired into the collector's error accumulation, so the message
  completes on the error leg with the failure recorded
- **CollectFields** fires when every mapped field delivered, or when the
  inner signalled an error instead; inner errors accumulate into
  `msg.errors`; bracketed streams collect into arrays under the field;
  single packets unwrap to the value
- **Scope correlation** inside the collector holds per message: concurrent
  in-flight messages carry scopes (the message's scope propagates through
  the fanout, extractors, and inner), and the collector's scope-aware
  checks pair each message's legs independently
  (FIFO), and **scopes are the correlation key for concurrent in-flight
  messages**: assign a scope per unit of work where the work is fanned
  out (for example one scope per file), and concurrent branches pair
  correctly no matter their completion order

Unscoped traffic is only correct for in-order, synchronous inner
components.

## Source representation

`getSource` on a wrapped component returns the generated adapter graph as
FBP JSON — the same convention graph components use. `setSource` on a
wrapped name **promotes** the submitted graph to an explicit, user-owned
subgraph under the same name: subsequent wrapping passes skip the name,
the registry dispatches `change`, and the signature stays as declared.
Where no graph form can be generated, `getSource` reports no source rather
than passing the inner component's source through.

## Library decoration

```js
import { wrapAssembly } from "@noflo/assembly";

const registry = wrapAssembly(appRegistry, {
  libraries: [{ library: "filesystem" }],
  onSkip: (report) => console.log("skipped", report.name, report.reason),
});

const network = await noflo.createNetwork(graph, { registry });
```

Decoration is best-effort: components that wrap cleanly become assembly
participants, the rest stay native and are reported. Explicit
`asAssembly` calls reject loudly instead — components that are already
assembly participants are refused by both paths ("use it directly").

## v1 limitations

- Addressable inner ports are rejected (both collector-style and
  selector-style; the collector kind is a designed extension)
- Streaming/routing components are out of scope — the per-message job
  model does not apply to them
- The inner component must complete per message: send every mapped
  outport, or the error port. A component that sends nothing on some path
  leaves the collector waiting
- `required` inner inports are not yet derived into assembly validation
  rules

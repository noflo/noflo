# Port schemas in NoFlo 2.0: guarding structure, not business logic

This document captures the port-schema doctrine that crystallized in the schemas work (work documents #33 and #37) and the car-factory dogfood (@noflo/assembly's example package, work document #25 update #8). It is living documentation: extend it as more schema practice solidifies on the 2.0 line.

## The division of labor

A port schema guards **structure**: what fields exist, their types, which fields are required at which point of a pipeline, what counts as a well-formed message. A schema is checkable by a generic validator — it never needs to know what a "car" or an "invoice" is.

The component's code owns **business logic**: whether a value is *correct* (not just well-formed), cross-field invariants (`chassis.id === body.id`), and what to do when a check fails. These stay in the process function or the component's validation hooks — testable, debuggable, loggable.

Both halves matter, and the failure mode is blurring them in either direction:

- **Structure encoded only in code** is the 1.x default, and it rots: the message contract lives implicitly across every `processMessage`, undiscoverable without reading the whole pipeline, and unverified against drift. The car-factory example's `validates: ["body.id"]` checks were one field deep — a renamed `suspension.coils` ran the whole pipeline green.
- **Business logic encoded as schema combinators** is the subtler trap, because JSON Schema *can* express cross-field rules (`if/then` with data references, const-pinned id ranges). Doing so moves a business rule into a declarative document where it has no test harness of its own, no stack trace, no way to log the business reason for a rejection — and it becomes load-bearing for every consumer that validates against the schema, including clients that only wanted a shape check. Tightening a business rule then becomes a wire-visible schema change.

The practical test when deciding where a check belongs: *can a generic validator reject it without knowing the domain?* Field presence, types, enum membership, array bounds, staging completeness — schema. Value correctness, correlation between fields, policy — code.

## What belongs in a schema

- **The message envelope**: the shared fields every message carries (in the assembly conventions, the `errors` array) plus the identifying keys.
- **Staged completeness**: the same envelope passing through a pipeline accumulates required fields. Model the stages — `car/chassis` (frame stage) versus `car/chassis-complete` (everything mounted) — and mark each port with the stage it actually receives or produces. "The chassis is complete" becomes a declared, checkable fact instead of the graph's implicit sequencing.
- **The boundary invariant**: the shape a component hands to the outer world. `car/car` declares `errors: maxItems: 0` — a released car is error-free by definition. Under the assembly convention (failures ride inside `msg.errors` rather than throwing), boundary validation is what detects a failure leaking out of the pipeline instead of it slipping out silently.
- **Control-port shapes**: configuration ports get schemas too — inline objects for small scalars (`{ type: "string", minLength: 1 }`) hoist into content-addressed entries automatically.

## What stays in code

- Cross-field invariants (`chassis.id === body.id`) — JSON Schema constrains shape, not inter-field business rules.
- Correctness of values the structure cannot judge (an engine name that is syntactically fine but not a real offering).
- The failure contract: what happens on invalid input, which outport carries the failure, whether the message continues.

## The two enforcement tiers

The publish pipeline derives an in-band **guard** from every port schema automatically (`{ type: "object", required: [...] }` — the cheap projection), and the publish gate fails if an explicit guard disagrees with the projection. This gives two tiers from one source:

- **Guards**: cheap, dependency-free checks the runtime and clients can apply per packet. They can never drift from the schema, because they are projections of it.
- **Full schemas**: the complete JSON Schema documents, served to clients through the manifest's schemas table (the Two-Step Cache carries them, the way it serves component signatures).

The consequence for remote clients: a client can validate a packet *before* injecting it (`0x47` packet send, IIP authoring) and reject a malformed payload at the client instead of poisoning a running network.

## Where schemas live and travel

1. Authored in the package's `schemas/` directory as JSON Schema 2020-12 documents with `ns/name` `$id`s; inline port schemas hoist into content-addressed entries at publish.
2. The publish gate checks the closure: every port schema reference resolves (own `schemas/` or a dependency's published manifest), reserved namespaces stay with their owners, cycles and breaking revisions fail the publish.
3. The generated `noflo.json` manifest ships the schemas table; runtimes load it into their schema tables at startup and serve it to protocol clients.
4. Port signatures carry the reference (`{ id, digest }`) and the projected guard.

Namespace choice follows the package's npm identity: the gate binds the reserved namespaces (`std`, `ui`, `runtime`, `noflo`, `assembly`) to their owning packages, and everything else is free — but pick the name you will maintain (`car/*` for the car-factory example, not a generic `example/*`).

## The reference implementation

`@noflo/assembly`'s car-factory example (`packages/assembly/example/`) is the worked case: eleven named `car/*` documents modeling the full message surface (order → chassis/body assemblies → released car), `schema:` markers on all fourteen components' message and control ports, a committed generated `noflo.json`, and a spec (`spec/ExampleSchemas.js`) validating the end-to-end BuildCar run's output against `car/car` through the manifest's table. Copy that shape for a library's own schemas.

Two implementation notes from the dogfood:

- **Graph format and case**: the `.fbp` loader path folds port names to the 1.x lowercase, while the manifest generator's graph import is case-strict — a package that ships graphs and schemas should author its graphs as FBP JSON (exact case significance) so one document satisfies both paths.
- **Subgraph boundary ports**: a subgraph instance's ports are its exported public names — internal edges reference those, not the inner nodes' own port names.

## Honest boundaries

- Schemas do not replace the component's runtime validation. The assembly `validates` vocabulary's business checks remain in code; wiring the vocabulary to schema-derived *structural* guards is recorded follow-up work (work document #25) and stays on the structural side of the line.
- Schemas do not enforce cross-field business invariants. That is CombineAssemblies' runtime job and stays there.
- Full-schema validation is a client and boundary tool today; the in-process runtime applies the projected guards, not the full documents.

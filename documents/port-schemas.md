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
- **The publish pipeline owns the schemas' bytes**: the generator rewrites every named schema document to canonical published bytes (pinned references, expanded arrays, two-space indent) — the published bytes are the digested bytes, and the rewrite is idempotent. The whole `schemas/` tree plus `noflo.json` is therefore formatter-exempt (`!**/schemas/**/*.json`, `!**/noflo.json`); a formatter that collapses width-fitting arrays fights the next regeneration and loses, producing a diff on every cycle. Author schema content, not schema style. The exemption's reach is wider than the generator's rewrite: it also un-formats hand-authored catalog documents whose bytes are digest-pinned elsewhere (the fbp-protocol meta-catalogs, noflo's port-behavior) — reformatting those would change the bytes their published digests vouch for, so no formatter may touch them either. The tradeoff is that nothing notices if such a document drifts stylistically; that is the price of bytes being contract. The `revision` field is provenance for the content that generated the manifest; the authoritative publish-time provenance is the workflow's regeneration (`--revision $GITHUB_SHA`), since a committed manifest can never carry the hash of the commit that first ships it.


## Enforcement in the engine

Declarations without enforcement are documentation. The engine applies the projected guards at three admission surfaces — and nowhere else (work document #50):

1. **Edge add (build time)** — contract subsumption between the connected ports: everything the source guard guarantees must cover everything the target guard demands (a `car/chassis`-stage source cannot feed a `car/assembly-combined`-demanding target, though the datatypes both read `object`). Checked before any connection attaches; a strict violation fails the network build loudly.
2. **Outport send** — the outgoing value versus the port's own guard, at the source, before fan-out multiplies the violation. This is the class of failure no editor can ever see: a component emitting data that violates its own declared contract.
3. **IIP add** — the initial data versus the target port's guard, once at graph construction.

Per-hop delivery checks are deliberately absent: with wiring subsumption verified at build, the middle of the graph is transitively sound, and the steady-state hot path pays nothing. The honest residual gap: a consumer mutating a shared payload mid-graph — already an anti-pattern under the assembly conventions.

Enforcement is **policy, not declaration** — no per-port `strict` flag (the 2016 shape). The policy resolves hierarchically, the same shape as edge `highWaterMark`: edge metadata, then the receiving port's declaration, then the sending port's, then the network default, with the `noflo.contract` node-metadata key (`off` | `diagnostic` | `strict`) applying the policy instance-wide. `off` is the default and is today's behavior: zero cost, full compatibility.

- `diagnostic` checks and records (a warning at build time, a network `process-error`-visible diagnostic at delivery) and never drops.
- `strict` makes violations loud: build-time violations (edge subsumption, IIP admission) reject the network build; a send-time violation throws inside the sender's process activation, routing through the `done(err)` escalation — the lying sender's failure is the sender's own process error.

The in-process checks are the comparison-only guard vocabulary (`type`, `enum`, `required`, `min`/`max`) plus datatype — no schema bodies loaded, no validator dependency in the core. Full JSON Schema validation stays at the boundaries: the publish gate, the editor, fbp-client pre-injection (`0x47`).

Guards reach the ports through propagation: a component may declare the guard inline (the `guard` port option), the loader carries the published signature's guards onto loaded instances (implemented components via their retained sidecars, stubs via `fromSignature`), and the `noflo.contract` metadata key applies policy instance-wide. Subgraph boundary-port guard propagation is recorded follow-up work.

## Honest boundaries

- Schemas do not replace the component's runtime validation. The assembly `validates` vocabulary's business checks remain in code; wiring the vocabulary to schema-derived *structural* guards is recorded follow-up work (work document #25) and stays on the structural side of the line.
- Schemas do not enforce cross-field business invariants. That is CombineAssemblies' runtime job and stays there.
- Full-schema validation stays a client and boundary tool; the in-process engine applies the projected guards only (see the enforcement section below).

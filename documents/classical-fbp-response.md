# NoFlo 2.x and classical FBP: a point-by-point response

This document answers J. Paul Morrison's critique of NoFlo — principally the essay "FBP vs. FBP-inspired Systems" (jpaulm.github.io/fbp/fbp-inspired-vs-real-fbp.html), the "Concat" Component comparison, and the classical- FBP concept definitions in "Concepts" (jpaulm.github.io/fbp/concepts.html) — against the NoFlo 2.x implementation as shipped on the current development line. It is the response deliverable of the conformance work (work document #38), and it is written to be updated: each section names the implementation source that settles the point, so later changes re-open the section rather than the whole document.

Morrison's litmus test for "classical" FBP (attributed to Ali Razeen's 2015 note, and restated throughout the critique) has four pillars: **asynchronism**, **information packets with unique ownership and lifetime**, **reverse pressure (back pressure)**, and **selective receive from multiple input ports by autonomous components**. The verdict up front: NoFlo 2.x meets all four on the data plane and the network model. The remaining differences are the runtime substrate (single-threaded JavaScript, no preemptive parallelism) and a small set of deliberate extensions beyond classical FBP (scopes, subgraph planes, Web Streams as the transport substrate). The critique's core complaint — "NoFlo is still basically synchronous and procedural", lacking the paradigm shift — described 1.x accurately and describes 2.x no longer.

## 1. Asynchronism and autonomous components

**The critique.** Cowan's component-programmer's view: in classical FBP, components are autonomous — they read from any input port whenever they want, and wait transparently when a port is empty or an output port is full. FBP-inspired systems push packets at components sitting in an event loop, so each component is controlled by its upstream partners (the "inversion of control"), and natural techniques like recursion become difficult.

**The 2.x answer.** The Process API implements the component-programmer's view: a component's process function reads from any of its input ports (`input.has(port)` / `getData(port)`), and when a port has nothing to offer, the activation waits transparently — the engine re-invokes it when the missing data arrives. A component does not sit in an event loop waiting to be pushed to; it requests, and the suspension is the engine's job. The has/get order is the one discipline the component carries (check preconditions before consuming), documented as the activation contract.

The autonomous-suspension pairing extends to the output side through bounded edges: a send on a full connection parks the writer, and the writer resumes when capacity frees — without component code. This is the transparent-wait behavior Morrison describes as "exactly how files are processed".

**What remains true of the critique.** The substrate is still one JavaScript event loop. Processes are interleaved, not parallel: a long-running synchronous computation inside one component blocks the network. The engine provides asynchronism as a scheduling model (independent activations, transparent suspension, back pressure), not as multi-core parallelism. Components needing CPU parallelism must leave the model (worker processes, remote subgraphs over the FBP protocol). This is a substrate constraint of JavaScript, not of the model, and it is the one classical-FBP benefit NoFlo 2.x does not deliver.

## 2. Selective receive from multiple input ports

**The critique.** "Basic FBP business functions such as Collate require a process to be specific about which port it wants to receive from, and to be able to suspend until data arrives at that port."

**The 2.x answer.** Multi-port selection is the core of the Process API: a component declares named input ports and addresses each by name — `input.has("in2")`, `input.getData("in1")`, per-port precondition checks combined arbitrarily (`input.has("in1", "in2", validator)`). A component can wait on any subset of its ports and consume in any order it chooses. The standard components the critique names exist and are tested: the merge patterns (`Merge`, the double-merge scoping fixtures), the Collate-style bracket collectors (`CollectTree`, `CollectObject`), and `Concat`-style stream sequencing against the fbp-spec suites.

The suspension semantics are the pending-activation model: an activation that finds its preconditions unmet returns without consuming, and the engine re-invokes it when the missing inputs arrive. The one discipline — check with `has` before consuming with `get` — is what keeps the suspension honest, and it is enforced by diagnostics (an activation that consumes and then waits surfaces at shutdown).

## 3. Back pressure ("reverse pressure")

**The critique.** "Back pressure is the only way I am aware of that allows infinite amounts of data to be processed using finite resources" — and NoFlo's buffers were "only limited by system memory".

**The 2.x answer.** Bounded back pressure is the default, not an option: every edge whose high-water mark is absent at every level of the hierarchy resolves to the bounded default (16) instead of unbounded, with an explicit `null` opting out at any level (edge metadata, port option, network option). A send on a full edge parks the writer asynchronously; the writer resumes as the receiver consumes. The high-water mark is resolved through the hierarchy (edge metadata over port over network), so a network tunes the whole pipeline in one place.

The Concatenate example from the critique — billions of IPs accumulating at element 2 while element 0 is still streaming — cannot occur on bounded edges: element 2's sender parks when its edge fills, without component code. The one behavioral cost is delivery timing: bounded edges deliver one microtask after the write call, so every graph shifts delivery timing with the bounded default (unbounded edges keep the synchronous 1.x timing for opt-outs).

## 4. Information packets with unique ownership and lifetime

**The critique.** "In FBP, data is managed in packets (IPs), which have a well-defined lifetime, from creation to destruction, and can only be owned by one process at a time, or be in transit between processes — just like real-life objects." And: a single output port connected to multiple input ports "would be like being able to send the same soft-drink bottle pass through two different machines at the same time!"

**The 2.x answer.** This is the point the 2.x data plane was rebuilt around. IP ownership is enforced: fan-out delivers a fresh IP envelope to every attached edge instead of sharing one object — each envelope carries its own identity, an `owner` stamped by the receiving buffer, moved onto the consuming component by the consuming read, and released on send. Ownership is single at every moment; the "same soft-drink bottle through two machines" can no longer be expressed. The payload reference is sender-declared (`IP.clonable`, defaulting to true): fan-out deep-copies the payload per edge, and a component that must share a non-copyable resource opts in explicitly (`fanoutRefs`), with each edge still receiving its own envelope.

The lifetime is equally explicit: an IP is created by a sender, admitted to an edge, handed to a receiving buffer (ownership stamped), moved onto the consuming component by the consuming read, and released when the component sends or drops it. A drop is an explicit action (`IP.drop()`), matching Morrison's "disposal... must be an explicit action on the part of an owning process". Stranded IPs — created but never consumed — surface loudly at shutdown diagnostics and in the trace, rather than being silently garbage-collected with unclear ownership.

The one deliberate deviation from the strictest reading: classical FBP's "one outport, one connection" rule is relaxed at the topology level — one outport may feed several edges — but the ownership rule that motivated it is enforced per edge, which is the substantive point. The bottle is not shared; each machine receives its own bottle.

## 5. End of stream, closedown, and the network lifecycle

**The critique (via the Concat example).** Concatenate's logic is "receive all IPs from array input port element i until end of stream" — and the classical closedown rule: a process closes down when all of its upstream processes have closed down.

**The 2.x answer.** End-of-transmission is now first-class, boundary-owned, and cascading. A sender finishes a transmission terminally (disconnect); a port is at EOT when every socket attached to it is terminally closed; a component closes down when every input is at EOT and it is quiescent; a network ends when every boundary input is at EOT and the network is quiescent. Concatenate's "receive from element i until end of stream" is expressible directly: the stream end is observable per port, and the cascading closedown means the last upstream's finish propagates without special coding.

The internal-edge case Morrison's model does not address — a feedback edge into a component whose other inputs are done — is settled by network-level absorption: once every boundary source has finished and the network is quiescent, no future event can occur inside it, cycle or not, and the network ends. The classical closedown rule and the cycle case are both consequences of the same predicate.

## 6. Initial Information Packets

**The critique (concepts).** "When a 'receive' is performed on that port, the IIP is converted into a regular IP, and can then be processed the same way as any regular IP. If a further 'receive' is performed on the same input port within the same activation of the process, the 'receive' returns a 'null' (i.e. 'end of stream')."

**The 2.x answer.** IIPs are single-packet streams from a sender that is then done: the network delivers the IIP and closes that input at end of transmission — a further receive on the port observes the same end-of-input condition rather than a second copy. The IIP's value is consumed by the first read like any regular IP. This is a deliberate refinement of the 0.x null-return convention, enabled by the boundary-owned EOT model: the IIP edge is a one-packet transmission whose end follows its delivery.

## 7. The component model: "a cloud of callbacks"

**The critique.** "A NoFlo process is essentially a cloud of callbacks linked by instance variables", versus the classical model where "each process has a single high-level method, which can then call subroutines in the normal way, as each process has its own independent call stack".

**The 2.x answer.** The Process API gives each component a single high-level `process(input, output)` function — the single-method model Morrison describes — with the activation's state in method-local storage (the function's scope) rather than smeared across instance variables. The activation context (`input`, `output`, `context`) is handed to the function; components do not register callbacks on ports. The 1.x-era callback and event-listener surfaces are removed.

The remaining difference from the classical call stack: activations are suspended and resumed by the engine rather than blocking a thread, so state that must survive a suspension lives in the closure or in per-scope component state — and self-driven components hold their activation across emissions rather than re-entering. This is the async/await trade applied at the component level: the single-method shape is there; the independent call stack is simulated by the engine's activation model instead of a thread.

## 8. Deliberate extensions beyond classical FBP

Documented so the response does not overclaim equivalence. NoFlo 2.x extends classical FBP in four ways that Morrison's model does not cover:

- **Scopes**: concurrent activations carry scopes, letting multiple in-flight messages pair correctly through components that fan out and merge — a concurrency feature classical FBP handles per-process, expressed here per-scope.
- **Subgraph planes and remote subgraphs**: the network model is hierarchical with plane addressing, so a graph's subgraphs and remote executions share one wire vocabulary.
- **The Web Streams substrate**: edges are Web-Stream-based, which is what makes the browser and runtime deployments share the component model with Node.
- **The FBP Protocol**: the wire vocabulary (graph sync, telemetry, execution control) makes the same networks observable and drivable remotely — beyond classical FBP's single-process view.

## 9. Summary against the litmus

| Pillar | Status | Where |
| --- | --- | --- |
| Asynchronism (autonomous, transparently suspending processes) | Met, single-threaded substrate | Process API, bounded edges |
| Selective receive from multiple ports | Met | Process API named ports, pending activations |
| Back pressure ("reverse pressure") | Met, bounded by default | Edge high-water marks, the hierarchy |
| IP ownership and lifetime | Met | Fresh envelopes, `IP.move()`, explicit drop, diagnostics |
| End of stream / closedown cascade | Met (this work) | Boundary-owned EOT, cascading closedown |
| Multi-core parallelism | Not met (substrate) | Single-threaded JavaScript; remote subgraphs as the escape |

The critique's closing challenge — Ken Kan's "make JS work for FBP, not FBP work for JS" — is the sentence this response documents 2.x answering: the data plane, the ownership model, the back pressure, and the lifecycle are now FBP's, expressed in JavaScript's native concurrency rather than simulated on top of it.

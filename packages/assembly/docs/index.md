<!-- Brought in from the noflo-assembly GitHub wiki (2026-10), modernized for NoFlo 2.x / @noflo/assembly -->

# The Assembly Line design pattern

NoFlo Assembly Line is a design pattern and a library that supports it. While the library and code reference is the [`@noflo/assembly` package](../README.md), these documents provide the design-pattern documentation and best practices.

## Contents

1. [Introduction](./introduction.md) — rationale, mental model, glossary
2. [Components and ports](./components-and-ports.md) — relay, source, sink, split, merge, hub
3. [Message passing](./message-passing.md) — the assembly message envelope and conventions
4. [Error handling](./error-handling.md) — accumulation, failed-message forwarding, distributed jobs
5. [Concurrency handling](./concurrency.md) — scoping, parallel branches, references vs clones, fork/merge
6. [Wrapping regular components](./wrapping-regular-components.md) — `asAssembly`, the adapter subgraph, correlation contract

## Images

The refactoring screenshots referenced by the introduction live in
[images/](./images/).

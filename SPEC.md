NoFlo Specification
===================

## Objective

NoFlo is a JavaScript implementation of the Flow-Based Programming paradigm for both browsers and server-based JavaScript engines (Node.js etc). NoFlo is meant to be usable as a library that can define and run a full program, or be used for a smaller part of an existing system.

Flow-Based Programming as implemented in NoFlo is a general purpose programming paradigm.

In Carkci's Dataflow book terms, NoFlo can be described as:

* Asynchronous activations
* Dynamic program structure
* Pushed data
* Immutable data is encouraged
* Nodes may be stateful or functional
* Multiple inputs and outputs
* Cycles allowed
* Recursion is not supported
* Uses per-node firing patterns
* Arc capacity: multiple tokens (IPs) can exist on an arc at any one time
* Arcs may join and split
* Multi-rate token production and consumption is allowed

The library is meant to be a durable piece of software that can be run and maintained for years or decades to come. Because of this, reliance on the standard web stack and minimization of technology dependencies outside of that is crucial.

## Tech stack

- Standard JavaScript following the EcmaScript specification as supported in evergreen browsers and Node.js
- JsDoc annotations are used to document all library functions and to define TypeScript type safety
- TypeScript compiler is used to verify type safety and to extract type definitions to their own files
- Testing is done using Node.js native test runner and assertion functionality
- Linting and formatting is done using Biome (default settings)

In NoFlo 1.x series:
- Dataflow is implemented using Node.js EventEmitter
- Library is published as both CommonJS and ES Modules
- Library methods support callback arguments and return Promises when this is not supplied
- Component loading and registration is done inside the NoFlo library
- Components may be written using CommonJS or ES Modules
- In addition to JavaScript, components can be written in CoffeeScript or TypeScript

NoFlo 2.x series goals:
- Dataflow is implemented using Web Streams API
- Library is published only as ES Modules
- Library methods use Promises, not callbacks
- Component loading and registration is done by the application calling NoFlo library
- Components must be written using ES Modules
- In addition to JavaScript, components can be written TypeScript

## Commands

- Build: `npm run build` (check type safety and extract TypeScript definitions from source code)
- Test: `npm test` (run unit tests)
- Lint: `npm run lint` to (check code for formatting errors)

## Project structure

- `src/`: library source code
- `spec/`: unit and integration tests
- `docs/`: documentation in Markdown format

## Boundaries

- ✅ Always: create a branch for any major change set, run tests after every change set
- ⚠️ Ask first: changes to public API, adding dependencies, modify CI config
- 🚫 Never: AI agents may not make commits on their own

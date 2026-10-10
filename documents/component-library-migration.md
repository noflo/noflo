# Migrating a NoFlo component library to NoFlo 2.x

This is a self-contained execution protocol for migrating a NoFlo component library (for example `noflo-strings`, `noflo-webserver`) to be compatible with `@noflo/noflo` 2.x. It is written to be handed to an LLM coding agent together with a path to the library repository, with no other context required.

Execute the phases in order. Do not skip the audit (phase 0) — the rest of the protocol depends on the inventory it produces. When this protocol conflicts with observable behavior of the installed `@noflo/noflo` 2.x version, the installed package wins: verify against its actual source before deviating, and record the deviation as an amendment (see below).

## Amending this document

This is living documentation. When you encounter an edge case, failure mode, or discovery rule not covered here, you are expected to contribute the finding back:

- Add a bullet to the [pitfall quick reference](#8-pitfall-quick-reference) with a minimal reproduction description and the fix.
- If the finding generalizes beyond one library (a new discovery rule, a new Process API constraint, a new test pattern), extend the relevant normative section as well.
- Keep amendments factual and minimal: state the observed behavior and the correct pattern, not the debugging journey.
- Reference concrete evidence (file and line in the installed `@noflo/noflo`, `@noflo/loader-node`, or `@noflo/fbp-spec-runner` source) where possible.

Amendments from real migrations are the primary way this guide stays correct. Prefer amending over working around silently.

## 1. Target state: what "NoFlo 2.x compatible" means

A library is 2.x-compatible when all of the following hold. Treat these as the definition of done; the final verification checklist in section 7 mirrors them.

**Terminology:** the opening and closing packets that structure a stream are **brackets** (`openBracket`/`closeBracket`), and a bracket-delimited sequence of IPs is a **stream**. The 0.x-era term "groups" is retired: prose, descriptions, and error messages say brackets, and components or ports whose legacy names contain "group" (for example `groups/ReadGroup` or its `group` port) keep those names for graph compatibility while their documentation speaks of brackets.

**Runtime and packaging:**

- The library is plain ESM (`"type": "module"` in `package.json`), zero build step: no Babel, Webpack, Grunt, Gulp, or CoffeeScript compiler in the pipeline.
- Components are `.js` files (ESM because of the package `type`) in a `components/` directory at the package root.
- It declares `"@noflo/noflo"` as a dependency (see the namespace mapping in section 5.2). It never depends on the unscoped `noflo` 1.x package.
- Supported runtime is Node.js >= 22 (`"engines": { "node": ">=22" }`). Cross-runtime compatibility with Deno and Bun comes for free if the Web-standards rules in section 3.8 are followed.

**Component contract:**

- Every component is implemented with the Process API (`component.process((input, output, context) => {...})`). Legacy styles (direct `outPorts.send`, `input.on("data")`, manual `beginGroup` handling) are not part of the migration target.
- Every component module exports a named `getComponent` function returning a component instance.
- Components honor the correctness rules in section 3: typed ports, control ports, bracket forwarding, error routing, statelessness, and 2.x backpressure semantics.

**Test contract:**

- Component behavior is covered by fbp-spec suites in `spec/`, executed with `@noflo/fbp-spec-runner`.
- Behavior the fbp-spec runner cannot express (server lifecycles, error-path assertions, timing) is covered by `node:test` files in `test/`.

**Base-class libraries:** a package whose public surface is a `Component` subclass or message helpers for other libraries to build on — `@noflo/assembly` in the core monorepo is the in-tree example — follows the packaging, tooling, and license rules above but ships no `components/` directory: the Component contract and the fbp-spec floor do not apply. Cover the class API (hook wiring through `process()`, validation, message helpers) with `node:test` suites, and exercise any embedded example graphs through `@noflo/loader-node` discovery instead of publishing them.

### 1.1 Component discovery in 2.x

NoFlo 2.x core does not discover anything. Applications supply a component registry; on Node.js the registry is provided by `@noflo/loader-node` (`createNodeModulesRegistry(baseDir)`), which discovers components via `fbp-manifest`. Library authors do not instantiate the registry, but the library layout must satisfy what it scans:

- Scanned directories: `components/` for components, `graphs/` for graph files (`.fbp`, `.json`) which register as pre-parsed subgraph components, `spec/` for fbp-spec files associated to components by file basename.
- Scanned file extensions for components: `.js`, `.coffee`, `.ts`, `.litcoffee`. **`.mjs` is NOT discovered** — never use the `.mjs` extension for components. Use `.js` and rely on `"type": "module"`.
- The component name is the file basename (`components/Replace.js` → `Replace`), overridable with an `@name Foo` comment in the source. Keep names equal to filenames.
- The library identifier is the npm package name minus any `@scope/` prefix and minus a leading `noflo-`: `noflo-strings` → components are addressed as `strings/Replace`; `@noflo/noflo` itself → bare names like `Repeat`.
- `noflo.icon` (a Font Awesome icon name without prefix) and `noflo.loader` are read from `package.json`. Keep the `noflo.icon` key.
- **`noflo.loader` plugin modules are Promise-based in 2.x.** A plugin is a module whose default export is a function receiving a registration shim (`registerComponent`, `registerGraph`, `setLibraryIcon`) and **returning a Promise** (or nothing) that settles when its registration work is done — the 1.x `(loader, callback)` completion-callback contract is gone. Do async registration work inside the function and return the promise; throwing or rejecting fails loading.
- Components are imported eagerly at discovery. Component modules must be side-effect free at import time: no server starts, no file writes, no timers.
- TypeScript components (`.ts`) are only loadable when a TypeScript compiler is installed in the consuming project (they go through a transpile-and-evaluate path). Migrated libraries should ship plain ESM JavaScript regardless.
- The generated `fbp.json` manifest cache is an application concern: never commit it to a library repository.

### 1.2 Loading shape

The loader accepts platform-neutral definitions: an ESM module object with a `getComponent` function, a bare factory function, or a `GraphModel`. The canonical library export is the named export:

```js
export function getComponent() {
  // build and return the component instance
}
```

CommonJS `exports.getComponent` modules are only reachable through CJS/ESM interop — do not rely on it; the target is ESM everywhere.

## 2. Execution protocol

### Phase 0 — Audit

Before changing anything, produce a migration plan and store it in the working notes. Inventory:

- Every component file: language, module system, Process API vs legacy, ports and their datatypes, presence of error ports, instance state, side effects.
- Every dependency: what it is used for, its `@noflo`-namespaced or native replacement.
- Test setup: framework, what each existing test asserts (these become the fbp-spec cases; do not lose coverage in translation).
- Build/CI artifacts: Grunt/Gulp/webpack configs, karma configs, `.travis.yml`, `.github/workflows/*`, `coffeelint`/`eslint` configs.
- License situation: run `git shortlog -sne` and inspect the LICENSE file and `package.json`. Existing component libraries keep their original license unchanged (see section 5.6); flag anything ambiguous to the user.
- README claims and examples that will need updating.

Deliverable: a checklist mapping each component and test to its migration action. Flag anything ambiguous (semantic changes, components that should be redesigned rather than translated) to the user before proceeding.

### Phase 1 — Package and tooling

See section 5 for the normative rules. Apply them: `package.json` (type, engines, exports, scripts, dependencies), `.editorconfig`, Biome, `tsconfig.json` with `checkJs`, GitHub Actions workflows including OIDC publishing, license, `CHANGELOG.md`.

Do this phase before touching component code, so that formatting and type checking are in place to validate phases 2–4.

### Phase 2 — Component source conversion

Mechanical conversion of every source file to the target shape (section 1): CoffeeScript to idiomatic JavaScript, CommonJS to ESM, `node:` prefixes for builtins, removal of `coffeescript`/`grunt`/`karma`/`webpack` artifacts and the original `.coffee` files. Do not change behavior in this phase beyond what the module conversion requires; semantic fixes are phase 3.

Delete converted `.coffee` files with `git mv`-equivalent history preservation where renaming applies (for CoffeeScript-to-JS this is a rewrite, not a rename; new `.js` files replace them).

### Phase 3 — Component correctness

Walk every component against the normative rules in section 3 and fix violations: missing datatypes, missing error routing, manual default handling, dead early-return branches, un-awaited fan-out sends, instance state that is not generator resource, sync APIs replaced with native async ones.

### Phase 4 — Tests

Migrate tests per section 4: one fbp-spec YAML suite per component in `spec/` (primary), `node:test` files in `test/` for what the runner cannot express (fallback). Every component must have at least one fbp-spec case — that is the smoketest floor.

### Phase 5 — Documentation and verification

- Update README: ESM/`@noflo/noflo` examples, correct install/usage instructions, removed badges, removed stale "Changes" sections (moved to CHANGELOG.md in phase 1).
- Update the `CHANGELOG.md` Unreleased segment with the migration summary.
- Run the full verification checklist in section 7 and report the result to the user. Leave changes uncommitted for review.

## 3. Component authoring rules (normative)

### 3.1 File and export shape

```js
// components/DoThing.js
import { Component } from "@noflo/noflo";

/**
 * @returns {import("@noflo/noflo").Component} The configured component
 */
export function getComponent() {
  const c = new Component({
    description: "One-line description of what the component does",
    inPorts: { /* ... */ },
    outPorts: { /* ... */ },
  });
  c.process((input, output) => {
    // ...
  });
  return c;
}
```

- One component per file, filename equals component name.
- Component names are verbs (`SplitStr`, `SendResponse`), not nouns. Do not rename existing components during migration (that breaks consumer graphs); apply the naming rule to new components only.
- The options-object constructor form shown above is preferred; imperative `c.inPorts.add(...)` after construction is equivalent and also supported.
- Set `c.icon` on components where a component-specific icon helps; the library default comes from `noflo.icon` in `package.json`.
- Component modules are side-effect free at import time (discovery imports them eagerly).

### 3.2 Ports

- Every port declares a `datatype`. Valid values: `all`, `string`, `number`, `int`, `object`, `array`, `boolean`, `color`, `date`, `bang`, `function`, `buffer`, `stream`. Use `all` only when the component genuinely accepts anything.
- Every port gets a `description` where the role is not obvious from the name.
- Firing inports trigger `process`; control ports (`control: true`) carry configuration, do not trigger processing, and are typically fed by IIPs. Reading a control port does not consume the packet. Control ports buffer the latest stream: brackets are kept, a new stream (openBracket or unbracketed data IP) discards the previously buffered one, `has()`/`hasData()` report whether a data IP is present in the buffered stream, and `getStream()` reads the buffered stream — so multi-value configuration streams can be read from control ports.
- Give control ports a `default` where a sensible one exists. Because delivery timing of IIPs versus data is not guaranteed within one activation, guard reads: check `input.hasData("pattern")` before `input.getData("pattern")` and keep a local fallback. Do not assume a default is readable when `hasData` is false.
- Mark ports the component cannot work without as `required: true`.
- Declare an `error` outport (`datatype: "object"`) on every component that can fail (see 3.5).

### 3.3 Process function

- Preconditions first: `if (!input.hasData("in")) return;` and, for multi-port components, batch the check: `if (!input.hasData("in", "options")) return;`.
- **The Process API contract is: check preconditions with `has`, then activate and start processing with `get`.** Reading a port with `getData()`/`get()` while an activation is still waiting for more data is a footgun: that pending activation will never re-invoke — `load` never drains and `shutdown()` hangs (verified against 2.0.0-alpha.1). `has`/`hasData` are safe while waiting. So: check everything with `has` first; only once the firing pattern is confirmed, `get` the values and process to completion. On control ports `has()` means a data IP is present in the buffered stream — buffered brackets alone do not satisfy it. Note the distinction matters for buffer introspection too — decide the component's mode (which branch to take) from `has`-level checks and raw buffer inspection *before* any `get`.
- **The process function fires on data IPs only.** Brackets never fire it — 1.x components that read every IP with `input.get()` and handled bracket types manually (to forward bracket structure) translate to plain data-only processes plus `forwardBrackets`; the 2.x machinery forwards brackets around the data sends automatically. Consequence: a bracket-only stream (brackets without any data packet) produces nothing on the outputs — forwarded brackets attach to actual sends (see below). 1.x advanced APIs still exist where genuinely needed: `input.get()` for raw buffered IPs, `output.sendIP()`, the `autoOrdering` component option, and `InPort.getBuffer(scope)`.
- `getData` consumes the packet from the firing port; reads on control ports are non-consuming.
- Streams: `hasStream`/`getStream` for complete bracketed streams; brackets arriving on an inport are forwarded by default to `out` and `error` (`forwardBrackets` defaults to `{ in: ["out", "error"] }`). With multiple data outports, declare `c.forwardBrackets` explicitly, listing every port that should carry the bracket structure through. Set `c.forwardBrackets = {}` for components where bracketing is meaningless (generators, sinks). Forwarded brackets attach to actual sends: an outport listed in `forwardBrackets` that receives no send during the activation stays completely silent — e.g. on an error path only the `error` port receives the brackets, and data outports get nothing (not even empty brackets).
- Addressable ports (`addressable: true`): check availability with `input.hasData(["port", idx])` over `input.attached("port")`, and send with `new IP("data", value, { index: idx })`.
- Scopes: packets carry a `scope`; downstream propagation is automatic. Components that mix unscoped background data into scoped flows set `scoped: false` on the inport receiving the unscoped stream. Components creating new isolation contexts (one per request, per job) assign `scope` on the `IP` they emit.

### 3.4 Async/await trap

A Promise returned from the `process` function is interpreted by NoFlo as an implicit `output.sendDone(resolvedValue)` (rejection becomes `done(err)`). Therefore:

- Never declare `process` itself `async`.
- Pick one style per component:
  - **Promise-pure**: perform async work and return the Promise; resolve with the output map (or nothing), never calling `send`/`done` inside. The `output` parameter is then unused and can be omitted from the callback signature.
  - **Explicit**: call `output.send`/`output.sendDone`/`output.done` yourself and return nothing from `process`.
  - Mixing the two styles corrupts the activation lifecycle.
- For multi-packet fan-out with backpressure (below) the explicit style with an inner async function is the pattern; call it fire-and-forget with a `.catch((err) => output.done(err))` and do not return its Promise.

### 3.5 Errors

- Processing failures are reported on the `error` outport: `output.done(err)` after a partial send, or `output.error(err)` followed by `output.done()` when nothing was sent yet. `output.sendDone(err)` also routes an Error (or Error array) to the error port.
- Declare the `error` outport explicitly. If it is absent, a processing error is thrown into the network instead of routed.
- Wrap fallible operations (`new RegExp`, `JSON.parse`) and route the caught error; do not let exceptions escape the process function except through the error port convention.

### 3.6 Statelessness, generators, and resources

- Processing state lives in packets, not on the component instance. No instance variables that accumulate per-activation data.
- The one exception is generator components — long-lived components that emit over time (servers, timers, stream readers). Their held resources (sockets, intervals, contexts) may be stored on the instance or in the `getComponent` closure, but:
  - Key resource maps by scope where the generator is per-scope (one timer/server per scoped flow).
  - Keep the activation context open (do not call `done`) for as long as the resource lives; deactivate it when the resource is released.
  - Register a `tearDown` (it may be `async` / return a Promise) that releases every held resource; it is called at network shutdown. A network that cannot shut down cleanly is a migration bug.
  - Emit from event handlers with `component.outPorts.<port>.sendIP(new IP("data", data, { scope }))` rather than through a stale `output` handle from a past activation.
- Replace instance-state patterns from 1.x (`c.servers = {}`) with closure-scoped structures; they are private per instance and cannot collide across nodes.

### 3.7 Backpressure

2.x edges apply consumer-paced backpressure via high-water marks. `output.send`/`sendDone` return Promises that resolve when the receiving edges admitted the packet(s). Fire-and-forget is safe for single packets; sending errors escalate through the socket error path.

- For fan-out loops (splitting one input into many outputs), await admission inside an inner async function:

```js
c.process((input, output) => {
  if (!input.hasData("in")) return;
  const data = input.getData("in");
  const sendAll = async () => {
    for (const part of data.split("\n")) {
      await output.send({ out: part }); // respects the edge high-water mark
    }
    output.done();
  };
  sendAll().catch((err) => output.done(err));
});
```

- Do not return the inner Promise from `process` (see 3.4).
- `await output.send(...)` (without `done`) is also the correct way to pace output inside long-running generator bodies.

### 3.8 Dependency modernization inside components

Dependency resolution follows a strict ladder. Resolve each need at the highest-priority level that covers it:

1. **Web platform standards** — APIs shared by evergreen browsers and WinterTC (Web-interoperable Runtimes Community Group) server-side runtimes: `fetch`, `URL`/`URLSearchParams`, `TextEncoder`/`TextDecoder`, `structuredClone`, Web streams, `console`, `crypto.randomUUID`, `crypto.subtle.digest` (SHA-1/SHA-256/SHA-384/SHA-512), `atob`/`btoa`, `setTimeout`/`AbortSignal`. These make components multiplatform (Node, Deno, Bun, browser) at zero dependency cost
2. **`node:` standard library** — for platform needs the Web standards do not cover: `node:fs`, `node:http`/`node:https` servers, `node:child_process`, `node:net`, and hashes outside the WebCrypto set (e.g. MD5). Acceptable for components that are inherently server-side; a component using only level-1 plus level-2 APIs still runs on all server-side runtimes
3. **Third-party dependencies** — only when neither level covers the need. Prefer small, dependency-free packages; for tiny needs (a few dozen lines), an inline implementation in the component may beat adding a dependency

Rules:

- Replace `underscore`/`lodash` with native `Array`/`Object`/`String` methods (level 1).
- Replace `uuid` with the global `crypto.randomUUID()` — a Web standard, not `node:crypto` (level 1).
- Replace `btoa`/`atob` packages with the globals; for binary work use `Uint8Array` (Web standard) over `Buffer` where Web APIs are unavailable (level 1).
- Replace `request`/`node-fetch`/`axios` with native `fetch` (level 1).
- Replace callback-style async APIs with Promise/async-await versions; Node builtins with Promises APIs (`node:fs/promises`, `node:timers/promises`) (level 2).
- **WebCrypto has no MD5**: `crypto.subtle.digest` only supports SHA-1/SHA-256/SHA-384/SHA-512. Gravatar-style MD5 hashing needs `node:crypto` `createHash("md5")` (server-only) or an inline pure-JS implementation (multiplatform). When a service offers a SHA-256 alternative (Gravatar does), prefer it — it is level-1 native. Record the choice and its platform implications in the migration notes.
- When choosing between Web-standard and `node:` APIs that both cover a need (e.g. `URL` vs `node:url`), the Web standard wins.

## 4. Testing rules

### 4.1 fbp-spec suites (primary)

One YAML file per component at `spec/<ComponentName>.yaml` (basename matches the component name so tooling can associate tests). The runner discovers `.yaml`, `.yml`, and `.json` recursively and executes them in-process against the project's discovered components.

```yaml
topic: strings/Replace
cases:
  - name: no pattern
    assertion: should pass the string through unchanged
    inputs:
      in: abc123
    expect:
      out:
        equals: abc123
  - name: simple replacement
    assertion: should replace all occurrences
    inputs:
      pattern: abc
      replacement: xyz
      in: abc123abc
    expect:
      out:
        equals: xyz123xyz
```

- `topic` is the fully qualified component name (`libraryId/Name`).
- `inputs` maps port names to data; `expect` maps outport names to an expectation object. One operator per expectation: `equals` (deep), `above`, `below`, `type` (Chai-style names: `string`, `number`, `object`, `array`, `null`, ...), `haveKeys`, `includeKeys`, `contains`, `noterror`, `path` (JSONPath selector applied to the data before the operator; every match must satisfy it, zero matches fails).
- **Ordering pitfall**: inputs are posted in map order and data on a firing port triggers the component immediately. List control ports before the firing port, as in the example above. Naive ordering (firing port first) fails deterministically — the component fires before the configuration arrives.
- **Per-step expectation semantics**: when one step emits multiple data packets on the same outport (fan-out), the expectation is evaluated against the last data IP received on that port in that step. Asserting intermediate packets of a fan-out is not possible in fbp-spec v1 — cover it with a node:test fallback if it matters.
- **Error ports**: to assert error behavior, include `error` in `expect` — the runner then attaches a socket to the error port and the expectation evaluates against the error value (an `Error` instance; use `path: $.message` with `contains`/`equals` to assert on the message). An error emitted to an error port that is not in `expect` goes nowhere and the case times out on the missing `out` packet instead of failing fast — so always assert the error port when a case exercises a failure path, or cover it in node:test.
- Stateful components: give `inputs` and `expect` as arrays; they are zipped pairwise and executed in series (send step i, assert step i, proceed).

```yaml
name: Accumulate
topic: core/Accumulate
cases:
  - name: running total
    assertion: should accumulate across steps
    inputs:
      - in: 1
      - in: 2
    expect:
      - out: { equals: 1 }
      - out: { equals: 3 }
```

- Optional per-suite/per-case `timeout` (ms, default 2000) and `skip` (string reason).
- Suites may be combined multiple-per-file using `---` YAML document separators.
- Errors escalate to a case failure only through socket-level error events (e.g. a processing error thrown with no error port attached) or an `expect` on the error port as described above. The runner asserts data IPs only, so **positive-path behavior belongs in fbp-spec; complex error-path and lifecycle assertions belong in node:test files**.
- Quote regex-like strings with single quotes in YAML to avoid escape surprises.

Runner invocation (devDependency `@noflo/fbp-spec-runner`):

```
fbp-spec-runner [--base-dir <dir>] spec/
```

**Invocation caveat**: in current runner versions the CLI's self-detection compares `process.argv[1]` against the module's real path, which fails when Node is invoked through the npm `.bin` symlink — the run silently exits 0 having tested nothing. Until that is fixed, invoke through the resolved real path in test scripts:

```
"test:spec": "node \"$(node -p \"require.resolve('@noflo/fbp-spec-runner/src/cli.js')\")\" spec/"
```

Guard against the silent-no-op failure mode: a green run that prints no suite output has tested nothing — CI should fail on empty runner output.

### 4.2 node:test fallback

Use `node:test` files under `test/` (plain `.js`, ESM via the package `"type": "module"`) when a test needs:

- Server or generator lifecycle (start server, make a real request, shut down).
- Asserting error-port output, packet types, scopes, or bracket structure (fbp-spec v1 asserts data payloads only).
- Timing behavior or anything the suite vocabulary cannot express.

Pattern: instantiate the component directly via `getComponent()` (or through a `ComponentLoader` built on `createNodeModulesRegistry`), drive it with `noflo.internalSocket.createSocket()` sockets, and use `node:assert/strict`. Name files with the `.test.js` suffix (e.g. `test/Server.test.js`) — Bun's runner only discovers files with `.test`/`.spec` in the filename, and `node --test` works with either naming:

```js
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as noflo from "@noflo/noflo";
import { getComponent } from "../components/Server.js";

describe("Server component", () => {
  it("emits a scoped request pair per HTTP request", async () => {
    const c = getComponent();
    const listen = noflo.internalSocket.createSocket();
    const request = noflo.internalSocket.createSocket();
    const listening = noflo.internalSocket.createSocket();
    c.inPorts.listen.attach(listen);
    c.outPorts.request.attach(request);
    c.outPorts.listening.attach(listening);

    try {
      listen.post(new noflo.IP("data", 0)); // port 0 = OS-assigned, test-safe
      const port = await new Promise((resolve, reject) => {
        listening.addEventListener("data", (event) => resolve(event.detail));
        request.addEventListener("error", (event) => reject(event.detail));
      });

      const ip = await new Promise((resolve, reject) => {
        request.addEventListener("ip", (event) => resolve(event.detail));
        request.addEventListener("error", (event) => reject(event.detail));
        fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(2000) })
          .catch(reject);
      });
      assert.equal(ip.type, "data");
      assert.ok(typeof ip.scope === "string" && ip.scope.length > 0);
      ip.data.res.end();
    } finally {
      // Must close all servers via tearDown, also on assertion failure —
      // a leaked server keeps the test process alive forever
      await c.shutdown();
    }
  });
});
```

- Use the EventTarget API (`addEventListener`) on internal sockets; the legacy EventEmitter surface (`once`, `on`) still works but emits deprecation warnings, and native listeners receive a CustomEvent whose payload is in `.detail`.
- Always clean up generator components in a `finally` (`await c.shutdown()` must resolve) — leaked servers fail CI runs nondeterministically.
- Prefer OS-assigned ports (0) over fixed ports to avoid flakiness; have the component emit the assigned port (see 6.3).
- Bound every async wait with a timeout (`AbortSignal.timeout`, `node:assert/strict`'s `rejects` with timers, or test-level `timeout`); a hanging test is a migration bug to fix, not to mask with long timeouts.

### 4.3 Test scripts

```json
{
  "scripts": {
    "test": "npm run types && npm run lint && npm run test:spec && npm run test:node",
    "test:spec": "node \"$(node -p \"require.resolve('@noflo/fbp-spec-runner/src/cli.js')\")\" spec/",
    "test:node": "node --test test/*.test.js"
  }
}
```

- Pass the files as an unquoted shell glob. Do not pass a directory (`node --test test/` is unreliable across Node versions) and do not quote the glob (glob arguments to the runner require newer Node than the supported floor of 22). The glob needs at least one file to exist.
- The `test:spec` invocation goes through `require.resolve` because of the runner CLI symlink caveat described in 4.1; simplify to `fbp-spec-runner spec/` once that is fixed.
- Cross-runtime verification: libraries whose components stay on levels 1–2 of the dependency ladder (3.8) should run under Deno and Bun as well. Provide opt-in `test:deno` (`deno test --allow-all --no-check test/*.test.js`) and `test:bun` (`bun test test/*.test.js`) scripts outside the default `test` chain, and run them locally; whether they join the CI matrix is a per-library decision. As of this writing the `@noflo/fbp-spec-runner` CLI runs on Node and Deno but not Bun (Bun's `node:test` shim does not support the runner's dynamic suite registration) — the `node:test` fallback covers all three runtimes.
- The `test:node` leg requires at least one file in `test/` to exist; a library with no fallback tests yet should omit that leg from `test` until the first one lands.
- Do not add Mocha, Chai, Karma, or assertion libraries.

## 5. Package, tooling, CI, and publishing

### 5.1 package.json

```json
{
  "name": "noflo-strings",
  "description": "...",
  "type": "module",
  "engines": { "node": ">=22" },
  "noflo": { "icon": "font" },
  "dependencies": {
    "@noflo/noflo": "^2.0.0"
  },
  "devDependencies": {
    "@noflo/fbp-spec-runner": "^2.0.0",
    "@noflo/loader-node": "^2.0.0",
    "@types/node": "^24.0.0",
    "@biomejs/biome": "^2.0.0",
    "typescript": "^5.0.0"
  },
  "scripts": {
    "lint": "npx @biomejs/biome check --use-editorconfig=true components/ spec/ test/",
    "format": "npx @biomejs/biome check --use-editorconfig=true --write components/ spec/ test/",
    "types": "tsc -p tsconfig.json",
    "test": "npm run types && npm run lint && npm run test:spec && npm run test:node",
    "test:spec": "node \"$(node -p \"require.resolve('@noflo/fbp-spec-runner/src/cli.js')\")\" spec/",
    "test:node": "node --test test/*.test.js"
  }
}
```

- `@noflo/loader-node` is a devDependency even though the library never imports it in production code: it powers the discovery smoke test in section 7 (and would otherwise rely on undefined transitive resolution).
- An `exports` map is only needed if the package has a programmatic entry point (`index.js`); component discovery is filesystem-based and does not use it.
- Add `files` including at least `components/`, `graphs/` (if present), `spec/`, `test/` (if present), `README.md`, `CHANGELOG.md`, `LICENSE`.
- Do not commit a generated `fbp.json`.

### 5.2 Migrate dependencies to the @noflo namespace

NoFlo 2.x ecosystem packages are published under the `@noflo` npm scope. Map every NoFlo-ecosystem dependency to its namespaced equivalent and require the 2.x line:

| Legacy dependency | 2.x replacement | Role |
|---|---|---|
| `noflo` | `@noflo/noflo` | Core library (runtime dependency) |
| `fbp-graph` / `noflo-graph` | `@noflo/graph` | Native graph model, if the library manipulates graphs |
| `fbp-spec` (as runner) | `@noflo/fbp-spec-runner` | Test runner (devDependency) |
| `noflo-component-loader` / webpack loader plugins | not needed | 2.x is zero-build; browser apps use static registry literals |
| `noflo-nodejs` (as a library dependency) | remove | It is a CLI for running graphs, not a library dependency; tests use `@noflo/fbp-spec-runner` |
| `as-component` | `@noflo/as-component` | Function-to-component generation, if used |
| `noflo-assembly` | `@noflo/assembly` | Message-relay conventions and the Assembly Line `Component` base class, if used |

Rules:

- The core dependency is exactly `"@noflo/noflo": "^2.0.0"` in `dependencies`. A library depending on unscoped `noflo` 1.x alongside `@noflo/noflo` 2.x mixes generations and is not a valid end state.
- For any other NoFlo-related package in the dependency tree, check npm for an `@noflo`-scoped 2.x version before keeping the legacy one. If none exists, either inline the small amount of needed functionality or stop and ask the user.
- Component imports use the named surface of `@noflo/noflo`: `Component`, `InPort`, `OutPort`, `IP`, `InPorts`, `OutPorts`, `ComponentLoader`, `internalSocket`, `createNetwork`, `asCallback`, `asPromise`.

### 5.3 Lint, format, types

- `.editorconfig` at root:

```
root = true

[*]
end_of_line = lf
insert_final_newline = true
charset = utf-8
indent_style = space
indent_size = 2
trim_trailing_whitespace = true
```

- Biome replaces ESLint/JSHint/coffeelint; run via the `lint`/`format` scripts above.
- TypeScript checking without conversion, enforced by the `types` script:

```json
{
  "compilerOptions": {
    "allowJs": true,
    "checkJs": true,
    "noEmit": true,
    "strict": true,
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "target": "ES2022",
    "skipLibCheck": true
  },
  "include": ["components/", "test/"]
}
```

- Add JSDoc types to exported functions and component typedefs. Run the formatter and the type check after every source change.
- The check resolves types through the dependencies' declarations. When `@noflo/noflo` comes from a workspace checkout rather than npm, run that checkout's `npm run types` first, or every symbol imported from it (and every callback parameter typed through it) reports TS7016/TS7006 — see the pitfalls section. Do not weaken `strict` or `checkJs` to silence that cascade.

### 5.4 CI

- Delete legacy automation (`.travis.yml`, `appveyor.yml`, old CircleCI config, `.github/dependabot.yml`).
- **Deactivate the external CI services themselves**: deleting `.travis.yml` or `appveyor.yml` does not remove the project from Travis CI or AppVeyor — those services keep building on push and fail ( emailing maintainers) once the config file is gone. After each library migration, disable or remove the corresponding project in the service's settings. This is a maintainer account action, not a repository change; track it per library (the config file's presence in the old HEAD is the indicator that a service integration exists).
- `.github/workflows/test.yml`: checkout + `setup-node`, run `npm ci` and `npm test` on the supported Node lines (22.x, 24.x).
- Keep workflows minimal; no release steps in the test workflow.

### 5.5 Publishing (OIDC)

Publishing uses npm trusted publishing with OpenID Connect — no `NPM_TOKEN` secret, no legacy `.npmrc` auth tokens. `.github/workflows/publish.yml`:

```yaml
name: Publish to npm

on:
  push:
    tags:
      - "v*"

permissions:
  id-token: write  # Required for OIDC trusted publishing
  contents: read

concurrency:
  group: npm-publish-${{ github.ref }}
  cancel-in-progress: false

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "24.x"
          cache: npm
          registry-url: https://registry.npmjs.org

      - run: npm ci

      - name: Verify the tag matches the package version
        run: |
          set -euo pipefail
          TAG="${GITHUB_REF_NAME#v}"
          VERSION=$(node -p "require('./package.json').version")
          if [ "$TAG" != "$VERSION" ]; then
            echo "::error::Tag 'v$TAG' does not match package version '$VERSION'"
            exit 1
          fi

      - name: Test
        run: npm test

      - name: Publish
        run: |
          NAME=$(node -p "require('./package.json').name")
          VERSION=$(node -p "require('./package.json').version")
          # Skip versions already on the registry (the first publish of each
          # package is done manually before its tag exists)
          if npm view "$NAME@$VERSION" version >/dev/null 2>&1; then
            echo "Version $NAME@$VERSION already published, skipping"
            exit 0
          fi
          # npm requires an explicit tag for prerelease versions
          case "$VERSION" in
            *-*) npm publish --tag next ;;
            *) npm publish ;;
          esac
```

- The package must be configured for trusted publishing on npmjs.com (package settings → publishing access → GitHub Actions). Note this in the PR description if it has not been done.
- Never reintroduce secret-token publishing.
- Releases are cut with the maintainer's `release-npm` tool: version + changelog `[Unreleased]` stamp, one `Release v<version>` commit, tag, push. npm publishing is not part of the tool — the first publish of each `@noflo/*` package is manual (OIDC trusted publishing cannot create packages), later versions publish from the `v*` tag, and the workflow skips versions already on the registry. Prerelease versions publish under the `next` dist-tag (npm requires an explicit tag for prereleases). Deprecating the legacy `noflo-*` names is deferred until 2.x stable.
- JSR publishing for libraries (a `jsr.json` plus the doc-coverage gate, mirroring the core monorepo's JSR steps) is planned but not yet part of the per-repo template.

### 5.6 License and changelog

- License: existing component libraries keep their original license unchanged (product decision 2026-10-08; e.g. MIT stays MIT regardless of contributor count). EUPL-1.2 relicensing applies only to genuinely new libraries, when single-author. When in doubt, ask the user.
- `CHANGELOG.md` in Keep a Changelog format with an `Unreleased` segment describing the migration (2.x compatibility, ESM, test runner switch, dependency changes, license change if any). If the README had a hand-rolled changes section, move it into the changelog.
- README: rewrite examples for ESM and `@noflo/noflo`, drop badges, drop stale claims. Flag (do not silently fix) content that needs product decisions.

## 6. Worked examples

### 6.1 Simple Process API component — `strings/Replace`

Before (1.x, CJS, manual default handling, dead branch on falsy data):

```js
const noflo = require('noflo');

exports.getComponent = function () {
  const c = new noflo.Component();
  c.description = 'Given a fixed pattern and its replacement, replace all occurrences in the incoming template.';

  c.inPorts.add('in', {
    datatype: 'string',
    description: 'String to replace pattern in',
  });
  c.inPorts.add('pattern', {
    datatype: 'string',
    description: 'Pattern to replace',
    control: true,
  });
  c.inPorts.add('replacement', {
    datatype: 'string',
    description: 'Replacement for the pattern',
    control: true,
  });
  c.outPorts.add('out',
    { datatype: 'string' });

  return c.process((input, output) => {
    let pattern;
    if (!input.has('in')) { return; }

    if (input.has('pattern')) {
      pattern = new RegExp(input.getData('pattern'), 'g');
    }
    let replacement = '';
    if (input.has('replacement')) {
      replacement = input.getData('replacement').replace('\\\\n', '\n');
    }

    const data = input.getData('in');
    if (!data) { return; }
    if (!pattern) {
      output.sendDone({ out: data });
      return;
    }
    output.sendDone({ out: `${data}`.replace(pattern, replacement) });
  });
};
```

After (2.x, ESM, declared defaults, error routing, no dead branch — empty strings are valid data):

```js
import { Component } from "@noflo/noflo";

/**
 * Replaces all occurrences of a pattern in the incoming string.
 * @returns {import("@noflo/noflo").Component} The configured component
 */
export function getComponent() {
  const c = new Component({
    description: "Given a fixed pattern and its replacement, replace all occurrences in the incoming string",
    inPorts: {
      in: {
        datatype: "string",
        description: "String to replace pattern in",
      },
      pattern: {
        datatype: "string",
        description: "Regular expression pattern to replace",
        control: true,
      },
      replacement: {
        datatype: "string",
        description: "Replacement for the pattern",
        control: true,
        default: "",
      },
    },
    outPorts: {
      out: {
        datatype: "string",
      },
      error: {
        datatype: "object",
        description: "Invalid regular expression errors",
      },
    },
  });

  c.process((input, output) => {
    if (!input.hasData("in")) {
      return;
    }
    const data = input.getData("in");
    if (!input.hasData("pattern")) {
      // No pattern received: pass through unchanged
      output.sendDone({ out: data });
      return;
    }
    const replacement = input.hasData("replacement")
      ? input.getData("replacement")
      : "";
    let regex;
    try {
      regex = new RegExp(input.getData("pattern"), "g");
    } catch (err) {
      output.done(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    output.sendDone({ out: data.replace(regex, replacement) });
  });

  return c;
}
```

### 6.2 Fan-out component with backpressure — `strings/SplitStr`

The 1.x version sends each part with `output.send` in a `forEach` and never observes admission. The 2.x version awaits each send (see 3.7):

```js
import { Component } from "@noflo/noflo";

/**
 * Splits the incoming string on a delimiter, emitting one packet per part.
 * @returns {import("@noflo/noflo").Component} The configured component
 */
export function getComponent() {
  const c = new Component({
    description: "Split a string into multiple packets using a delimiter",
    inPorts: {
      in: {
        datatype: "string",
        description: "String to split",
      },
      delimiter: {
        datatype: "string",
        description: "Delimiter used to split; /re/ form is treated as a regular expression",
        control: true,
        default: "\n",
      },
    },
    outPorts: {
      out: {
        datatype: "string",
        description: "One packet per split part",
      },
    },
  });

  c.process((input, output) => {
    if (!input.hasData("in")) {
      return;
    }
    const data = input.getData("in");
    const delimiter = input.hasData("delimiter")
      ? input.getData("delimiter")
      : "\n";
    let splitter = delimiter;
    if (delimiter.length > 1 && delimiter.startsWith("/") && delimiter.endsWith("/")) {
      splitter = new RegExp(delimiter.slice(1, -1));
    }
    const sendAll = async () => {
      for (const part of data.split(splitter)) {
        await output.send({ out: part }); // backpressure-aware
      }
      output.done();
    };
    sendAll().catch((err) => output.done(err));
  });

  return c;
}
```

### 6.3 Generator component — `webserver/Server`

Before: CoffeeScript, `connect`-era callback APIs, servers stored on the component instance, no `tearDown` return-Promise form, manual `uuid` dependency. After: native `node:http`, closure-scoped resource map, scoped request IPs, async `tearDown`, error routing. This is the reference shape for any component that holds long-lived resources:

```js
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { Component, IP } from "@noflo/noflo";

/**
 * Starts an HTTP server per received port number, emitting one scoped
 * request/resolution pair per incoming HTTP request.
 * @returns {import("@noflo/noflo").Component} The configured component
 */
export function getComponent() {
  const c = new Component({
    description: "This component receives a port, starts an HTTP server on it, and sends out a request/response pair for each HTTP request it receives",
    icon: "globe",
    inPorts: {
      listen: {
        datatype: "int",
        description: "Port to listen on; triggers server startup",
      },
      close: {
        datatype: "int",
        description: "Port to shut down a listening server; triggers shutdown",
      },
    },
    outPorts: {
      request: {
        datatype: "object",
        description: "req/res pair for each HTTP request, one scope per request",
      },
      listening: {
        datatype: "int",
        description: "Assigned port number once the server is listening",
      },
      error: {
        datatype: "object",
      },
    },
  });

  /** @type {Map<number, { server: import("node:http").Server, context: { deactivated?: boolean, deactivate(): void } }>} */
  const servers = new Map();

  /**
   * @param {number} port
   * @returns {Promise<void>}
   */
  const closeServer = (port) =>
    new Promise((resolve, reject) => {
      const entry = servers.get(port);
      if (!entry) {
        resolve();
        return;
      }
      entry.server.close((err) => {
        servers.delete(port);
        // End the activation that started this server
        if (entry.context && !entry.context.deactivated) {
          entry.context.deactivate();
        }
        if (err) reject(err);
        else resolve();
      });
      // Don't let keep-alive connections stall shutdown
      entry.server.closeAllConnections();
    });

  c.tearDown = async () => {
    await Promise.all([...servers.keys()].map((port) => closeServer(port)));
  };

  c.process((input, output, context) => {
    if (input.hasData("close")) {
      const port = input.getData("close");
      closeServer(port)
        .then(() => output.done())
        .catch((err) => output.done(err));
      return;
    }
    if (!input.hasData("listen")) {
      return;
    }
    const port = input.getData("listen");
    if (servers.has(port)) {
      // Already listening on this port
      output.done();
      return;
    }
    const server = createServer();
    let failed = false;
    server.on("error", (err) => {
      failed = true;
      servers.delete(port);
      output.done(err instanceof Error ? err : new Error(String(err)));
    });
    server.listen(port, () => {
      if (failed) return;
      servers.set(port, { server, context });
      // Emit the assigned port, so port 0 (OS-assigned) is usable
      const address = /** @type {import("node:net").AddressInfo} */ (
        server.address()
      );
      output.send({ listening: address.port });
      // Keep this activation open for the lifetime of the server;
      // closeServer deactivates it when the server closes
      server.on("request", (req, res) => {
        c.outPorts.request.sendIP(
          new IP("data", { req, res, port }, { scope: randomUUID() }),
        );
      });
    });
  });

  return c;
}
```

Its lifecycle test belongs in `test/Server.js` per section 4.2.

### 6.4 Converting a Mocha/Chai spec to fbp-spec

The 1.x `spec/Replace.js` style — component loader, `internalSocket` wiring, packet arrays shifted in `data` handlers, `disconnect` as completion signal — translates to the declarative suite in 4.1. Preserve every asserted scenario as a case; a scenario that cannot be expressed (e.g. asserting that nothing was sent) either becomes a `node:test` case or is recorded as intentionally dropped coverage in the migration notes.

## 7. Final verification checklist

Run all of these; the migration is done when every line holds:

- [ ] `npm ci && npm test` passes from a clean checkout (types, lint, fbp-spec suites, node:test).
- [ ] No `.coffee`, no Grunt/Gulp/webpack/karma configs, no `coffeescript`/`mocha`/`chai`/`underscore`/`uuid`/`request` in the tree.
- [ ] `grep -r "require(" components/` finds nothing; all component files are ESM `.js`.
- [ ] No component uses the `.mjs` extension; `components/` and `graphs/` are the only source locations.
- [ ] Every component: named `getComponent` export, all ports typed, error outport where failures are possible, no instance processing state, no top-level side effects.
- [ ] Every component has at least one fbp-spec case; server/generator and error-path behavior covered in `test/`.
- [ ] Dependency on `@noflo/noflo` ^2.0.0; devDependencies include `@noflo/fbp-spec-runner` and `@noflo/loader-node`; no unscoped `noflo` 1.x anywhere; no `noflo-nodejs` as a library dependency.
- [ ] A quick smoke: `node -e "import('@noflo/loader-node').then(async (m) => { const r = await m.createNodeModulesRegistry(process.cwd()); await r.discover(); console.log(Object.keys(r.components)); })"` lists every expected component name.
- [ ] `package.json`: `type: module`, engines >= 22, scripts, files, license per 5.6; `CHANGELOG.md` Unreleased updated; README current.
- [ ] CI: `test.yml` on Node 22/24; `publish.yml` uses OIDC trusted publishing; no legacy CI files or auth tokens remain; Travis/AppVeyor projects deactivated in their service settings.
- [ ] Fixture/data files are not lint targets: Biome parses everything matched by the lint globs, including e.g. HTML fixtures under `spec/fixtures/` — narrow the `lint`/`format` globs (e.g. `'spec/**/*.yaml'`) or exclude fixture paths.
- [ ] Changes left uncommitted for review, with a summary of semantic changes and any dropped coverage called out explicitly.

## 8. Pitfall quick reference

- **The Process API contract is: check preconditions with `has`, then activate and start processing with `get`.** Reading a port with `getData`/`get` while the activation is still waiting for more data means that pending activation never re-invokes: `load` never drains and `shutdown()` hangs. `has`/`hasData` are safe while waiting. Decide any branching (e.g. which processing mode to use) from `has`-level checks and raw buffer inspection before the first `get` (see 3.3).
- **`.mjs` is not discovered** by `fbp-manifest`; use `.js` + `"type": "module"`.
- **Leftover `.coffee` files in `components/` are fatal, not just dead weight**: 2.x discovery eagerly imports every discovered file with the native ESM loader, and an uncompiled CoffeeScript file crashes registry construction with `ERR_UNKNOWN_FILE_EXTENSION`. Delete each converted `.coffee` file in the same pass as the `.js` replacement — including components being dropped entirely (a deleted component's `.coffee` must still go).
- **Component name ≠ export name**: discovery uses the file basename. A `@name Foo` comment overrides; don't rely on it.
- **`process` must not be `async`**, and must not both return a Promise and call `send`/`done` — the Promise resolution becomes an implicit `sendDone`.
- **Fan-out loops that ignore `await`** can overflow an edge's high-water mark silently; await `output.send` in the loop.
- **`if (!data) return;` style dead branches** from 1.x leave activations unresolved and swallow empty strings; empty string is valid data — send it.
- **Input order in fbp-spec `inputs` matters**: post control ports before firing ports, or the component fires with configuration missing.
- **Control ports don't trigger firing**: a `required` control port does not make the component wait for it at runtime; order IIPs/data correctly or handle absence explicitly. Control ports buffer the latest stream — bracketed configuration streams can be read with `getStream`, but a newer incoming stream discards the buffered one.
- **Error outports are not optional** for fallible components: without one, `output.done(err)` throws into the network instead of routing.
- **Instance state on 1.x components** (`c.servers = {}`) → move into the `getComponent` closure; add `tearDown` cleanup and keep activations open only while the resource lives.
- **Eager discovery imports**: side effects at component module top level run for every component of every dependency at registry construction. Keep component modules pure.
- **Fan-out expectations assert the last packet**: the runner records the most recent data IP per port per step; intermediate packets of a fan-out cannot be asserted in fbp-spec v1.
- **Error ports must be in `expect` to be observed**: an error IP sent to an unasserted error port vanishes and the case times out instead of failing fast. Assert with `path: $.message` + `contains`.
- **Forwarded brackets attach to actual sends, not to ports**: a data outport listed in `forwardBrackets` that receives no send during an activation stays completely silent — on an error path, only the `error` port gets the brackets and data outports receive nothing, not even empty brackets (see 3.3). Do not expect `forwardBrackets` ports to mirror brackets unconditionally.
- **IPs of one activation arrive on an edge as a single synchronous burst, and an activation can complete synchronously inside the post that completes its preconditions**: when driving sockets directly in tests, attach all waiters and collectors *before* sending any IPs, wait for the terminating event (e.g. the closing bracket), and then assert on the collected sequence. Listeners attached after the sends — even synchronously after — miss packets.
- **fbp-spec-runner CLI silently no-ops when invoked via the npm bin symlink** (its direct-invocation check compares the symlink path against the module real path). Invoke through `require.resolve` (see 4.1) until fixed; treat silent zero-output runs as failures.
- **`node --test` arguments**: pass files via an unquoted shell glob (`node --test test/*.test.js`); the directory form fails on current Node and quoted globs need newer Node than the supported floor.
- **Keep-alive connections stall `server.close()`**: a `node:http` server with open keep-alive sockets never fires its close callback. Call `closeAllConnections()` when shutting a server down, and deactivate the activation that started it (see 6.3) — otherwise `shutdown()` hangs.
- **Port 0 (OS-assigned) tests need the assigned port echoed back**: have server components emit `server.address().port`, not the requested port.
- **Type checking against a workspace checkout of `@noflo/noflo`**: declarations are build artifacts (`lib/NoFlo.d.ts`); npm-installed packages ship them, checkouts need their `npm run types` run first. Flag TS7016 on `@noflo/noflo` as an environment issue — do not disable `checkJs` to work around it.
- **WebCrypto has no MD5**: hashing needs outside the SHA-1/SHA-2 family require `node:crypto` (server-only) or an inline pure-JS implementation (multiplatform). Prefer a SHA-256 service alternative where one exists (see 3.8).
- **Legacy `@runtime noflo-nodejs` comments** in component sources are unnecessary in 2.x; drop them during conversion (discovery defaults to the `noflo` runtime).
- **Do not commit `fbp.json`** — it is a generated consumer-side cache.

# @noflo/fbp-spec-runner

In-process test runner for [fbp-spec](https://github.com/noflo/fbp-spec) testsuites, built for NoFlo components and graphs on top of the Node.js `node:test` runner.

Unlike the reference `fbp-spec` runner, which drives a running FBP runtime over the runtime protocol, this runner instantiates components and graphs directly in memory. There is no external runtime to start, no network overhead, and no dependency on Mocha, Chai, or the registry-based tooling chain. Suites produce standard TAP output via `node:test`.

## Usage

```shell
npx @noflo/fbp-spec-runner --base-dir . spec/*.yaml
```

The runner discovers components from the project under test using the [Node.js component registry](../loader-node/) (the `noflo` metadata in `package.json` and component sources under `components/`). `--base-dir` sets the project root; positional arguments are fbp-spec suite files (`.yaml` or `.json`).

Exit code is non-zero when any test case fails, and the output is plain `node:test` TAP, so it integrates with any test reporter or CI system.

## Supported fbp-spec features

- YAML suites (including multi-suite files separated by `---`) and JSON suites
- Suites with no `fixture`, running against the `topic` component directly
- Explicit fixture graphs, both `type: json` (FBP graph JSON) and `type: fbp` (FBP DSL source)
- Pairwise input/expect sequences for testing stateful components
- The full expectation operator vocabulary: `equals`, `above`, `below`, `type`, `haveKeys`, `includeKeys`, `contains`, `noterror`, with JSONPath targeting via `path`
- Suite- and case-level `skip` and `timeout` (default 2000ms)

As in the reference runner, a data packet arriving on a port named `error` fails the case unless the case expects data on that port.

Not supported (yet): bracket-stream assertions.

## Differences from the reference runner

- Tests execute in-process against NoFlo's own engine instead of a runtime speaking the FBP runtime protocol. This means browser-only components and non-NoFlo runtimes are not supported.
- Each test case runs against a freshly instantiated fixture, giving deterministic, order-independent isolation. State carries between sequence steps within a case, but not between cases.

## Programmatic use

The modules are published to [JSR](https://jsr.io/@noflo/fbp-spec-runner) and can be used separately:

```js
import { compileSpecFiles } from "@noflo/fbp-spec-runner/compiler";

compileSpecFiles(["spec/*.yaml"], { baseDir: "." });
```

- `./compiler` — compiles suites into `node:test` suites
- `./network` — deterministic in-process test case execution
- `./fixture` — fixture graph resolution for explicit `json`/`fbp` fixtures
- `./loader` — YAML/JSON suite loading and validation
- `./assertions` — expectation operator evaluation

## Vendored dependencies

To keep the runner durable against upstream registry changes, the JSONPath (`jsonpath-plus`) and YAML parsers are committed as version-pinned single-file bundles under [`vendor/`](./vendor/), with their licenses. They can be regenerated with `node utils/generate-vendors.mjs`.

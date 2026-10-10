# `@noflo/nodejs` — NoFlo host for Node.js

Command-line host for running [NoFlo](https://noflojs.org) programs on Node.js as observable, mesh-reachable runtimes. The host loads your project's graph, discovers your component libraries, and serves the running program as an [FBP Protocol 2.0](https://github.com/noflo/noflo) runtime over [Reticulum](https://reticulum.network) — inspectable and live-editable from tools like noflo-ui, over the mesh, with [Dacar](https://github.com/noflo/dacar) deciding who is allowed to do what.

This is the 2.x re-architecture of the legacy `noflo-nodejs` CLI: the 1.x runtime stack (WebSocket/WebRTC servers speaking fbp-protocol 1.x, secret-based auth, flowhub-registry pings, mDNS advertisement) is replaced by the in-tree `@noflo/runtime` speaking FBP Protocol 2.0 over Reticulum links, with Dacar capability grants instead of secrets.

## Install

```shell
$ npm install @noflo/nodejs
```

This installs the `noflo-nodejs` command-line tool and the programmatic entry. It is part of the `noflo/noflo` monorepo and shares the engine's lockstep version.

## Quickstart

Set up a NoFlo project, with component libraries installed as npm dependencies:

```shell
$ mkdir my-project && cd my-project
$ npm init
$ npm install @noflo/noflo @noflo/nodejs
$ npm install @noflo/core @noflo/strings   # whatever component libraries you need
```

Initialize a Dacar node store for the machine (authorization is mandatory — without it, every client is denied):

```shell
$ npx dacar init
```

Run a graph:

```shell
$ npx noflo-nodejs --graph graphs/MyMainGraph.json
```

The host announces itself on the mesh and prints its identity hash. Run with `--batch` to exit when the graph finishes:

```shell
$ npx noflo-nodejs --graph graphs/MyMainGraph.json --batch
```

Typical project setup via npm scripts:

```json
{
  "name": "my-project",
  "scripts": {
    "dev": "noflo-nodejs --graph ./graphs/MyGraph.json",
    "start": "noflo-nodejs --graph ./graphs/MyGraph.json --batch"
  }
}
```

## Configuration

Settings load in layers, each level overriding the previous: defaults → `~/.noflo.json` (user-level) → `.noflo.json` (project-level) → environment variables → CLI arguments → generated values. Values that differ from their default persist back into the project-level `.noflo.json` on first run, so a generated node name sticks.

| Setting | CLI flag | Environment | Default | Description |
| --- | --- | --- | --- | --- |
| `name` | `--name` | | `<package name> NoFlo runtime` | Node name announced on the mesh |
| `graph` | `--graph` | | | Path to the graph file to run (`.json` or `.fbp`) |
| `baseDir` | `--base-dir` | `PROJECT_HOME` | current directory | Project base directory used for component loading |
| `batch` | `--batch` | | off | Exit the process when the network stops |
| `identity` | | | | Path to the Reticulum identity key file, generated on first run |
| `storage` | | | `.noflo/rns` | Directory for the Reticulum transport storage |
| `rnsHost` | `--rns-host` | `RNS_HOST` | | rnsd uplink hostname, used when no shared Reticulum instance is available |
| `rnsPort` | `--rns-port` | `RNS_PORT` | | rnsd uplink TCP port |
| `dacarStore` | `--dacar-store` | `DACAR_HOME` | `~/.dacar` | Dacar node store to evaluate grants against |
| `dacarObject` | `--dacar-object` | | `noflo.runtime/<name>` | Dacar object id the runtime's commands address |
| `dacarAllRelation` | `--dacar-all-relation` | | `access` | Dacar relation whose grant on the object confers the full capability mask |
| `debug` | `--debug` | | off | Log packet events to stdout |
| `verbose` | `--verbose` | | off | Log packet contents to stdout |
| `trace` | `--trace` | | off | Record a flowtrace of the graph execution |
| `cache` | `--cache` | | off | Read the component catalog from the `fbp.json` manifest cache |
| `catchExceptions` | `--catch-exceptions` | | off | Catch uncaught exceptions, flush the trace, and exit |

Boolean flags accept both bare form (`--batch`) and explicit values (`--batch false`).

## Mesh attachment

The host connects to the Reticulum network using the ecosystem connection chain: if a local shared Reticulum instance is running (an rnsd), the host attaches to it over the shared-instance socket — the shared instance already owns the mesh interfaces. Otherwise the host opens an AutoInterface (zero-config LAN peering), adding an explicit rnsd uplink when `rnsHost`/`rnsPort` are configured. On machines with no usable network interfaces the host still runs the program — it just announces to nobody.

The host's Reticulum identity is generated on first run and persisted under the transport storage directory; peers that cache the public key keep recognizing the runtime across restarts. A corrupt key file surfaces loudly instead of being regenerated, since that would change the node's address.

## Authorization with Dacar

Access control is [Dacar](https://github.com/noflo/dacar): a decentralized, offline-first capability system where signed grants replicate over the mesh and every node evaluates locally, deny-closed. There are no secrets or allow lists in the host configuration — the Dacar node store *is* the authorization configuration, and the host reads it from the location the `dacar` CLI maintains (`DACAR_HOME`, default `~/.dacar`; override with `dacarStore`).

The runtime's commands address a single Dacar object, `noflo.runtime/<name>` by default, where `<name>` is the configured node name, slugified. Capability relations map one-to-one onto the protocol's capability bits: `graph.read`, `graph.edit`, `metadata.sync`, `telemetry.read`, `component.read`, `component.write`, `lifecycle.ctrl`, and `admin`. Additionally, the host defines the coarse relation `access`, whose grant on the object confers the full capability mask.

The examples below use the Python reference CLI, which carries the full command set (`anchor add`, `identity show`, `alias add`, `grant --no-apply`). The Node CLI shipped with `@reticulum/dacar` (`npx dacar`) speaks the same store format and covers `init`, `grant --publish`, `revoke`, `sync`, `apply`, `check`, and `grants`.

### Setting up a runtime machine

```shell
$ dacar init                     # node store + own identity, aliased `self`
$ dacar identity show            # the runtime's identity hash (print for your records)
$ dacar anchor add <admin-hash>  # trust the project administrator's identity
```

The trust anchor is the identity whose signed grant operations this machine accepts — typically the project owner. Run `dacar sync` (or receive deltas by any transport, see below) to keep the grant state current. When initializing a multi-machine deployment, share the Privacy Salt out-of-band first (`dacar init --salt dacar-salt.hex` on every node); without a shared salt the grants stored on one machine are unreadable on another.

### a) Granting a user access to the runtime

On the machine where grants are made — the administrator's machine, whose identity is the runtime machine's trust anchor — grant the user the coarse `access` relation on the runtime's object:

```shell
$ dacar alias add alice <alice-identity-hash>   # optional, human-readable alias
$ dacar grant alice access noflo.runtime/my-project
```

`access` confers the full capability mask (read, edit, telemetry, component source, lifecycle control) — the right default for a developer working on their own project. Verify locally with `dacar check alice access noflo.runtime/my-project`. For restricted roles, grant individual relations instead:

```shell
$ dacar grant alice telemetry.read noflo.runtime/my-project   # observation without edit rights
```

The grant is signed immediately with the administrator's key and applied to the local store.

### b) Getting the grant onto the machine the runtime runs on

If grants are made on a different machine than the one running the runtime, the signed delta needs to cross the gap. Two ways, both ending in the runtime host picking the state up on its next reload (or `kill -HUP`):

**Over the mesh** — the grant is signed on the admin machine and published to the plane's RFed broadcast channel; the runtime machine pulls it:

```shell
admin$ dacar grant alice access noflo.runtime/my-project --publish
runtime$ dacar sync        # pull pending deltas from the rfed channel
```

**Over any transport** — export the signed delta as a file and move it however the deployment moves bytes (USB stick, LXMF, QR code — Dacar deltas also travel as Paper Messages):

```shell
admin$ dacar grant alice access noflo.runtime/my-project --no-apply > delta.hex
# ...carry delta.hex to the runtime machine by any means...
runtime$ dacar apply delta.hex
```

After the store on the runtime machine has the grant, tell the running host to re-read it:

```shell
$ kill -HUP <noflo-nodejs-pid>    # or restart; the store is read at startup
```

The host logs `Dacar grant state reloaded`. Until a grant arrives, evaluation is deny-closed: an empty store, a missing store, or an unreachable plane means every client is denied.

### Running without a grant store

The host starts even when no Dacar store exists — useful for batch execution — but warns that every client will be denied. Initialize one with `dacar init` to make the runtime reachable by tools.

## Running multiple runtimes

Every runtime announces from its own Reticulum identity, and the identity lives in the transport storage — so each concurrent runtime instance needs its own storage, mirroring how Reticulum itself separates instances (`rnsd --configdir`):

```shell
$ noflo-nodejs --name worker-a --storage .noflo/rns-a --graph graphs/Main.json
$ noflo-nodejs --name worker-b --storage .noflo/rns-b --graph graphs/Other.json
```

Starting a second host with the same storage fails fast with the holder's pid: two transports speaking for one identity breaks addressing. A stale lock left by a crashed process is detected and broken automatically via the recorded pid.

The Dacar grant store is different: it is shared, read-only state for authorization evaluation, so any number of runtime instances can evaluate against the same `~/.dacar`.

## Component discovery

The host discovers components the same way `@noflo/loader-node` does: the project's own `components/` directory, plus every installed npm dependency that ships NoFlo components. Component signatures are harvested for the runtime's registry so clients can render real signatures before installing anything. When `--cache` is set, discovery reads the generated `fbp.json` manifest cache instead of walking `node_modules`.

## Traces

With `--trace`, the host records the execution with the engine's native trace recorder and writes a streamable trace file (the FBP Protocol 2.0 format: a topology snapshot frame followed by delta-encoded execution chunks) into the project's `.flowtrace/` directory. The file is flushed when the network ends, on `SIGTERM`/`SIGINT`, and on demand via `SIGUSR2` — send `kill -USR2` to snapshot a long-running program without stopping it.

## Signals

| Signal | Action |
| --- | --- |
| `SIGTERM`, `SIGINT` | Stop the network, flush the trace, exit |
| `SIGUSR2` | Flush the trace without stopping |
| `SIGHUP` | Re-read the Dacar grant store after an external `dacar sync` |

## Running as a library

The programmatic entry runs a graph with the runtime attached from inside an application:

```js
import { run } from "@noflo/nodejs";

const host = await run(graphModelOrPath, {
  name: "my-project",
});
// host.network is the live network; host.binding is the mesh binding
await host.stop();
```

An optional `preStart` hook runs after the host is created but before the mesh binding, e.g. for registering additional components.

## Migrating from 1.x

- The `--host`, `--port`, `--tls-key`, `--tls-cert`, `--secret`, and `--permissions` options are gone: there is no listening socket and no secret-based auth. Runtimes are addressed by their Reticulum identity and authorized by Dacar grants.
- `--protocol webrtc`, `--signaller`, `--mdns`, and `--registry` are gone: discovery is the runtime's announce on the mesh.
- `--open` is gone for now; the mesh-based noflo-ui does not need a URL launcher.
- Graphs load through `@noflo/graph`, components through the 2.x registry contract — 1.x component libraries need the modernization pass before this host can run them.
- Trace files are the streamable FBP Protocol 2.0 format (`.trace`), not the legacy flowtrace JSON.

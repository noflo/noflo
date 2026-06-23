# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
### Added
- Support for loading components that are ES Modules. Note that they must directly import `noflo/src/lib/Component` instead of `noflo` to prevent circular dependencies:

```javascript
import { Component } from 'noflo/src/lib/Component.js';

export function getComponent() {
  const c = new Component();
  // Implementation
  return c;
}
```

### Changed
- Project's unit tests are now executed using the Node.js built-in test runner

## [1.5.1] - 2026-06-20
### Changed
- NoFlo can now be imported either ES Module or CommonJS

### Added
- Basic smoketests for running from both ESM and CommonJS

## [1.5.0] - 2026-06-20
### Changed
- Improved using NoFlo directly as ES Module dependency

## [1.4.3] - 2020-12-10
### Changed
- Improved inport and outport options TypeScript definitions

## [1.4.2] - 2020-12-10
### Changed
- Made Component and Network option TypeScript definitions easier to extend when subclassing

## [1.4.1] - 2020-12-10
### Changed
- The `asPromise` function (promisified version of `noflo.asCallback`) now ships with the correct type definition

## [1.4.0] - 2020-12-10
### Changed
- Asynchronous NoFlo methods (like `createNetwork` and `network.start`) now return Promises. Callbacks are still supported as a compatibility layer.
- Component `setUp` and `tearDown` can now return a Promise instead of calling the supplied callback
- Component processing function can now return a Promise instead of calling `sendDone` or `done` (if the Promise resolves to a value, it will be sent out)
- NoFlo now ships with TypeScript type definitions
- The `src/lib` folder contains NoFlo as JavaScript Modules. `lib` is the CommonJS version
- The CommonJS version of NoFlo is now shipped as modern ES2020 instead of babelized ES5. Use Babel in your project if you need compatibility with old JS runtimes

## [1.3.0] - 2020-11-23
### Changed
- NoFlo `createNetwork` and `asCallback` now accept a `flowtrace` option to pass a [Flowtrace instance](https://github.com/flowbased/flowtrace) for retroactive debugging. Example:
- NoFlo `createNetwork` now accepts `componentLoader` and `baseDir` via options. Passing them via Graph properties is deprecated
- NoFlo `createNetwork` now defaults to the non-legacy "network drives graph" mode
- NoFlo `createNetwork` now only supports the `graph, options, callback` signature, no options given in some other order
- `noflo.Network` interface has been removed. Use `createNetwork` to instantiate networks
- CoffeeScript is no longer bundled with NoFlo. Install the CoffeeScript compiler in your project if you need to be able to load CoffeeScript components

```javascript
const { Flowtrace } = require('flowtrace');
const tracer = new Flowtrace();
noflo.createNetwork(myGraph, {
  flowtrace: tracer,
}, (err, network) => {
  // ...
  console.log(tracer.toJSON());
});
```

## [1.2.7] - 2020-11-13
### Added
- Added safeties against trying to load a falsy graph in `asCallback`
- Added safeties against trying to load unnamed components

## [1.2.6] - 2020-09-24
### Fixed
- Fixed an issue with `getSource` on Node.js

## [1.2.5] - 2020-09-24
### Fixed
- Fixed an issue with deployment automation

## [1.2.4] - 2020-09-24
### Changed
- ComponentLoader `getSource` now returns also component specs when available

## [1.2.3] - 2020-09-17
### Changed
- TypeScript components loaded on Node.js now target modern ES6

## [1.2.2] - 2020-09-17
### Added
- Added initial support for components written in TypeScript. Requires the `typescript` module to be installed

### Changed
- NoFlo ComponentLoader can now tell the supported programming languages with the `getLanguages` method
- Components written with `setSource` now return the original untranspiled source code with `getSource` also on Node.js

## [1.2.1] - 2020-09-16
### Added
- Added better error messages when trying to write to a non-existing outport in a component
- Added support for loading subgraph components even if they come from a different version of fbp-graph

## [1.2.0] - 2020-08-28
### Added
- Added support for a more standard `noflo.createNetwork(graph, options, callback)` signature, with backwards compatibility for the legacy `noflo.createNetwork(graph, callback, options)` signature
- Added optional `networkCallback` option for `noflo.asCallback` to provide access to the network instance for debugging purposes

### Changed
- Ported NoFlo from CoffeeScript to ES6

### Deprecated
- Deprecated constructing networks with `new noflo.Network`. Use `noflo.createNetwork` instead, with the following options available:

### Removed
- Removed support for `noflo.WirePattern`. WirePattern has been deprecated since 1.0, and all code using it should be migrated to the latest Process API
- Removed support for changing component icon and description statically (on class level) at run-time (i.e. `ComponentName::icon = 'new-icon'`). Component icon and description should be set in class constructor or in `getComponent` instead. Changing icon and description for a specific instance (process) is not affected and is fully supported

  - `subscribeGraph: true`: Uses `LegacyNetwork` which modifies network topology based on changes in graph. This can cause some types of errors to be silent.
  - `subscribeGraph: false`: Uses `Network`: network topology can be changed with network's methods (`addNode`, `removeEdge`, etc) and will be also written to the graph.
  For backwards compatibility reasons, `subscribeGraph` defaults to `true`. Adapt your applications to use `false` instead and start utilizing Network methods for any changes to a running graph.

## [1.1.3] - 2018-04-12
### Fixed
- Fixed issue with custom component loaders on Node.js

## [1.1.2] - 2018-03-24
### Changed
- Improved detection of when network finishes to not stop synchronous networks too early

## [1.1.1] - 2018-02-19
### Fixed
- Fixed `noflo.asComponent` handling of functions that return a `NULL`

## [1.1.0] - 2018-02-19
### Added
- Added [noflo.asComponent](https://github.com/noflo/noflo/pull/591) for easy mapping of JavaScript functions into NoFlo components. Each argument will get its own inport with the name of the argument, and output is handled based on the type of function being wrapped:

  - Regular synchronous functions: return value gets sent to `out`. Thrown errors get sent to `error`
  - Functions returning a Promise: resolved promises get sent to `out`, rejected promises to `error`
  - Functions taking a Node.js style asynchronous callback: `err` argument to callback gets sent to `error`, result gets sent to `out`

## [1.0.3] - 2017-11-24
### Added
- Added support for running arbitrary NoFlo graphs via `noflo.asCallback`. You can call this function now with either a component name, or a `noflo.Graph` instance

## [1.0.2] - 2017-11-17
### Fixed
- Fix sub-subgraph identification in network events

## [1.0.1] - 2017-11-13
### Changed
- Subgraphs re-activate themselves when receiving new packets after they've completed running
- Subgraphs now use the JavaScript implementation of Graph component also on Node.js
- NoFlo `setSource` on Node.js no longer transpiles ES6 sources using Babel. All supported Node.js versions should run ES6 without issues

## [1.0.0] - 2017-11-03
### Added
- Added _unscoped_ support for outports. Setting `scoped: false` on an outport will force all packets sent to that port to be unscoped
- Added a deprecation warning when loading legacy API components

### Changed
- The shipping NoFlo build is now using ES6 syntax, as provided by the [CoffeeScript 2.x compiler](http://coffeescript.org/). If you need to support older browsers or Node.js versions, you can transpile the code to ES5 using [Babel](https://babeljs.io/)
- The APIs deprecated in NoFlo 0.8 were removed:
- Improved errors thrown when trying to read from non-existing ports
- More information on preparing for NoFlo 1.0 can be found from [this blog post](http://bergie.iki.fi/blog/noflo-10-prep/)

  - `noflo.AsyncComponent` class -- use WirePattern or Process API instead
  - `noflo.ArrayPort` class -- use InPort/OutPort with `addressable: true` instead
  - `noflo.Port` class -- use InPort/OutPort instead
  - `noflo.helpers.MapComponent` function -- use WirePattern or Process API instead
  - `noflo.helpers.WirePattern` legacy mode -- now WirePattern always uses Process API internally
  - `noflo.helpers.WirePattern` synchronous mode -- use `async: true` and callback
  - `noflo.helpers.MultiError` function -- send errors via callback or error port
  - `noflo.InPort` process callback -- use Process API
  - `noflo.InPort` handle callback -- use Process API
  - `noflo.InPort` receive method -- use Process API getX methods
  - `noflo.InPort` contains method -- use Process API hasX methods
  - Subgraph `EXPORTS` mechanism -- disambiguate with INPORT/OUTPORT

## [0.8.6] - 2017-10-21
### Changed
- Improved error handling when trying to load a graph with misconfigured edges

### Fixed
- Fixed an issue with synchronous components causing Process API output streams to be replayed in some situations

## [0.8.5] - 2017-09-17
### Changed
- It is now possible to set individual ports to _unscoped_ mode by setting the `scoped: false` parameter. This is useful for components that mix unscoped and scoped inputs
- Ports and IP objects can now be annotated with a JSON schema for their payloads using the `schema` key. Ports with a schema annotate their IP objects automatically with the schema unless the IP object already has a specific schema
- The previous `type` key of ports is now converted to the `schema` key. The schema of a port is available via the `getSchema()` method

## [0.8.4] - 2017-07-21
### Changed
- Send newly-added IIPs even if network has finished, but not after stopping the network

## [0.8.3] - 2017-03-08
### Changed
- Don't mark the network as finished if we still have running components

## [0.8.2] - 2017-03-05
### Added
- Added [asCallback()](https://github.com/noflo/noflo/pull/538) function to embed NoFlo graphs and components into non-NoFlo applications and tests

### Changed
- Improved subgraph instantiation error handling

### Fixed
- Fixed a problem of IIPs not visible to processes when inside an IP scope

## [0.8.1] - 2017-03-02
### Fixed
- Fixed issue with Process API WirePattern emulation on deeper bracket hierarchies
- Fixed inport buffer clearing on component shutdown

## [0.8.0] - 2017-03-01
### Added
- Added deprecation warnings to several WirePattern options:
- Added `setUp` and `tearDown` methods for easier handling of custom states in components. These methods take an asynchronous callback and are recommended to be used instead of `start` and `shutdown`
- Added callbacks for component `start` and `shutdown` methods
- Added a `clear` method for inports to clear their packet buffer. Used by component `shutdown` method
- Added addressable port support to Process API
- Added callback for `Network.stop`
- Added deprecation warnings for APIs that will be removed by NoFlo 1.0. These can be made fatal by setting the `NOFLO_FATAL_DEPRECATED` environment variable. These include:
- Added IP object `scope` support to `WirePattern` to make `WirePattern` components more concurrency-friendly
- Added stream helpers for Process API input. `hasStream` checks if an input buffer contains a complete stream (matching brackets and data, or only data), `getStream` returns a complete stream of packets. These require `forwardBrackets` to be disabled for the port.

### Changed
- General availability of [Process API for NoFlo components](http://bergie.iki.fi/blog/noflo-process-api/)
- Updated headers to reflect the copyright assignment from [The Grid](https://thegrid.io) to [Flowhub UG](https://flowhub.io)
- Reimplemented `noflo.helpers.MapComponent` to use Process API internally. This helper is deprecated and components using it should be ported to Process API
- Reimplemented `noflo.helpers.WirePattern` to use Process API internally. To use the original WirePattern implementation, either pass a `legacy: true` to WirePattern function or set `NOFLO_WIREPATTERN_LEGACY` environment variable
- `postpone` and `resume`. These are still available in legacy mode but will be removed soon
- `group` collation
- `field` collation
- `async: false` option
- `component.error` method with WirePattern. Use async and error callback instead
- `component.fail` method with WirePattern. Use async and error callback instead
- `component.sendDefaults` method with WirePattern. Start your components with a NoFlo network to get defaults sent
- `noflo.helpers.MultiError`. Use error callback instead
- Outmost brackets are no longer automatically converted to `connect` and `disconnect` events. Instead, `connect` and `disconnect` are injected as needed, but only for subscribers of the legacy events
- Graph JSON schema has been moved to https://github.com/flowbased/fbp, and updated with tests.
- [babel-core](https://www.npmjs.com/package/babel-core) was removed as a dependency. Install separately for projects needing ES6 component support
- underscore.js was removed as a dependency
- `input.getData()` in Process API has been changed to fetch only packets of `data` type skipping and dropping brackets inbetween
- IP objects are strictly required to be of `noflo.IP` type
- NoFlo Graph and Journal were moved to a dedicated [fbp-graph](https://github.com/flowbased/fbp-graph) library for easier usage in other FBP projects. No changes to NoFlo interface
- NoFlo networks now emit packet events only while the network is running
- NoFlo networks can show their currently active processes with the `getActiveProcesses()` method

### Removed
- Removed WirePattern `receiveStreams` and `sendStream` options
- Removed `receiveStreams` option from `WirePattern`
- Removed support for deprecated Node.js 0.x versions

  - When sending packets to an addressable outport, the connection to send to will be selected based on the `index` attribute of the IP object
  - When reading from addressable ports, provide port name with index in format `[portname, index]`. For example: `input.getData ['in', 2]`
  - `noflo.AsyncComponent`: should be ported to Process API
  - `noflo.helpers.MapComponent`: should be ported to Process API
  - `noflo.ArrayPort`: should be ported to noflo.In/OutPort with `addressable: true`
  - `noflo.Port`: should be ported to noflo.In/OutPort
  - Calling `Network.start` or `Network.stop` without a callback
  - `noflo.InPort` `process` option: should be ported to Process API or use the `handle` option
  - `noflo.InPort` `receive` method: replaced by the `get` method
  - `noflo.InPort` `contains` method: replaced by the `has` method
  - `noflo.Graph` exports: use specific inport or outport instead
  - Additionally [component.io](https://github.com/componentjs/component) builds warn about deprecation in favor of [webpack](http://webpack.github.io/) with helpful automation available in [grunt-noflo-browser](https://www.npmjs.com/package/grunt-noflo-browser)

## [0.7.8] - 2016-06-10
### Added
- Added input buffer manipulation methods
- Added support for falsy IP object scopes
- Added support for sending values out directly with `output.send` if there is only one non-error outport

### Changed
- InternalSocket no longer re-wraps already-wrapped errors coming from downstream
- Switched NoFlo's default browser builder to webpack

## [0.7.7] - 2016-06-08
### Changed
- `input.has` now accepts a validation callback function as the last argument. All packets in buffer will be passed to this function, and `has` will return false only if something returns true for each port specified
- ComponentLoader was refactored to allow easier injection of custom loaders when dealing with bundling tools like Browserify and Webpack

### Removed
- Removed `dropEmptyBrackets` option which was conflicting with asynchronous components. This results into empty brackets being forwarded to `error` outport, so make sure error handling components don't make false alerts on those.

## [0.7.6] - 2016-06-02
### Added
- Added support for `stream` datatype in ports, allowing streams to be passed as data packets

### Changed
- NoFlo Graphs now support case sensitive mode, which is possible to trigger via options

### Fixed
- Fixed ComponentLoader caching on Node.js

## [0.7.5] - 2016-05-02
### Added
- Added automatic bracket forwarding via `forwardBrackets` option. Enabled from `in` port to `out` and `error` ports by default.

### Changed
- Empty brackets are not forwarded to ports in `dropEmptyBrackets` list (defaults to `['error']`).
- IP metadata can easily be forwarded in simple components by using `output.pass()` instead of `output.sendDone()`.

## [0.7.4] - 2016-04-07
### Changed
- Minor network starting improvement

## [0.7.3] - 2016-04-07
### Changed
- Network uptime is now calculated from the first `start` event, not from initialization

### Fixed
- Fixed error handling on broken FBP manifest data
- Fixed network start callback when there are no defaults in a graph

## [0.7.2] - 2016-04-01
### Fixed
- Fixed FBP manifest caching
- Fixed non-triggering property being applied on triggering ports
- Fixed `input.getData()` crash on ports which have no packets yet

## [0.7.1] - 2016-03-31
### Fixed
- Fixed NoFlo subgraph component in build

## [0.7.0] - 2016-03-31
### Changed
- Switched component discovery and caching from `read-installed` to [FBP manifest](https://github.com/flowbased/fbp-manifest). `fbp.json` files can be generated using `noflo-cache-preheat`.
- Component Loader `listComponents` can now return errors as first callback argument
- Control ports don't receive bracket IPs, only data
- NoFlo's InternalSocket now always handles information packets as IP Objects, with conversion to/from legacy packet events done automatically. Use `socket.on('ip', function (ip) {})` to receive IP object

  This also changes behavior related to components or graphs in custom locations. The fbp-manifest tool only finds them from the default `components/` and `graphs/` subdirectories of the project
  base directory.

## [0.6.1] - 2016-03-30
### Changed
- NoFlo's IP Objects are now available via `noflo.IP`

## [0.6.0] - 2016-03-29
### Added
- New [IP Objects](https://github.com/noflo/noflo/issues/290) feature allowing bundling and handling of groups and packet data together
- New option to enable [cloning of packets](https://github.com/noflo/noflo/pull/375) when sending to multiple outbound connections
- New [Process API](https://github.com/noflo/noflo/pull/392) which replaces `WirePattern` and makes NoFlo component programming closer to Classical FBP

### Changed
- NoFlo `createNetwork` and `loadFile` methods can return errors as the first callback argument
- Graph-level [request isolation](https://github.com/noflo/noflo/issues/373) via `IP.scope` property

### Removed
- Removed the `noflo` executable in favor of [noflo-nodejs](https://www.npmjs.com/package/noflo-nodejs)
- Removed the deprecated `LoggingComponent` baseclass

## [0.5.21] - 2015-12-03
### Changed
- Made NoFlo component cache keep Component Loader paths also relative

## [0.5.20] - 2015-12-02
### Changed
- NoFlo network instances now default to `debug` mode, meaning that errors thrown by components are available via the `process-error` event
- If there are no listeners for the network `process-error` events or socket `error` event, then they are thrown
- This change of behavior fixes issues with stale state in WirePattern networks caused by downstream exceptions
- Debug mode can be disabled with `network.setDebug(false)`

## [0.5.18] - 2015-11-30
### Changed
- Make NoFlo component cache paths relative to project root

## [0.5.17] - 2015-11-27
### Added
- Added a new `noflo-cache-preheat` tool that can be used for improving start-up times in Node.js projects with large lists of dependencies. Can be used as a `postinstall` script

## [0.5.16] - 2015-11-27
### Changed
- Update the `read-installed` package to support scoped dependencies

## [0.5.15] - 2015-11-26
### Changed
- Support for [scoped NPM packages](https://docs.npmjs.com/getting-started/scoped-packages)

## [0.5.14] - 2015-09-25
### Changed
- EcmaScript 6 support in Component Loader
- Node.js 4.x compatibility (`setSource` requires `components/` directory to exist in base directory to work)

## [0.5.13] - 2015-04-22
### Changed
- Custom componentloader support when cache mode is enabled
- Optional support for [coffee-cache](https://www.npmjs.com/package/coffee-cache) when using `--cache`

## [0.5.12] - 2015-04-19
### Added
- Add support for [io.js](https://iojs.org/)
- Add `componentName` property for components telling the component name

### Changed
- Socket events now include edge metadata
- Node.js: component list can be cached for faster start-up time. Cache file is stored in `$BASEDIR/.noflo.json`

## [0.5.11] - 2014-10-23
### Added
- Added safeties for restarted networks to WirePattern

### Changed
- On Node.js ComponentLoader `setSource` now loads components virtually from `<baseDir>/components` to support relative module loading
- Subgraphs don't get unattached ports implicitly exported any longer. Register in/outports in the graph to make them available from the outside

## [0.5.10] - 2014-10-23
### Changed
- Port names are now validated to only contain lowercase alphanumeric characters or underscores
- `ComponentLoader.load` method now calls its callback with the Node.js style `error, instance` signature to allow catching component loading issues
- Graph merging support via the graph journal
- `getSource` now returns correct type for graphs
- Subgraph networks are started when the main network starts, instead of automatically on their own timing. As a fallback they will also start when any of their ports receives a `connect`
- Networks can now be stopped and restarted at will using the `stop` and `start` methods
- The running state of a NoFlo network can be now queried with the `isRunning` method
- NoFlo networks support FBP protocol debugging via the `setDebug` and `getDebug` methods
- `Ports.add` is now chainable
- The `start` port was removed from subgraphs

These changes mean that in situations where a subgraph is used standalone without a network around it, you need to call `component.start()` manually. This is typical especially in unit tests.

## [0.5.9] - 2014-08-05
### Changed
- Hotfix reverting backwards-incompatible changes in subgraph loading, see [#229](https://github.com/noflo/noflo/issues/229).

## [0.5.8] - 2014-08-04
### Added
- Added `dropInput` option for WirePattern to drop premature data while parameters not yet received. See [#239](https://github.com/noflo/noflo/issues/239)
- Addressable ports support in WirePattern. See [details](https://github.com/noflo/noflo/issues/240#issuecomment-51094257).

### Changed
- Updated `read-installed` to the latest version
- Updated JSON Schema for NoFlo graph definition format
- Low-level functions to add and remove graph inports at run-time, see [#242](https://github.com/noflo/noflo/pull/242)

### Fixed
- Fixed several issues in connections and data synchronization
- Fixes for default port values and IIPs in subgraphs.

## [0.5.7] - 2014-07-23
### Changed
- Ports now default to *not required*. Set the port option `required: true` the port needs to be connected in order for the component to work
- `MultiError` pattern is enabled by default when using `WirePattern` and supports `forwardGroups` option for error packets.
- `WirePattern` components now deal more consistently with groups and disconnect events

## [0.5.6] - 2014-06-23
### Changed
- Custom icon support for subgraphs via the `icon` key in graph properties
- Parameter support for `WirePattern` components, allowing them to have configuration parameters that need to be set only once. Example:

```coffeescript
component = new noflo.Component
component.inPorts.add 'path',
  datatype: 'string'
  required: true
component.inPorts.add 'delay',
  datatype: 'int'
  required: false
component.inPorts.add 'line',
  datatype: 'string'
component.inPorts.add 'repeat',
  datatype: 'int'
component.outPorts.add 'out',
  datatype: 'object'
component.outPorts.add 'error',
  datatype: 'object'
noflo.helpers.WirePattern component,
  in: ['line', 'repeat']
  out: 'out'
  params: ['path', 'delay']
  async: true
, (data, groups, out, callback) ->
  path = component.params.path
  delay = if component.params.delay then component.params.delay else 0
  doSomeThing path, delay, data.line, data.repeat, (err, res) ->
    return callback err if err
    out.send res
    callback()
```

## [0.5.5] - 2014-06-20
### Added
- New `CustomizeError` helper for passing information with Error objects in NoFlo. For example:

### Fixed
- Fixed an issue with `StreamSender` affecting WirePattern components dealing with multiple levels of grouping

```coffeescript
err = new Error 'Something went wrong'
noflo.helpers.CustomizeError err,
  groups: groups
  foo: 'bar'
c.error err
```

## [0.5.4] - 2014-06-11
### Added
- Added support for multiple outputs and reading/writing substreams as solid objects in `WirePattern`.
- Added `load` outport handing in `WirePattern` to make it a complete replacement for `AsyncComponent`.
- Added helpers for advanced error handling, see [#185](https://github.com/noflo/noflo/issues/185).
- Added `caching` option for OutPorts that makes them re-send their latest value to any newly-added connections, see [#151](https://github.com/noflo/noflo/issues/151) for example use cases.

### Changed
- The new [noflo-api-updater](https://www.npmjs.org/package/noflo-api-updater) tool assists in updating components to the latest NoFlo API
- `GroupedInput` helper has been renamed to `WirePattern` due to a bigger collection of synchronization options.
- The `WirePattern` helper has a new `ordered` option for choosing whether the output should be in same order as the incoming packets
- Options `group` and `forwardGroups` of `WirePattern` are made independent, so make sure to use `forwardGroups: true` if you need this feature together with `group: true`.

## [0.5.3] - 2014-05-31
### Added
- New component helpers for easier authoring

### Changed
- `integer` is accepted as an alias for the `int` datatype for ports
- `buffer` is now an accepted port datatype
- The Continuous Integration setup for NoFlo now runs on both [Linux](https://travis-ci.org/noflo/noflo) and [Windows](https://ci.appveyor.com/project/bergie/noflo)

### Fixed
- Fixed a bug with ComponentLoader `getSource` method when invoked early on in execution

The `MapComponent` helper is usable for synchronous components that operate on a single inport-outport combination:
```coffeescript
c = new noflo.Component
  inPorts:
    in:
      datatype: 'number'
  outPorts:
    out:
      datatype: 'number'
noflo.helpers.MapComponent c, (data, groups, out) ->
  out.send data * 2
```
The `GroupedInput` helper assists in building components that need to synchronize multiple inputs by groups:
```coffeescript
c = new noflo.Component
  inPorts:
    x:
      datatype: 'number'
    y:
      datatype: 'number'
  outPorts:
    radius:
      datatype: 'number'
noflo.helpers.GroupedInput c,
  in: ['x', 'y']
  out: 'radius'
, (data, groups, out) ->
  out.send Math.sqrt(data.x**2 + data.y**2)
```
`GroupedInput` can also synchronize via specific fields of object-type packets:
```coffeescript
helpers.GroupedInput c,
  in: ['user', 'message']
  out: 'signedMessage'
  field: 'request'
, (data, groups, out) ->
  out.send
    request: data.request
    user: data.user.name
    text: data.message.text
user.send {request: 123, id: 42, name: 'John'}
message.send {request: 123, id: 17, text: 'Hello world'}
{ request: 123, user: 'John', text: 'Hello world'}
```

## [0.5.2] - 2014-05-08
### Fixed
- Fixed a minor packaging issue

## [0.5.1] - 2014-05-08
### Changed
- Custom component loaders can be registered programmatically using the `registerLoader` method of NoFlo's ComponentLoader
- `contains` method for buffered inports returns the number of data packets the buffer has
- [Call stack exhaustion](https://github.com/noflo/noflo/issues/156) on very large graphs has been fixed
- The `error` outport of AsyncComponents now sends the group information of the original input together with the error
- The `error` method of regular ports can now also handle groups as a second parameter
- Ports can now list their attached sockets (by array index) via the `listAttached` method
- `function` is now an accepted datatype for ports
- There is now initial support for making connections to and from *addressable* ports with a specified index

In the FBP format, these can be specified with the bracket syntax:
```fbp
SomeNode OUT[2] -> IN OtherNode
'foo' -> OPTS[1] OtherNode
```
In the JSON file these are defined in connections by adding a integer to the `index` key of the `src` or `tgt` definition.
The NoFlo Graph class provides these with the following methods:
```
addEdgeIndex(str outNode, str outPort, int outIndex, str inNode, str inPort, int inIndex, obj metadata)
addInitiaIndex(mixed data, str inNode, str inPort, int inIndex, obj metadata)
```
If indexes are not specified, the fall-back behavior is to automatically index the connections based on next available slot in the port.

## [0.5.0] - 2014-03-28
### Added
- New methods for manipulating Graph metadata:
- New Graph transaction API for grouping graph changes. Transactions can be observed
- New Journal class, for following Graph changes and restoring earlier revisions. Currently supports `undo` and `redo`

### Changed
- Support for setting the default `baseDir` of Node.js NoFlo environment with `NOFLO_PROJECT_ROOT` env var (defaults to current working directory)
- Support for loading graph definitions via AJAX on browser-based NoFlo
- Support for delayed initialization of Subgraph components via ComponentLoader
- Component instances now get the node's metadata passed to the `getComponent` function
- Graph exports can now be renamed, and emit `addExport`, `removeExport`, and `renameExport` events
- [New port API](https://github.com/noflo/noflo/issues/136) allowing better addressability and metadata
- Graph's published ports are now declared in two separate `inports` and `outports` arrays to [reduce ambiguity](https://github.com/noflo/noflo/issues/118)
- [New component API](https://github.com/noflo/noflo/issues/97) allowing simpler component definition in both CoffeeScript and JavaScript:
- Support for dealing with component source code via ComponentLoader `setSource` and `getSource` methods

  - `setProperties`
  - `setInportMetadata`
  - `setOutportMetadata`
  - `setGroupMetadata`
  - `setNodeMetadata`
  - `setEdgeMetadata`
  - `startTransaction`
  - `endTransaction`
With the new API component ports can be declared with:
```coffeescript
@inPorts = new noflo.InPorts
@inPorts.add 'in', new noflo.InPort
  datatype: 'object'
  type: 'http://schema.org/Person'
  description: 'Persons to be processed'
  required: true
  buffered: true
```
The `noflo.Ports` objects emit `add` and `remove` events when ports change. They also support passing port information as options:
```coffeescript
@outPorts = new noflo.OutPorts
  out: new noflo.OutPort
    datatype: 'object'
    type: 'http://schema.org/Person'
    description: 'Processed person objects'
    required: true
    addressable: true
```
The input ports also allow passing in an optional *processing function* that gets called on information packets events.
```js
var noflo = require('noflo');
exports.getComponent = function() {
  var c = new noflo.Component();
  c.inPorts.add('in', function(event, payload) {
    if (packet.event !== 'data')
      return;
    // Do something with the packet, then
    c.outPorts.out.send(packet.data);
  });
  c.outPorts.add('out');
  return c;
};
```

## [0.4.4] - 2014-02-04
### Changed
- Support for CoffeeScript 1.7.x on Node.js

## [0.4.3] - 2013-12-06
### Changed
- ArrayPorts with attached sockets now return `true` for `isAttached` checks. There is a separate `canAttach` method for checking whether more can be added
- Icon support was added for both libraries and components using the set from [Font Awesome](http://fortawesome.github.io/Font-Awesome/icons/)
- Subgraphs now support closing their internal NoFlo network via the `shutdown` method
- Component Loader is able to load arbitrary graphs outside of the normal package manifest registration via the `loadGraph` method
- Component Loader of the main NoFlo network is now carried across subgraphs instead of instantiating locally
- Libraries can provide a custom loader for their components by registering a `noflo.loader` key in the manifest pointing to a CommonJS module
- Exported ports can now contain metadata
- It is possible to create named groups of nodes in a NoFlo graph, which can be useful for visual editors
- Components have an `error` helper method for sending errors to the `error` outport, or throwing them if that isn't attached

  - For libraries, register via the `noflo.icon` key in your `package.json` (Node.js libraries) or `component.json` (browser libraries)
  - For components, provide via the `icon` attribute

## [0.4.2] - 2013-09-28
### Changed
- Easier debugging: port errors now contain the name of the NoFlo graph node and the port

## [0.4.1] - 2013-09-25
### Changed
- NoFlo components can now implement a `shutdown` method which is called when they're removed from a network
- Graphs can contain additional metadata in the `properties` key
- NoFlo networks have now a `start` and a `stop` method for starting and stopping execution

## [0.4.0] - 2013-07-31
### Added
- New BDD tests written with [Mocha](http://visionmedia.github.io/mocha/) that can be run on both browser and server
- Adding IIPs to a graph will now emit a `addInitial` event instead of an `addEdge` event

### Changed
- The NoFlo engine has been made available client-side via the [Component](https://github.com/component/component) system
- All components have been moved to [various component libraries](http://noflojs.org/library/)
- [Grunt scaffold](https://github.com/bergie/grunt-init-noflo) for easily creating NoFlo component packages including cross-platform test automation
- NoFlo's internal FBP parser was removed in favor of the [fbp](https://github.com/noflo/fbp) package
- The `display` property of nodes in the [JSON format](https://github.com/bergie/noflo#noflo-graph-file-format) was removed in favor of the more flexible `metadata` object
- Support for renaming nodes in a NoFlo graph via the `renameNode` method
- Graph's `removeEdge` method allows specifying both ends of the connection to prevent ambiguity
- IIPs can now be removed using the `removeInitial` method, which fires a `removeInitial` event instead of `removeEdge`
- NoFlo Networks now support delayed starting
- The `isBrowser` method on the main NoFlo interface tells whether NoFlo is running under browser or Node.js
- Support for running under Node.js on Windows

Browser support:
Changes to components:
Development tools:
File format support:
Internals:

## [0.3.4] - 2013-07-05
### Added
- New `LoggingComponent` base class for component libraries

Internals:

## [0.3.3] - 2013-04-09
### Changed
- Build process was switched from Cake to [Grunt](http://gruntjs.com/)
- NoFlo is no longer tested against Node.js 0.6

Development:

## [0.3.2] - 2013-04-09
### Changed
- Ports now support optional type information, allowing editors to visualize compatible port types
- NoFlo ComponentLoader is now able to register new components and graphs and update package.json files accordingly
- [noflo-test](https://npmjs.org/package/noflo-test) provides a framework for testing NoFlo components

NoFlo internals:
  ``` coffeescript
  @inPorts =
    in: new noflo.ArrayPort 'object'
    times: new noflo.Port 'int'
  @outPorts =
    out: new noflo.Port 'string'
  ```
  ``` coffeescript
  loader = new noflo.ComponentLoader __dirname
  loader.registerComponent 'myproject', 'SayHello', './components/SayHello.json', (err) ->
    console.error err if err
  ```
New libraries:

## [0.3.1] - 2013-02-13
### Changed
- The NoFlo `.fbp` parser now [guards against recursion](https://github.com/bergie/noflo/pull/57) on inline subgraphs
- NoFlo subgraphs now inherit the directory context for component loading from the NoFlo process that loaded them
- Exported ports in NoFlo graphs are now supported also in NoFlo-generated JSON files
- Nodes in NoFlo graphs can now contain additional metadata to be used for visualization purposes. For example, in FBP format graphs:
- [noflo-filesystem](https://npmjs.org/package/noflo-filesystem) provides advanced file system components
- [noflo-github](https://npmjs.org/package/noflo-github) provides components for interacting with the GitHub service
- [noflo-git](https://npmjs.org/package/noflo-git) provides components for Git revision control system
- [noflo-oembed](https://npmjs.org/package/noflo-oembed) provides oEmbed protocol support
- [noflo-redis](https://npmjs.org/package/noflo-redis) provides Redis database components

NoFlo internals:
  ``` fbp
  Read(ReadFile:foo) OUT -> IN Display(Output:foo)
  ```
  will cause both the _Read_ and the _Display_ node to contain a `metadata.routes` field with an array containing `foo`. Multiple routes can be specified by separating them with commas
New component libraries:

## [0.3.0] - 2012-12-19
### Changed
- NoFlo's web-based user interface has been moved to a separate [noflo-ui](https://github.com/bergie/noflo-ui) repository
- The `noflo` shell command now uses `STDOUT` for debug output (when invoked with `--debug`) instead of `STDERR`
- [DOT language](http://en.wikipedia.org/wiki/DOT_language) output from NoFlo was made more comprehensive
- NoFlo graphs can now alias their internal ports to more user-friendly names when used as subgraphs. When aliases are used, the other free ports are not exposed via the _Graph_ component. This works in both FBP and JSON formats:
- All code was migrated from 4 spaces to 2 space indentation as recommended by [CoffeeScript style guide](https://github.com/polarmobile/coffeescript-style-guide). Our CI environment safeguards this via [CoffeeLint](http://www.coffeelint.org/)
- Events emitted by ArrayPorts now contain the socket number as a second parameter
- Initial Information Packet sending was delayed by `process.nextTick` to ensure possible subgraphs are ready
- The `debug` flag was removed from NoFlo _Network_ class, and the networks were made EventEmitters for more flexible monitoring
- The `isSubgraph` method tells whether a _Component_ is a subgraph or a regular code component
- Subgraphs loaded directly by _ComponentLoader_ no longer expose their `graph` port
- The `addX` methods of _Graph_ now return the object that was added to the graph
- NoFlo networks now emit `start` and `end` events
- Component instances have the ID of the node available at the `nodeId` property
- Empty strings and other falsy values are now allowed as contents of Initial Information Packets
- _ReadGroup_ now sends the group to a `group` outport, and original packet to `out` port
- _GetObjectKey_ can now send packets that don't contain the specified key to a `missed` port instead of dropping them
- _SetPropertyValue_ provides the group hierarchy received via its `in` port when sending packets out
- _Kick_ can now optionally send out the packet it received via its `data` port when receiving a disconnect on the `in` port. Its `out` port is now an ArrayPort
- _Concat_ only clears its buffers on disconnect when all inports have connected at least once
- _SplitStr_ accepts both regular expressions (starting and ending with a `/`) and strings for splitting
- _ReadDir_ and _Stat_ are now AsyncComponents that can be throttled
- _MakeDir_ creates a directory at a given path
- _DirName_ sends the directory name for a given file path
- _CopyFile_ copies the file behind the path received via the `source` port to the path received via the `destination` port
- _FilterPacket_ allows filtering packets by regular expressions sent to the `regexp` port. Non-matching packets are sent to the `missed` port
- _FirstGroup_ allows you to limit group hierarchies of packets to a single level
- _LastPacket_ sends the last packet it received when getting a disconnect to the inport
- _MergeGroups_ collects grouped packets from its inports, and sends them out together once each inport has sent data with the same grouping
- _SimplifyObject_ simplifies the object structures outputted by the _CollectGroups_ component
- _CountSum_ sums together numbers received from different inports and sends the total out
- _SplitInSequence_ sends each packet to only one of its outports, going through them in sequence
- _CollectUntilIdle_ collects packets it receives, waits a given time if there are new packets, and if not, sends them out
- [noflo-liquid](https://npmjs.org/package/noflo-liquid) provides Liquid Templating functionality
- [noflo-markdown](https://npmjs.org/package/noflo-markdown) provides Markdown conversion
- [noflo-diffbot](https://npmjs.org/package/noflo-diffbot) provides access to the Diffbot screen-scraping service

User interface:
  - Events from subgraphs are also visible when the `noflo` command is used with the additional `-s` switch
  - Contents of packets are shown when the `noflo` command is used with the additional `-v` switch
  - Shell debug output is no colorized for easier reading
  For FBP format graphs:
  ``` fbp
  EXPORT=INTERNALPROCESS.PORT:EXTERNALPORT
  ```
  For JSON format graphs:
  ``` json
  {
    "exports": [
      {
        "private": "INTERNALPROCESS.PORT",
        "public": "EXTERNALPORT"
      }
    ]
  }
  ```
NoFlo internals:
Changes to core components:
New core components:
New component libraries:

## [0.2.0] - 2012-11-13
### Added
- New _ComponentLoader_ to support loading components and subgraphs to installed NPM modules

### Changed
- Message Queue components were moved to [noflo-mq](https://npmjs.org/package/noflo-mq)
- HTML parsing components were moved to [noflo-html](https://npmjs.org/package/noflo-html)
- XML parsing components were moved to [noflo-html](https://npmjs.org/package/noflo-xml)
- YAML parsing components were moved to [noflo-html](https://npmjs.org/package/noflo-yaml)
- Web Server components were moved to [noflo-webserver](https://npmjs.org/package/noflo-webserver)
- CouchDB components were moved to [noflo-couchdb](https://npmjs.org/package/noflo-couchdb)
- BaseCamp API components were moved to [noflo-basecamp](https://npmjs.org/package/noflo-basecamp)
- Restful Metrics components were moved to [noflo-restfulmetrics](https://npmjs.org/package/noflo-restfulmetrics)
- The `noflo` command-line tool now has a new `list` command for listing components available for a given directory, for example: `$ noflo list .`
- NoFlo's own codebase was moved to direct requires making the NPM installation simpler
- [daemon](https://npmjs.org/package/daemon) dependency was removed from NoFlo's command-line tools
- _Merge_ only disconnects once all of its inports have disconnected
- _Concat_ only disconnects once all of its inports have disconnected
- _CompileString_'s `in` port is now an ArrayPort
- _GroupByObjectKey_ also supports boolean values for the matched keys
- _ReadDir_ disconnects after reading a directory
- _Drop_ allows explicitly dropping packets in a graph. The component performs no operations on the data it receives

The main change in 0.2 series was component packaging support and the fact that most component with external dependencies were moved to their own NPM packages:
To use the components, install the corresponding NPM package and change the component's name in your graph to include the package namespace. For example, `yaml/ParseYaml` for the _ParseYaml_ component in the _noflo-yaml_ package
User interface:
NoFlo internals:
Changes to core components:
New core components:


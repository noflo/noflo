#!/usr/bin/env node
clc = require 'cli-color'
http = require 'http'
lib = require '../index'
noflo = require 'noflo'
trace = require('noflo-runtime-base').trace
runtime = require 'noflo-runtime-websocket'
flowhub = require 'flowhub-registry'
querystring = require 'querystring'
path = require 'path'

program = (require 'yargs')
  .options(
    graph:
      description: 'Path to a graph file to start'
    'capture-output':
      default: false
      description: 'Catch writes to stdout and send to the FBP protocol client'
      type: 'boolean'
    'catch-exceptions':
      default: true
      description: 'Catch exceptions and report to the FBP protocol client'
      type: 'boolean'
    debug:
      default: false
      description: 'Start the runtime in debug mode'
      type: 'boolean'
    verbose:
      default: false
      description: 'Log in verbose format'
      type: 'boolean'
    cache:
      default: false
      description: 'Enable component cache'
      type: 'boolean'
    batch:
      default: false
      description: 'Exit when the graph finished'
    trace:
      default: false
      description: 'Record flowtrace. If batch is enabled, will'
    ide:
      description: 'Url where the noflo-ui runs.'
    uuid:
      description: 'Runtime UUID'
    host:
      default: 'autodetect'
      describe: 'Hostname or IP for the runtime. Use "autodetect" or "autodetect(<iface>)" for dynamic detection.'
    port:
      default: 3569
      describe: 'Port for the runtime.'
      type: 'number'
    secret:
      describe: 'Secret string to be used for the connection.'
    permissions:
      default: 'protocol:component,protocol:runtime,protocol:graph,protocol:network,component:getsource,component:setsource'
      describe: 'Permissions'
    register:
      default: true
      description: 'Register the runtime with Flowhub'
      type: 'boolean'
  )
  .usage('Usage: $0 [options]')
  .version(lib.getLibraryConfig().version, 'V').alias('V', 'version')
  .help('h').alias('h', 'help')
  .wrap(null)
  .argv

program.permissions = program.permissions.split ','

require 'coffee-cache' if program.cache

program.id = program.uuid if program.uuid
delete program.uuid

stored = lib.getStored program
baseDir = process.env.PROJECT_HOME or process.cwd()
interval = 10 * 60 * 1000
flowhubRuntime = null
if program.register
  unless stored.id
    console.error 'No configuration found at ' + lib.getStoredPath() + '. Please run noflo-nodejs-init first if you want the runtime to showup on flowhub. You can also pass a UUID via --uuid'
    process.exit 1
  try
    flowhubRuntime = new flowhub.Runtime
      label: stored.label
      id: stored.id
      user: stored.user
      secret: stored.secret
      protocol: 'websocket'
      address: 'ws://' + stored.host + ':' + stored.port
      type: 'noflo-nodejs'
  catch e
    console.log 'Failed to initialize runtime with configuration:', e.message
    process.exit 1

addDebug = (network, verbose, logSubgraph) ->

  identifier = (data) ->
    result = ''
    result += "#{clc.magenta.italic(data.subgraph.join(':'))} " if data.subgraph
    result += clc.blue.italic data.id
    result

  network.on 'connect', (data) ->
    return if data.subgraph and not logSubgraph
    console.log "#{identifier(data)} #{clc.yellow('CONN')}"

  network.on 'begingroup', (data) ->
    return if data.subgraph and not logSubgraph
    console.log "#{identifier(data)} #{clc.cyan('< ' + data.group)}"

  network.on 'data', (data) ->
    return if data.subgraph and not logSubgraph
    if verbose
      console.log "#{identifier(data)} #{clc.green('DATA')}", data.data
      return
    console.log "#{identifier(data)} #{clc.green('DATA')}"

  network.on 'endgroup', (data) ->
    return if data.subgraph and not logSubgraph
    console.log "#{identifier(data)} #{clc.cyan('> ' + data.group)}"

  network.on 'disconnect', (data) ->
    return if data.subgraph and not logSubgraph
    console.log "#{identifier(data)} #{clc.yellow('DISC')}"

startServer = (program, defaultGraph) ->
  server = http.createServer ->

  rt = runtime server,
    defaultGraph: defaultGraph
    baseDir: baseDir
    captureOutput: program.captureOutput
    catchExceptions: program.catchExceptions
    permissions: stored.permissions
    cache: program.cache

  tracer = new trace.Tracer {}

  process.on 'SIGUSR2', () ->
    return console.log 'ERROR: Tracing not enabled' if not program.trace
    tracer.dumpFile null, (err, fname) ->
      console.log 'Wrote flowtrace to:', fname

  rt.network.on 'addnetwork', (network) ->
    tracer.attach network if program.trace
    addDebug network, program.verbose, program.defaultGraph if program.debug

    if not program.catchExceptions
      network.on 'process-error', (err) ->
        console.error err.id, err.error
        console.log err.stack if err.stack?
        process.exit 1

    if program.batch and program.graph
      network.on 'end', (event) ->
        onDone = () ->
          process.exit 0
        cleanup = () ->
          server.close onDone
          setTimeout 2000, onDone # workaround for node.js 0.12 where on open connections does not fire
        if program.trace
          tracer.dumpFile null, (err, fname) ->
            console.log 'Wrote flowtrace to:', fname
            cleanup()
        else
          cleanup()

  server.listen stored.port, ->
    address = 'ws://' + stored.host + ':' + stored.port
    params = 'protocol=websocket&address=' + address
    params += '&secret=' + stored.secret if stored.secret
    console.log 'NoFlo runtime listening at ' + address
    console.log 'Using ' + baseDir + ' for component loading'
    console.log 'Live IDE URL: ' + stored.ide + '#runtime/endpoint?' + querystring.escape(params)
    if flowhubRuntime
      # Register the runtime with Flowhub so that it will show up in the UI
      flowhubRuntime.register (err, ok) ->
        if err
          console.log 'Registration with Flowhub failed: ' + err.message
          return
        console.log 'Registered with Flowhub. The Runtime should now be accessible in the UI'
        # Ping Flowhub periodically to let the user know that the
        # runtime is still available
        setInterval ->
          flowhubRuntime.ping()
        , interval
        return
    return
  return


if program.graph
  program.graph = path.resolve process.cwd(), program.graph
  console.log 'Loading main graph: ' + program.graph
  noflo.graph.loadFile program.graph, (err, graph) ->
    if err
      console.log err
      process.exit 1
    startServer program, graph
else
  startServer program, noflo.graph.createGraph "main"


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
uuid = require 'uuid'

packageInfo = lib.getLibraryConfig()

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
  .version('version', packageInfo.version).alias('V', 'version')
  .help('h').alias('h', 'help')
  .wrap(null)
  .argv

require 'coffee-cache' if program.cache

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

startServer = (program, defaultGraph, flowhubRuntime, callback) ->
  server = http.createServer ->

  rt = runtime server,
    defaultGraph: defaultGraph
    baseDir: program.baseDir
    captureOutput: program.captureOutput
    catchExceptions: program.catchExceptions
    permissions: program.permissions
    cache: program.cache
    id: program.id
    namespace: program.namespace

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
          setTimeout onDone, 2000 # workaround for node.js 0.12 where on open connections does not fire
        if program.trace
          tracer.dumpFile null, (err, fname) ->
            console.log 'Wrote flowtrace to:', fname
            cleanup()
        else
          cleanup()

  server.listen program.port, ->
    if program.register
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
        , program.pingInterval

    return callback null

liveUrl = (options) ->
  address = 'ws://' + options.host + ':' + options.port
  params = 'protocol=websocket&address=' + address
  params += '&id=' + options.id if options.id
  params += '&secret=' + options.secret if options.secret
  u = options.ide + '#runtime/endpoint?' + querystring.escape(params)
  return u

getRuntime = (options) ->
  rt = new flowhub.Runtime
    label: options.label
    id: options.id
    user: options.user
    secret: options.secret
    protocol: 'websocket'
    address: 'ws://' + options.host + ':' + options.port
    type: 'noflo-nodejs'
  return rt

normalizeOptions = (program) ->
  program.permissions = program.permissions.split ','
  program.id = program.uuid if program.uuid
  delete program.uuid
  program = lib.getStored program

  program.id = process.env.NOFLO_RUNTIME_ID if not program.id

  program.id = uuid.v4() if not program.id
  program.baseDir = process.env.PROJECT_HOME or process.cwd()
  program.pingInterval = 10 * 60 * 1000
  program.graph = path.resolve process.cwd(), program.graph if program.graph

  l = new noflo.ComponentLoader program.baseDir
  program.namespace = l.getModulePrefix packageInfo.name

  return program

exports.main = main = () ->
  program = normalizeOptions program

  flowhubRuntime = getRuntime program

  callback = (err) ->
    if err
      console.error err
      process.exit 1

    console.log "NoFlo runtime listening at ws://#{program.host}:#{program.port}"
    if program.secret
      console.log 'Live IDE URL: ', liveUrl program

  if program.register
    return callback new Error "Cannot register without a user" if not program.user
    return callback new Error "Cannot register without a secret" if not program.secret

  if not program.secret
    console.log "WARNING: Runtime secret not specified, will not be able to connect to runtime"

  console.log 'Using ' + program.baseDir + ' for component loading'
  if program.graph
    console.log 'Loading main graph: ' + program.graph
    noflo.graph.loadFile program.graph, (err, graph) ->
      return callback err if err
      startServer program, graph, flowhubRuntime, callback
  else
    startServer program, noflo.graph.createGraph("main"), flowhubRuntime, callback

main() if not module.parent

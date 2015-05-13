#!/usr/bin/env node
clc = require 'cli-color'
http = require 'http'
lib = require '../index'
noflo = require 'noflo'
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
    ide:
      description: 'Url where the noflo-ui runs.'
    host:
      describe: 'Hostname or IP for the runtime. Use "autodetect" or "autodetect(<iface>)" for dynamic detection.'
    port:
      describe: 'Port for the runtime.'
      type: 'number'
    secret:
      describe: 'Secret string to be used for the connection.'
    permissions:
      default: 'protocol:component,protocol:runtime,protocol:graph,protocol:network,component:getsource,component:setsource'
      describe: 'Permissions'
  )
  .usage('Usage: $0 [options]')
  .version(lib.getLibraryConfig().version, 'V').alias('V', 'version')
  .help('h').alias('h', 'help')
  .wrap(null)
  .argv

program.permissions = program.permissions.split ','

require 'coffee-cache' if program.cache

stored = lib.getStored program
baseDir = process.env.PROJECT_HOME or process.cwd()
interval = 10 * 60 * 1000
if !stored.id
  console.error 'No configuration found at ' + lib.getStoredPath() + '. Please run noflo-nodejs-init first if you want the runtime to showup on flowhub.'
  if !program.graph
    # Since we don't register with flowhub, we need to run a graph
    console.error 'No default graph given either. Exiting.'
    process.exit 1
else
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

  rt.network.on 'addnetwork', (network) ->
    addDebug network, program.verbose, program.defaultGraph if program.debug
    if program.batch and program.graph
      network.on 'end', (event) ->
        server.close()

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
  noflo.graph.loadFile program.graph, (graph) ->
    startServer program, graph
else
  startServer program, noflo.graph.createGraph "main"


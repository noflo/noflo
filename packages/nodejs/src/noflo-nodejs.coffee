#!/usr/bin/env node
program = require 'commander'
clc = require "cli-color"
http = require 'http'
lib = require '../index'
noflo = require 'noflo'
runtime = require 'noflo-runtime-websocket'
flowhub = require 'flowhub-registry'
querystring = require 'querystring'
path = require 'path'

program
  .version(lib.getLibraryConfig().version)
  .option('--graph <graph>', 'Path to a graph file to start', null)
  .option('--capture-output [true/false]', 'Catch writes to stdout and send to the FBP protocol client (default = false)', false)
  .option('--catch-exceptions [true/false]', 'Catch exceptions and report to the FBP protocol client  (default = true)', true)
  .option('--debug [true/false]', 'Start the runtime in debug mode (default = false)', false)
  .option('--verbose [true/false]', 'Log in verbose format (default = false)', false)
  .option('--cache [true/false]', 'Enable component cache (default = false)', false)
  .option('--batch [true/false]', 'Exit when the graph finished (default = false)', false)
  .option('--host <hostname>', 'Hostname or IP for the runtime. Use "autodetect" or "autodetect(<iface>)" for dynamic detection.', null)
  .option('--port <port>', 'Port for the runtime', parseInt, null)
  .option('--secret <secret>', 'Secret string to be used for the connection.', null)
  .option('--permissions <permissions>', 'Permissions', ((val) -> val.split(',')), 'protocol:component,protocol:runtime,protocol:graph,protocol:network,component:getsource,component:setsource')
  .option('--ide <url>', 'Url where the noflo-ui runs.', null)
  .parse process.argv

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
  startServer program, null


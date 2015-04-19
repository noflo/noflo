#!/usr/bin/env node
nofloRoot = "#{__dirname}/.."
noflo = require "../lib/NoFlo"
cli = require "cli"
clc = require "cli-color"
path = require "path"
{_} = require "underscore"

cli.enable "help"
cli.enable "version"
cli.enable "glob"
cli.setApp "#{nofloRoot}/package.json"

# Non-interactive processing
cli.parse
  interactive: ['i', 'Start an interactive NoFlo shell']
  debug: ['debug', 'Start NoFlo in debug mode']
  verbose: ['v', 'Log in verbose format']
  subgraph: ['s', 'Log subgraph events']
  cache: ['cache', 'Enable cache']

showPorts = (ports) ->
  displayPorts = []
  ports = ports.ports if ports.ports
  for name, implementation of ports
    continue if name in ['_events', 'ports']
    displayPorts.push name.toUpperCase()
  displayPorts

showComponent = (component, path, instance, callback) ->
  unless instance.isReady()
    instance.once 'ready', ->
      showComponent component, path, instance, callback
    return
  console.log ''
  console.log "#{component} (#{path})"
  console.log instance.description if instance.description
  if instance.inPorts
    console.log 'Inports:', showPorts(instance.inPorts).join ', '
  if instance.outPorts
    console.log 'Outports:', showPorts(instance.outPorts).join ', '

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

cli.main (args, options) ->
  if options.interactive
    process.argv = [process.argv[0], process.argv[1]]
    shell = require "#{nofloRoot}/lib/shell"

  options.cache = false unless options.cache

  if options.cache
    try
      require 'coffee-cache'
    catch e
      console.log "Install 'coffee-cache' to improve start-up time"

  return unless cli.args.length

  if cli.args.length is 2 and cli.args[0] is 'list'
    baseDir = path.resolve process.cwd(), cli.args[1]
    loader = new noflo.ComponentLoader baseDir, options
    loader.listComponents (components) ->
      todo = components.length
      _.each components, (path, component) ->
        instance = loader.load component, (err, instance) ->
          if err
            console.log err
            return
          showComponent component, path, instance, ->
            todo--
            process.exit 0 if todo is 0
    return

  for arg in cli.args
    if arg.indexOf(".json") is -1 and arg.indexOf(".fbp") is -1
      console.error "#{arg} is not a NoFlo graph file, skipping"
      continue

    baseDir = process.cwd()
    if process.env.NOFLO_PROJECT_ROOT
      baseDir = process.env.NOFLO_PROJECT_ROOT

    arg = path.resolve baseDir, arg
    noflo.loadFile arg,
      baseDir: baseDir
      cache: options.cache
    , (network) ->
      addDebug network, options.verbose, options.subgraph if options.debug

      return unless options.interactive
            
      shell.app.network = network
      shell.app.setPrompt network.graph.name

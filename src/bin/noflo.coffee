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
    listen: ['l', 'Start NoFlo server on this port', 'number']
    interactive: ['i', 'Start an interactive NoFlo shell']
    debug: ['debug', 'Start NoFlo in debug mode']
    verbose: ['v', 'Log in verbose format']

showComponent = (component, path, instance, callback) ->
    unless instance.isReady()
        instance.once 'ready', ->
            showComponent component, path, instance, callback
        return
    console.log ''
    console.log "#{component} (#{path})"
    console.log instance.description if instance.description
    if instance.inPorts
        console.log 'Inports:', _.keys(instance.inPorts).join ', '
    if instance.outPorts
        console.log 'Outports:', _.keys(instance.outPorts).join ', '

addDebug = (network, verbose) ->

  identifier = clc.blue.italic

  network.on 'connect', (data) ->
    console.log "#{identifier(data.id)} #{clc.yellow('CONN')}"

  network.on 'begingroup', (data) ->
    console.log "#{identifier(data.id)} #{clc.cyan('< ' + data.group)}"

  network.on 'data', (data) ->
    console.error "#{identifier(data.id)} #{clc.green('DATA')}" unless verbose
    console.error "#{identifier(data.id)} #{clc.green('DATA')}", data.data if verbose

  network.on 'endgroup', (data) ->
    console.log "#{identifier(data.id)} #{clc.cyan('> ' + data.group)}"

  network.on 'disc', (data) ->
    console.log "#{identifier(data.id)} #{clc.yellow('DISC')}"

cli.main (args, options) ->
    if options.interactive
        process.argv = [process.argv[0], process.argv[1]]
        shell = require "#{nofloRoot}/lib/shell"
    return unless cli.args.length

    if cli.args.length is 2 and cli.args[0] is 'list'
        baseDir = path.resolve process.cwd(), cli.args[1]
        loader = new noflo.ComponentLoader baseDir
        loader.listComponents (components) ->
            todo = components.length
            _.each components, (path, component) ->
                instance = loader.load component, (instance) ->
                    showComponent component, path, instance, ->
                        todo--
                        process.exit 0 if todo is 0
        return

    for arg in cli.args
        if arg.indexOf(".json") is -1 and arg.indexOf(".fbp") is -1
            console.error "#{arg} is not a NoFlo graph file, skipping"
            continue
        arg = path.resolve process.cwd(), arg
        noflo.loadFile arg, (network) ->
            addDebug network, options.verbose if options.debug

            return unless options.interactive
            
            shell.app.network = network
            shell.app.setPrompt network.graph.name

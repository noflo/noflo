#!/usr/bin/env node
nofloRoot = "#{__dirname}/.."
noflo = require "noflo"
cli = require "cli"
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

cli.main (args, options) ->
    if options.interactive
        process.argv = [process.argv[0], process.argv[1]]
        shell = require "#{nofloRoot}/lib/shell"
    return unless cli.args.length

    if cli.args.length is 2 and cli.args[0] is 'list'
        baseDir = path.resolve process.cwd(), cli.args[1]
        loader = new noflo.ComponentLoader baseDir
        loader.listComponents (components) ->
            todo = 0
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
            return unless options.interactive
            
            shell.app.network = network
            shell.app.setPrompt network.graph.name
        , options.debug

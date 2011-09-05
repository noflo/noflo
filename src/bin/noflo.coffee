#!/usr/bin/env node
nofloRoot = "#{__dirname}/.."
noflo = require "noflo"
cli = require "cli"

cli.enable "help"
cli.enable "version"
cli.enable "glob"
cli.enable "daemon"
cli.setApp "#{nofloRoot}/package.json"

# Non-interactive processing
cli.parse
    listen: ['l', 'Start NoFlo server on this port', 'number']
    interactive: ['i', 'Start an interactive NoFlo shell']

cli.main (args, options) ->
    if options.interactive
        process.argv = [process.argv[0], process.argv[1]]
        shell = require "#{nofloRoot}/lib/shell" 
    return unless cli.args.length

    for arg in cli.args
        if arg.indexOf(".json") is -1
            console.error "#{arg} is not a NoFlo graph file, skipping"
            continue
        noflo.loadFile "#{nofloRoot}/#{arg}", (network) ->
            return unless options.interactive
            
            shell.app.network = network
            shell.app.setPrompt network.graph.name

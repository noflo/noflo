noflo = require 'noflo'
parser = require 'js-yaml'

class ParseYaml extends noflo.Component
    constructor: ->
        @inPorts =
            in: new noflo.Port()
        @outPorts =
            out: new noflo.Port()

        @inPorts.in.on "data", (data) =>
            @outPorts.out.send parser.load data
        @inPorts.in.on "disconnect", =>
            @outPorts.out.disconnect()

exports.getComponent = -> new ParseYaml

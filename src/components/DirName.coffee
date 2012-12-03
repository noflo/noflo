path = require 'path'
noflo = require "../../lib/NoFlo"

class DirName extends noflo.Component
    constructor: ->
        @inPorts =
            in: new noflo.Port()
        @outPorts =
            out: new noflo.Port()

        @inPorts.in.on 'data', (data) =>
            @outPorts.out.send path.dirname data

        @inPorts.in.on 'disconnect', =>
            @outPorts.out.disconnect()

exports.getComponent = -> new DirName

noflo = require "noflo"
xml2js = require "xml2js"

class ParseXml extends noflo.Component
    constructor: ->
        @inPorts =
            in: new noflo.Port()
        @outPorts =
            out: new noflo.Port()

        xml = ""
        @inPorts.in.on "data", (data) ->
            xml += data
        @inPorts.in.on "disconnect", =>
            @parseXml xml
            xml = ""

    parseXml: (xml) ->
        target = @outPorts.out
        parser = new xml2js.Parser
        parser.on "end", (parsed) ->
            target.send parsed
        parser.parseString xml

exports.getComponent = -> new ParseXml

noflo = require "noflo"
xml2js = require "xml2js"

class ParseXml extends noflo.Component
    constructor: ->
        @options = # defaults recommended by xml2js docs
            normalize: false
            trim: false
            explicitRoot: true

        @inPorts =
            in: new noflo.Port()
            options: new noflo.Port()
        @outPorts =
            out: new noflo.Port()

        xml = ""
        @inPorts.in.on "data", (data) ->
            xml += data
        @inPorts.in.on "disconnect", =>
            @parseXml xml
            xml = ""

        @inPorts.options.on "data", (data) =>
            @setOptions data

    setOptions: (options) ->
        throw "Options is not an object" unless typeof options is "object"
        for own key, value of options
            @options[key] = value

    parseXml: (xml) ->
        target = @outPorts.out
        parser = new xml2js.Parser(@options)
        parser.on "end", (parsed) ->
            target.send parsed
            target.disconnect()
        parser.parseString xml

exports.getComponent = -> new ParseXml

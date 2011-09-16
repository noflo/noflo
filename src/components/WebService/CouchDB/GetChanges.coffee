noflo = require "noflo"

class GetChanges extends noflo.Component
    constructor: ->
        @connection = null
        @options = null
        @defaults =
            feed: "continuous"
            heartbeat: 1000
        @request = null
        @streamData = ""

        @inPorts =
            connection: new noflo.Port()
            option: new noflo.ArrayPort()
        @outPorts =
            out: new noflo.ArrayPort()

        @inPorts.connection.on "data", (data) =>
            @connection = data
            do @getChanges if @options

        @inPorts.option.on "data", (data) =>
            @setOption data
            do @getChanges if @connection

    setOption: (option) ->
        if typeof option is "object"
            @options = option
            return

        @options = @defaults unless @options
        optionParts = option.split "="
        @options[optionParts[0]] = optionParts[1]

    getQuery: ->
        queries = []
        for key, value of @options
            queries.push "#{key}=#{value}"
        return "?#{queries.join('&')}"

    streamToLines: () ->
        newline = @streamData.indexOf "\n"
        return if newline is -1
        
        line = @streamData.substr(0, newline).trim()
        @streamData = @streamData.substr newline + 1

        if line.length
            @outPorts.out.send JSON.parse line

        do @streamToLines

    getChanges: ->
        do @request.end if @request

        url = "#{@connection.uri.pathname}/_changes/#{@getQuery()}"
        @request = @connection.request "GET", url
        @request.on "data", (data) =>
            @streamData += data
            do @streamToLines

        @request.on "end", =>
            # TODO: Try to reconnect?
            @outPorts.out.disconnect() 

exports.getComponent = -> new GetChanges

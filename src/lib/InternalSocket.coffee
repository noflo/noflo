# By default we use NoFlo-internal sockets for connections between workers
events = require "events"

class InternalSocket extends events.EventEmitter
    constructor: ->
        @connected = false
        @groups = []

    getId: ->
        if @from and not @to
            return "#{@from.process.id}.#{@from.port}:ANON"
        return "ANON:#{@to.process.id}.#{@to.port}" unless @from
        "#{@from.process.id}.#{@from.port}:#{@to.process.id}.#{@to.port}"

    connect: ->
        @connected = true
        @emit "connect", @

    beginGroup: (group) ->
        @groups.push group
        @emit "begingroup", group

    send: (data) ->
        @emit "data", data

    endGroup: ->
        @emit "endgroup", @groups.pop()

    disconnect: ->
        @connected = false
        @emit "disconnect", @

    isConnected: ->
        @connected

exports.InternalSocket = InternalSocket

exports.createSocket = ->
    new InternalSocket()

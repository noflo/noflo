# By default we use NoFlo-internal sockets for connections between workers
events = require "events"

class InternalSocket extends events.EventEmitter
    connected: false
    id: null

    getId: ->
        if @from and not @to
            return "#{@from.process.id}.#{@from.port}:ANON"
        return "ANON:#{@to.process.id}.#{@to.port}" unless @from
        "#{@from.process.id}.#{@from.port}:#{@to.process.id}.#{@to.port}"

    connect: (id) ->
        @connected = true
        @id = id
        @emit "connect", @

    send: (data) ->
        @emit "data", data

    disconnect: ->
        @id = null
        @connected = false
        @emit "disconnect", @

    isConnected: ->
        @connected

exports.InternalSocket = InternalSocket

exports.createSocket = ->
    new InternalSocket()

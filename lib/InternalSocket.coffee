# By default we use NoFlo-internal sockets for connections between workers
events = require "events"

class InternalSocket extends events.EventEmitter
    connected: false

    connect: ->
        @connected = true
        @emit "connect", @

    send: (data) ->
        @emit "data", data

    disconnect: ->
        @connected = false
        @emit "disconnect", @

    isConnected: ->
        @connected

exports.InternalSocket = InternalSocket

exports.createSocket = ->
    new InternalSocket()

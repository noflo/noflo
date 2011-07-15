# By default we use NoFlo-internal sockets for connections between workers
events = require "events"

class internalSocket extends events.EventEmitter
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

exports.createSocket = ->
    new internalSocket()

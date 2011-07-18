events = require "events"

class Port extends events.EventEmitter
    socket: null

    connect: (socket) ->
        @socket = socket
        @socket.on "connect", =>
            @emit "connect", socket
        @socket.on "data", (data) =>
            @emit "data", data
        @socket.on "disconnect", =>
            @emit "disconnect", socket
            @disconnect()

    disconnect: ->
        @socket = null

    isConnected: ->
        unless @socket
            return false
        @socket.isConnected()

exports.Port = Port

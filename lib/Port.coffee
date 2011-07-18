class Port
    socket: null

    connect: (socket) ->
        @socket = socket

    disconnect: (socket) ->
        @socket = null

    isConnected: ->
        unless @socket
            return false
        @socket.isConnected()

exports.Port = Port

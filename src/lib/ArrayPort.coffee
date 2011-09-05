port = require "./Port"

class ArrayPort extends port.Port
    constructor: (name) ->
        @sockets = []

    attach: (socket) ->
        @sockets.push socket
        @attachSocket socket

    detach: (socket) ->
        if @sockets.indexOf(socket) is -1
            return

        @emit "detach", @socket

        @sockets.splice @sockets.indexOf(socket), 1

    send: (data, id, socketId = null) ->
        if socketId is null
            @sockets.forEach (socket, index) =>
                @send data, id, index
            return

        unless @sockets[socketId]
            throw new Error "No socket '#{socketId}' available"

        return @sockets[socketId].send data if @isConnected socketId

        @sockets[socketId].on "connect", =>
            @sockets[socketId].send data
        @sockets[socketId].connect id

    disconnect: (socketId = null) ->
        if socketId is null
            @sockets.forEach (socket) ->
                socket.disconnect()
            return     

        return unless @sockets[socketId]
        @sockets[socketId].disconnect()

    isConnected: (socketId = null) ->
        if socketId is null
            connected = true
            @sockets.forEach (socket) =>
                unless socket.isConnected()
                    connected = false
            return connected

        unless @sockets[socketId]
            return false
        @sockets[socketId].isConnected()

exports.ArrayPort = ArrayPort

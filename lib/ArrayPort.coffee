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

    send: (data, socketId = 0) ->
        unless @sockets[socketId]
            throw new Error "No socket '#{socketId}' available"

        return @sockets[socketId].send data if @isConnected socketId

        console.log @sockets

        @sockets[socketId].on "connect", =>
            @sockets[socketId].send data
        @sockets[socketId].connect()

    disconnect: (socketId = 0) ->
        return unless @sockets[socketId]
        @sockets[socketId].disconnect()

    isConnected: (socketId = 0) ->
        unless @sockets[socketId]
            return false
        @sockets[socketId].isConnected()

exports.ArrayPort = ArrayPort

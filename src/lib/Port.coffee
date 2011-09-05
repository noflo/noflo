events = require "events"

class Port extends events.EventEmitter
    constructor: (name) ->
        @name = name
        @socket = null
        @from = null

    attach: (socket) ->
        throw new Error "#{@name}: Socket already attached #{@socket.getId()} - #{socket.getId()}" if @socket
        @socket = socket

        @attachSocket socket

    attachSocket: (socket) ->
        @emit "attach", socket

        @from = socket.from
        socket.on "connect", =>
            @emit "connect", socket
        socket.on "data", (data) =>
            @emit "data", data
        socket.on "disconnect", =>
            @emit "disconnect", socket

    detach: (socket) ->
        @emit "detach", @socket
        @from = null
        @socket = null

    send: (data, id) ->
        throw new Error "No connection available" unless @socket

        return @socket.send data if @isConnected()

        @socket.once "connect", =>
            @socket.send data
        @socket.connect id

    connect: (id) ->
        throw new Error "No connection available" unless @socket
        @socket.connect id

    disconnect: ->
        return unless @socket
        @socket.disconnect()

    isConnected: ->
        unless @socket
            return false
        @socket.isConnected()

exports.Port = Port

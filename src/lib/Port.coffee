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
        socket.on "begingroup", (group) =>
            @emit "begingroup", group
        socket.on "data", (data) =>
            @emit "data", data
        socket.on "endgroup", (group) =>
            @emit "endgroup", group
        socket.on "disconnect", =>
            @emit "disconnect", socket

    connect: ->
        throw new Error "No connection available" unless @socket
        do @socket.connect

    beginGroup: (group) ->
        throw new Error "No connection available" unless @socket

        return @socket.beginGroup group if @isConnected()

        @socket.once "connect", =>
            @socket.beginGroup group
        do @socket.connect

    send: (data) ->
        throw new Error "No connection available" unless @socket

        return @socket.send data if @isConnected()

        @socket.once "connect", =>
            @socket.send data
        do @socket.connect

    endGroup: ->
        throw new Error "No connection available" unless @socket
        do @socket.endGroup

    disconnect: ->
        return unless @socket
        @socket.disconnect()

    detach: (socket) ->
        @emit "detach", @socket
        @from = null
        @socket = null

    isConnected: ->
        unless @socket
            return false
        @socket.isConnected()

exports.Port = Port

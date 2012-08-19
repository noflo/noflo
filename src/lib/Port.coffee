events = require "events"

class Port extends events.EventEmitter
    constructor: (name) ->
        @name = name
        @socket = null
        @from = null
        @isGettingReady = false
        @groups = []
        @data = []
        @buffer = []

        @on "ready", () =>
            if @isGettingReady
                @isGettingReady = false

                for call in @buffer
                    for group in call.groups
                        @beginGroup(group)

                    for datum in call.data
                        @send(datum)

                    for group in call.groups
                        @endGroup()

                    @disconnect()

                @buffer = []

    attach: (socket) ->
        throw new Error "#{@name}: Socket already attached #{@socket.getId()} - #{socket.getId()}" if @socket
        @socket = socket

        @attachSocket socket

    attachSocket: (socket) ->
        @emit "attach", socket

        @from = socket.from
        socket.setMaxListeners 0
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
        if @isGettingReady
            @groups.push(group)
            return

        throw new Error "No connection available" unless @socket

        return @socket.beginGroup group if @isConnected()

        @socket.once "connect", =>
            @socket.beginGroup group
        do @socket.connect

    send: (data) ->
        if @isGettingReady
            @data.push(data)
            return

        throw new Error "No connection available" unless @socket

        return @socket.send data if @isConnected()

        @socket.once "connect", =>
            @socket.send data
        do @socket.connect

    endGroup: ->
        if @isGettingReady
            return

        throw new Error "No connection available" unless @socket
        do @socket.endGroup

    disconnect: ->
        if @isGettingReady
            buffer =
                groups: @groups
                data: @data
            @buffer.push(buffer)

            @groups = []
            @data = []

            return

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

    isAttached: ->
        @socket isnt null

exports.Port = Port

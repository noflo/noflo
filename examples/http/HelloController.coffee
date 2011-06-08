# Simple controller that says hello, user

outSocket = null
dataSocket = null

inRequest = null
options = null

exports.getInputs = ->
    in: (socket) ->
        socket.on "data", (request) ->
            inRequest = request
            options =
                locals:
                    string: "Hello, #{request.req.remoteUser}"

            dataSocket.connect()
            outSocket.connect()

exports.getOutputs = ->
    out: (socket) ->
        outSocket = socket
        socket.on "connect", ->
            socket.send inRequest
            socket.disconnect()
    data: (socket) ->
        dataSocket = socket
        socket.on "connect", ->
            socket.send options
            socket.disconnect()

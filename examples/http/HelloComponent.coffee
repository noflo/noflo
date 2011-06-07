# This component receives a request and writes "Hello, world" into it

outSocket = null

exports.getInputs = ->
    in: (socket) ->
        socket.on "data", (request) ->
            request.res.write "Hello, World"
            outSocket.on "connect", ->
                outSocket.send request
                outSocket.disconnect()
            outSocket.connect()

exports.getOutputs = ->
    out: (socket) -> outSocket = socket

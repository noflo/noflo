# This component receives a request and a string on the input ports, writes
# that string to the request's response and forwards the request

string = null
inRequest = null
outSocket = null

exports.getInputs = ->
    string: (socket) ->
        localString = ""
        socket.on "data", (data) ->
            localString += data
        socket.on "disconnect", ->
            string = localString
            if inRequest
                outSocket.connect()

    in: (socket) ->
        socket.on "data", (request) ->
            inRequest = request
        socket.on "disconnect", ->
            if string
                inRequest.res.write string
                outSocket.connect()

exports.getOutputs = ->
    out: (socket) ->
        outSocket = socket
        socket.on "connect", ->
            socket.send inRequest
            socket.disconnect()

# This component receives a request and a string on the input ports, writes
# that string to the request's response and forwards the request

string = ""
inRequest = null
outSocket = null

exports.getInputs = ->
    string: (socket) ->
        socket.on "data", (data) ->
            string += data
    in: (socket) ->
        socket.on "data", (request) ->
            inRequest = request
            inRequest.res.write string
        socket.on "disconnect", ->
            outSocket.connect()

exports.getOutputs = ->
    out: (socket) ->
        outSocket = socket
        socket.on "connect", ->
            socket.send inRequest
            socket.disconnect()

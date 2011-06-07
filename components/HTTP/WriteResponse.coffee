# This component receives a request and a string on the input ports, writes
# that string to the request's response and forwards the request

outSocket = null
string = ""

exports.getInputs = ->
    string: (socket) ->
        socket.on "data", (data) ->
            string += data
    in: (socket) ->
        socket.on "data", (request) ->
            request.res.write string
            socket.on "disconnect", ->
                outSocket.on "connect", ->
                    outSocket.send request
                    outSocket.disconnect()
                outSocket.connect()

exports.getOutputs = ->
    out: (socket) -> outSocket = socket

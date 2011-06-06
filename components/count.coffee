# The count component receives input on a single input port, and sends the
# number of data items received to the output port when the input socket
# disconnects

countSocket = null

handleInput = (socket) ->
    count = 0
    socket.on "connect", ->
        socket.on "data", (data) ->
            count++
        socket.on "disconnect", ->
            countSocket.on "connect", ->
                countSocket.send count
                countSocket.disconnect()
            countSocket.connect()

handleOutput = (socket) ->
    countSocket = socket

exports.getInputs = ->
    input: handleInput

exports.getOutputs = ->
    count: handleOutput

# The count component receives input on a single input port, and sends the
# number of data items received to the output port when the input socket
# disconnects

countSocket = null

handleInput = (socket) ->
    count = null
    socket.on "connect", ->
        socket.on "data", (data) ->
            if count is null
                count = 0
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

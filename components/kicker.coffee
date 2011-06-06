# The count component receives input on a single input port, and sends the
# number of data items received to the output port when the input socket
# disconnects

data = null

handleOutput = (socket) ->
    socket.on "initialize", ->
        socket.on "connect", ->
            socket.send data
            socket.disconnect()
        socket.connect()

exports.initialize = (config) ->
    if config.data
        data = config.data

exports.getInputs = ->
    null

exports.getOutputs = ->
    output: handleOutput

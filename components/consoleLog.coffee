# The consoleLog component receives input on a single input port, and sends
# the data items directly to console.log
handleInput = (socket) ->
    socket.on "connect", ->
        socket.on "data", (data) ->
            console.log data

exports.getInputs = ->
    input: handleInput

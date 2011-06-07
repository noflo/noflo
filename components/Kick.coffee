# This component generates a single packet and sends in to the output port.
# Mostly usable for debugging, but can also be useful for starting up
# networks.
exports.getOutputs = ->
    output: (socket) ->
        socket.on "connect", ->
            socket.send null
            socket.disconnect()
        socket.connect()

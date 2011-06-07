# This component receives a HTTP request (req, res) combination on
# on input, and runs the connect.profiler middleware for that

connect = require "connect"

outSocket = null

exports.getInputs = ->
    in: (socket) ->
        socket.on "data", (request) ->
            connect.profiler() request.req, request.res, () ->
                outSocket.on "connect", ->
                    outSocket.send request
                    outSocket.disconnect()

                outSocket.connect()

exports.getOutputs = ->
    out: (socket) -> outSocket = socket

# This component receives a HTTP request (req, res) combination on
# on input, and runs the connect.profiler middleware for that

connect = require "connect"

outSocket = null
inRequest = null

exports.getInputs = ->
    in: (socket) ->
        socket.on "data", (request) ->
            inRequest = request
            connect.profiler() request.req, request.res, () ->
                outSocket.connect()

exports.getOutputs = ->
    out: (socket) ->
        outSocket = socket
        socket.on "connect", ->
            socket.send inRequest
            socket.disconnect()

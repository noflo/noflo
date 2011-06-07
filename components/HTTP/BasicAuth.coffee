# This component receives a HTTP request (req, res) combination on
# on input, and runs the connect.basicAuth middleware for that

connect = require "connect"

outSocket = null

authenticate = (login, password) ->
    login is "user" and password is "pass"

exports.getInputs = ->
    in: (socket) ->
        socket.on "data", (request) ->
            connect.basicAuth(authenticate) request.req, request.res, () ->
                outSocket.on "connect", ->
                    outSocket.send request
                    outSocket.disconnect()

                outSocket.connect()

exports.getOutputs = ->
    out: (socket) -> outSocket = socket

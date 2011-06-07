# This component receives a port and host, and initializes a HTTP server
# for that combination. It sends out a request/response pair for each HTTP
# request it receives

http = require "connect"
reqSocket = null

exports.getInputs = ->
    # Listen receives a packet containing a port to listen to
    listen: (socket) ->
        socket.on "data", (data) ->
            reqSocket.on "connect", ->
                server = http.createServer (req, res) ->
                    reqSocket.send
                        req: req
                        res: res
                server.listen data

                server.on "close", ->
                    reqSocket.disconnect()

            reqSocket.connect()

exports.getOutputs = ->
    # Request sends an object containing req, res and next objects
    request: (socket) -> reqSocket = socket

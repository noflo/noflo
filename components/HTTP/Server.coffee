noflo = require "noflo"
http = require "connect"

class Server extends noflo.Component
    description: "This component receives a port and host, and initializes a HTTP server for that combination. It sends out a request/response pair for each HTTP request it receives"

    constructor: ->
        @server = null

        @inPorts =
            listen: new noflo.Port()
        @outPorts =
            request: new noflo.Port()

        @inPorts.listen.on "data", (data) =>
            @server = http.createServer (req, res) =>
                @outPorts.request.send
                    req: req
                    res: res
                @outPorts.request.disconnect()
            @server.listen data

exports.getComponent = ->
    new Server()

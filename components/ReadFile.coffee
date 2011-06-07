# The ReadFile component receives a filename on the soure port, and sends
# contents the specified file to the out port. In case of errors the error
# message will be sent to the error port

fs = require "fs"

outSocket = null
errSocket = null

readFile = (fileName) ->
    outSocket.on "connect", ->
        fs.readFile fileName, "utf-8", (err, data) ->
            if err
                if errSocket
                    errSocket.on "connect", ->
                        errSocket.send err.message
                        errSocket.disconnect()
                    errSocket.connect()
                    outSocket.disconnect()
                return

            outSocket.send data
            outSocket.disconnect()

    outSocket.connect()

handleInput = (socket) ->
    socket.on "data", (data) ->
        readFile data

handleOutput = (socket) ->
    outSocket = socket

exports.getInputs = ->
    source: handleInput

exports.getOutputs = ->
    out: handleOutput
    error: (socket) ->
        errSocket = socket

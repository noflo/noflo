# The fileReader component receives a filename on an input port, and sends
# each line of the specified file to the output port

fs = require "fs"

outSocket = null
errSocket = null

readFile = (fileName, socket) ->
    socket.on "connect", ->
        fs.readFile fileName, (err, data) ->
            if err
                if errSocket
                    errSocket.on "connect", ->
                        errSocket.send err.message
                        errSocket.disconnect()
                    errSocket.connect()
                return

            # TODO: Split by line
            socket.send data
            socket.disconnect()

    socket.connect()

handleInput = (socket) ->
    socket.on "data", (data) ->
        unless outSocket
            timer = setTimeout ->
                if outSocket
                    readFile data, outSocket
                    clearTimeout timer
            , 200
        else
            readFile data, outSocket

handleOutput = (socket) ->
    outSocket = socket

exports.getInputs = ->
    input: handleInput

exports.getOutputs = ->
    output: handleOutput
    error: (socket) ->
        errSocket = socket

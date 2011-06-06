# The fileReader component receives a filename on an input port, and sends
# each line of the specified file to the output port

fs = require "fs"

outSocket = null
errSocket = null

readFile = (fileName, socket) ->
    socket.on "connect", ->
        fs.readFile fileName, "utf-8", (err, data) ->
            if err
                if errSocket
                    errSocket.on "connect", ->
                        errSocket.send err.message
                        errSocket.disconnect()
                    errSocket.connect()
                    socket.disconnect()
                return

            data.split("\n").forEach (line) ->
                socket.send line
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
